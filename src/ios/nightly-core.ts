/**
 * The host-side nightly TestFlight admission core, shared by every app whose
 * release is dispatched from the Mac mini.
 *
 * Two questions, answered from GitHub's own records rather than from memory:
 *
 *   1. May an automated release start now? At most one per local calendar day
 *      (or per configured slot of the day), whatever happened to it, and never
 *      while a previous upload's fate is unknown. The reservation is written *before* dispatch, so a timeout, a
 *      crash or a lost response never buys a second attempt.
 *   2. What did the last release actually upload? Judged from the upload step
 *      inside each attempt, not from a run's overall conclusion: a failed rerun
 *      must not hide a build an earlier attempt already sent to App Store
 *      Connect, and a step that started and did not finish may have sent one.
 *
 * Deliberately self-contained, with no imports at all. It runs from a pinned
 * copy in each app's host runtime, where no `node_modules` is reachable, so
 * `morpheus ios nightly-core --write <file>` vendors the compiled module and
 * records the version it came from. Notification delivery, incident hooks, the
 * installer and each app's names and time window belong to the app's adapter.
 *
 * Extracted from darwin-health/evo #307 and #309 without changing behaviour.
 */

export interface Step {
  name: string;
  conclusion: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface Job {
  name: string;
  conclusion: string | null;
  run_attempt?: number;
  completed_at?: string | null;
  steps?: Step[];
}

export interface Run {
  id: number;
  run_attempt: number;
  created_at: string;
  updated_at: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  display_title?: string;
}

/** The job that uploads, and the one step inside it that reaches App Store Connect. */
export interface UploadNames {
  job: string;
  step: string;
}

export type UploadState = "uploaded" | "uncertain" | "none";

export interface Upload<R extends Run = Run> {
  state: Exclude<UploadState, "none">;
  attempt: number;
  at: string | null;
  run: R;
  time: number;
}

export interface AdmissionConfig {
  /** IANA zone whose calendar day bounds one automated release. */
  zone: string;
  /**
   * Local minutes into the admission period: admission opens at `start`, closes
   * before `end`. The period is the calendar day unless `slotMinutes` divides it.
   */
  window: { start: number; end: number };
  /**
   * Divide each local day into slots of this many minutes (a divisor of 1440,
   * e.g. 360 for four slots) and admit one automated release per slot instead of
   * one per day; `window` is then relative to the slot's start and must close
   * before the slot ends, with room for the release to be created inside it. An
   * open incident or an active run defers within the slot's window; an unchanged
   * `main` spends the slot. Absent, the period is the whole day. Any other value
   * is refused rather than silently reinterpreted as a day.
   */
  slotMinutes?: number;
  /** The run title the release workflow gives an automated dispatch for `nonce`. */
  title: (nonce: string) => string;
}

export interface DayEntry {
  status: "observed" | "no-changes" | "reserved" | "dispatched";
  run?: number;
  sha?: string;
  nonce?: string;
  baseline?: string;
  at?: string;
  actualSha?: string;
}

export interface State {
  version: 1;
  activatedAt: string;
  days: Record<string, DayEntry>;
  notifications: Record<string, unknown>;
  health: string;
}

/** What the admission decision needs from the outside world. */
export interface AdmissionDeps<R extends Run = Run> {
  /** An open incident that owns the release lane; optional for apps without one. */
  hasIncident?: () => Promise<boolean>;
  main: () => Promise<string>;
  lastUpload: (runs: R[]) => Promise<(R & { head_sha: string }) | null>;
  uncertainUpload: (runs: R[]) => Promise<Upload<R> | null>;
  changes: (base: string | undefined, head: string) => Promise<{ changed: boolean }>;
  dispatch: (nonce: string) => Promise<unknown>;
}

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;

export function localTime(value: string | number | Date, zone: string): { day: string; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(value)).map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

/**
 * The admission period `value` falls in, keyed for `state.days`, and the minute
 * within it. Day-long periods keep the plain `YYYY-MM-DD` key, so existing
 * state and run titles are unchanged; slots append their local start time,
 * e.g. `2026-10-01T0600`.
 */
export function periodOf(value: string | number | Date, config: Pick<AdmissionConfig, "zone" | "slotMinutes" | "window">): { key: string; minute: number } {
  const { day, minute } = localTime(value, config.zone);
  if (config.slotMinutes === undefined) return { key: day, minute };
  const size = config.slotMinutes;
  if (!(Number.isInteger(size) && size > 0 && size < 1440 && 1440 % size === 0)) {
    throw Error(`slotMinutes must be a positive divisor of 1440 below 1440, not ${String(size)}`);
  }
  if (config.window && config.window.end > size) {
    throw Error(`window.end (${config.window.end}) must not exceed slotMinutes (${size}); a dispatch at the slot's end would be observed into the next slot`);
  }
  const start = Math.floor(minute / size) * size;
  const hh = String(Math.floor(start / 60)).padStart(2, "0");
  const mm = String(start % 60).padStart(2, "0");
  return { key: `${day}T${hh}${mm}`, minute: minute - start };
}

export function initialState(now: string): State {
  return { version: 1, activatedAt: now, days: {}, notifications: {}, health: "ok" };
}

/**
 * What one attempt's jobs say about an App Store Connect upload: `uploaded`
 * when the upload step completed successfully, `uncertain` when it ran and did
 * not, and `none` when a pre-upload gate left it skipped or absent.
 */
export function uploadOutcome(jobs: Job[], names: UploadNames): { state: UploadState; at?: string | null } {
  const job = jobs.find((j) => j.name === names.job);
  if (!job) return { state: "none" };
  const step = (job.steps || []).find((s) => s.name === names.step);
  const at = step?.completed_at || job.completed_at || null;
  if (step ? step.conclusion === "success" : job.conclusion === "success") return { state: "uploaded", at };
  if (step?.started_at && ["failure", "cancelled", "timed_out"].includes(step.conclusion ?? "")) return { state: "uncertain", at };
  return { state: "none" };
}

/** Every attempt of one run, not just the latest. `jobs` must cover all attempts. */
export function uploadsOf<R extends Run>(run: R, jobs: Job[], names: UploadNames): Upload<R>[] {
  const attemptOf = (job: Job) => job.run_attempt ?? run.run_attempt;
  return [...new Set(jobs.map(attemptOf))].sort((a, b) => a - b)
    .map((attempt) => ({ attempt, ...uploadOutcome(jobs.filter((j) => attemptOf(j) === attempt), names) }))
    .filter((u): u is { attempt: number; state: "uploaded" | "uncertain"; at?: string | null } => u.state !== "none")
    .map((u) => ({ state: u.state, attempt: u.attempt, at: u.at ?? null, run, time: Date.parse(u.at ?? run.updated_at) }));
}

/**
 * Upload evidence across runs, oldest first, ordered by when the upload itself
 * completed rather than by a run's overall conclusion or `updated_at`.
 */
export async function uploadEvidence<R extends Run>(
  runs: R[], allJobs: (run: R) => Promise<Job[]>, names: UploadNames, before = Infinity,
): Promise<Upload<R>[]> {
  const found: Upload<R>[] = [];
  for (const run of [...runs].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))) {
    // A run's updated_at bounds every job completion inside it, so once a
    // confirmed upload is newer, no earlier run can hold a later one.
    if (found.some((e) => e.state === "uploaded" && e.time >= Date.parse(run.updated_at))) break;
    found.push(...uploadsOf(run, await allJobs(run), names).filter((u) => u.time < before));
  }
  return found.sort((a, b) => a.time - b.time);
}

export async function lastUpload<R extends Run>(
  runs: R[], allJobs: (run: R) => Promise<Job[]>, names: UploadNames, before = Infinity,
): Promise<(R & { uploadedAt: string | null; uploadAttempt: number }) | null> {
  const last = (await uploadEvidence(runs, allJobs, names, before)).filter((e) => e.state === "uploaded").at(-1);
  return last ? { ...last.run, uploadedAt: last.at, uploadAttempt: last.attempt } : null;
}

/** An ambiguous upload newer than the last confirmed one; admission fails closed on it. */
export async function uncertainUpload<R extends Run>(
  runs: R[], allJobs: (run: R) => Promise<Job[]>, names: UploadNames,
): Promise<Upload<R> | null> {
  const evidence = await uploadEvidence(runs, allJobs, names);
  const confirmed = evidence.filter((e) => e.state === "uploaded").at(-1);
  return evidence.find((e) => e.state === "uncertain" && (!confirmed || e.time > confirmed.time)) ?? null;
}

/**
 * Tie each reservation to the run GitHub created for it. The daily identity
 * survives main changing between reading its SHA and GitHub accepting the
 * dispatch; the workflow's exact-main preflight verifies the SHA it chose.
 */
export function reconcile<R extends Run>(state: State, runs: R[], now: string, config: AdmissionConfig): void {
  for (const entry of Object.values(state.days)) {
    if (!["reserved", "dispatched"].includes(entry.status) || entry.run) continue;
    const matches = runs.filter((r) => r.display_title === config.title(entry.nonce ?? ""));
    if (matches.length > 1) throw Error("Multiple runs claim the daily reservation; inspect GitHub before proceeding");
    const [match] = matches;
    if (match) { entry.run = match.id; entry.actualSha = match.head_sha; }
    else if (Date.parse(now) - Date.parse(entry.at ?? now) > THIRTY_MINUTES) {
      throw Error("Daily dispatch outcome is unknown; inspect GitHub and the saved reservation before any manual retry");
    }
  }
}

/** One automated reservation per local day (or slot), even on failure. */
export async function schedule<R extends Run>({ state, now, runs, config, deps, save }: {
  state: State; now: string; runs: R[]; config: AdmissionConfig; deps: AdmissionDeps<R>; save: () => void;
}): Promise<void> {
  const { key: day, minute } = periodOf(now, config);
  if (minute < config.window.start || minute >= config.window.end || state.days[day]) return;
  // Count every release attempt in this period, across SHAs and outcomes. A
  // manual release also satisfies its automation; people can still ask for more.
  const today = runs.find((r) => periodOf(r.created_at, config).key === day);
  if (today) { state.days[day] = { status: "observed", run: today.id }; save(); return; }
  if (runs.some((r) => r.status !== "completed")) return;
  if (deps.hasIncident && await deps.hasIncident()) return;
  const sha = await deps.main();
  const baseline = await deps.lastUpload(runs);
  const changes = await deps.changes(baseline?.head_sha, sha);
  if (!changes.changed) { state.days[day] = { status: "no-changes", sha, baseline: baseline?.head_sha }; save(); return; }
  // Persist BEFORE dispatch: a timeout, crash or lost response never buys a
  // second attempt. GitHub history and the saved SHA allow inspection.
  state.days[day] = { status: "reserved", sha, nonce: day, baseline: baseline?.head_sha, at: now }; save();
  await deps.dispatch(day);
  state.days[day].status = "dispatched"; save();
}

/**
 * The scheduling half of one controller cycle. Apps run their own reporting
 * beside it, independently, so a failed notification cannot consume or repeat
 * a release and a scheduling error cannot silence a finished run's report.
 */
export async function admit<R extends Run>({ state, now, runs, config, deps, save }: {
  state: State; now: string; runs: R[]; config: AdmissionConfig; deps: AdmissionDeps<R>; save: () => void;
}): Promise<void> {
  if (runs.some((r) => r.status !== "completed" && Date.parse(now) - Date.parse(r.created_at) > FOUR_HOURS)) {
    throw Error("A release has been queued or running for more than four hours; inspect the runner and workflow");
  }
  reconcile(state, runs, now, config); save();
  // An upload that failed once the upload step had started may still have
  // reached App Store Connect, so admit nothing automated until a later
  // confirmed upload supersedes it. This refuses on every cycle rather than
  // consuming the day, so the health signal stays stale until someone confirms.
  const uncertain = await deps.uncertainUpload(runs);
  if (uncertain) {
    throw Error(`Run ${uncertain.run.id} attempt ${uncertain.attempt} failed after the TestFlight upload step had started, so whether that build reached App Store Connect is unknown; confirm it in TestFlight. No automated release is admitted until an upload is confirmed.`);
  }
  await schedule({ state, now, runs, config, deps, save });
}
