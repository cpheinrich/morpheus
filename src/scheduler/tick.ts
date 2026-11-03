import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  decide,
  HISTORY_SKEW_MS,
  instant,
  parseRunIdentity,
  slotAtOrBefore,
  window,
  type DispatchMemory,
  type Mode,
} from "./core.js";
import { GitHubError, type GitHubApi } from "./github.js";
import {
  formatIssues,
  SCHEDULER_VERSION,
  SCHEDULES_PATH,
  schedulesFileSchema,
  type HostConfig,
  type Schedule,
} from "./schema.js";

export type Outcome =
  | "idle" // no slot since the registry was activated
  | "accepted" // the due slot already has a run
  | "waiting" // due, but not this tick's to dispatch (backup within grace, or a lost response settling)
  | "planned" // would dispatch; dry run
  | "dispatched" // GitHub accepted a submission this tick (delivery is the receiver's business)
  | "uncertain" // the submission's response was lost; reconciled by history before any resubmission
  | "skipped" // the target workflow is disabled
  | "error";

export interface ScheduleStatus {
  id: string;
  workflow: string;
  /** The desired slot this tick judged, or null before the first slot since activation. */
  dueAt: string | null;
  outcome: Outcome;
  reason?: string;
  runId?: number;
  runUrl?: string;
  error?: string;
  /** The primary's own last submission, carried between ticks so a slow history cannot cause a repeat. */
  lastDispatch?: DispatchMemory;
}

export interface RepositoryStatus {
  repository: string;
  ok: boolean;
  defaultBranch?: string;
  activatedAt?: string;
  error?: string;
  schedules: ScheduleStatus[];
}

export interface SchedulerStatus {
  schemaVersion: 1;
  instanceId: string;
  schedulerVersion: string;
  mode: Mode;
  dryRun: boolean;
  observedAt: string;
  tick: { startedAt: string; finishedAt: string };
  ok: boolean;
  errors: number;
  repositories: RepositoryStatus[];
}

export interface TickOptions {
  config: HostConfig;
  github: GitHubApi;
  mode: Mode;
  dryRun: boolean;
  previous?: SchedulerStatus | null;
  now?: () => Date;
}

export async function tick(options: TickOptions): Promise<SchedulerStatus> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const repositories: RepositoryStatus[] = [];
  // Sequential and isolated: one repository's failure is recorded and the next one still runs.
  for (const repository of options.config.repositories) {
    repositories.push(await tickRepository(repository, options, now));
  }
  const errors = repositories.reduce(
    (sum, repo) => sum + (repo.ok ? 0 : 1) + repo.schedules.filter(s => s.outcome === "error").length,
    0,
  );
  const finishedAt = instant(now());
  return {
    schemaVersion: 1,
    instanceId: options.config.instanceId,
    schedulerVersion: SCHEDULER_VERSION,
    mode: options.mode,
    dryRun: options.dryRun,
    observedAt: finishedAt,
    tick: { startedAt: instant(startedAt), finishedAt },
    ok: errors === 0,
    errors,
    repositories,
  };
}

async function tickRepository(repository: string, options: TickOptions, now: () => Date): Promise<RepositoryStatus> {
  const status: RepositoryStatus = { repository, ok: false, schedules: [] };
  try {
    const branch = await options.github.defaultBranch(repository);
    status.defaultBranch = branch;
    const text = await options.github.file(repository, SCHEDULES_PATH, branch);
    if (text === null) throw new Error(`${SCHEDULES_PATH} is missing on ${branch}`);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error(`${SCHEDULES_PATH} is not JSON`);
    }
    const parsed = schedulesFileSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`${SCHEDULES_PATH}: ${formatIssues(parsed.error)}`);
    const activatedAt = await options.github.lastCommitAt(repository, SCHEDULES_PATH, branch);
    status.activatedAt = instant(activatedAt);
    for (const schedule of parsed.data.schedules) {
      status.schedules.push(await tickSchedule(repository, branch, activatedAt, schedule, options, now()));
    }
    status.ok = true;
  } catch (error) {
    status.error = message(error);
  }
  return status;
}

async function tickSchedule(
  repository: string,
  branch: string,
  activatedAt: Date,
  schedule: Schedule,
  options: TickOptions,
  now: Date,
): Promise<ScheduleStatus> {
  const memory = options.mode === "primary"
    ? options.previous?.repositories.find(r => r.repository === repository)?.schedules.find(s => s.id === schedule.id)?.lastDispatch
    : undefined;
  const slot = slotAtOrBefore(schedule, now);
  const result: ScheduleStatus = {
    id: schedule.id,
    workflow: schedule.workflow,
    dueAt: slot && slot >= activatedAt ? instant(slot) : null,
    outcome: "idle",
    ...(memory ? { lastDispatch: memory } : {}),
  };
  try {
    const due = window({ schedule, now, mode: options.mode, activatedAt });
    if (!due) {
      if (result.dueAt) Object.assign(result, { outcome: "waiting", reason: "the primary has until the backup grace" });
      return result;
    }
    const accepted = new Map<string, { runId: number; runUrl: string }>();
    const known = memory?.scheduledFor === result.dueAt && !memory.uncertain;
    // A confirmed submission of this very slot needs no history read; anything else does.
    if (!known) {
      const since = new Date(due.probeAt.getTime() - HISTORY_SKEW_MS);
      for (const run of await options.github.runs(repository, schedule.workflow, since)) {
        const identity = parseRunIdentity(run.display_title);
        if (identity?.id === schedule.id && !accepted.has(identity.scheduledFor)) {
          accepted.set(identity.scheduledFor, { runId: run.id, runUrl: run.html_url });
        }
      }
    }
    const decision = decide(options.mode, due, accepted, memory, now);
    if (decision.action === "accepted") {
      return Object.assign(result, { outcome: "accepted", runId: decision.runId, runUrl: decision.runUrl });
    }
    if (decision.action === "wait") return Object.assign(result, { outcome: "waiting", reason: decision.reason });
    return await submit(repository, branch, schedule, result, options, now);
  } catch (error) {
    return Object.assign(result, { outcome: "error", error: message(error) });
  }
}

async function submit(
  repository: string,
  branch: string,
  schedule: Schedule,
  result: ScheduleStatus,
  options: TickOptions,
  now: Date,
): Promise<ScheduleStatus> {
  const workflow = await options.github.workflow(repository, schedule.workflow);
  if (!workflow) throw new Error(`workflow ${schedule.workflow} does not exist`);
  if (workflow.state !== "active") return Object.assign(result, { outcome: "skipped", reason: `workflow is ${workflow.state}` });
  const source = await options.github.file(repository, `.github/workflows/${schedule.workflow}`, branch);
  // Without the run-name suffix its runs are invisible to history, and every tick would dispatch again.
  if (!source || !/^run-name:.*\[schedule:/m.test(source) || !source.includes("scheduler-id") || !source.includes("scheduled-for")) {
    throw new Error(`workflow ${schedule.workflow} does not declare the scheduler inputs and run-name suffix`);
  }
  const scheduledFor = result.dueAt!;
  if (options.dryRun) return Object.assign(result, { outcome: "planned" });
  const inputs = { ...schedule.inputs, "scheduler-id": schedule.id, "scheduled-for": scheduledFor };
  try {
    const run = await options.github.dispatch(repository, schedule.workflow, branch, inputs);
    return Object.assign(result, {
      outcome: "dispatched",
      runId: run.runId,
      runUrl: run.runUrl,
      lastDispatch: { scheduledFor, at: instant(now), uncertain: false, runId: run.runId, runUrl: run.runUrl },
    });
  } catch (error) {
    if (error instanceof GitHubError && error.uncertain) {
      return Object.assign(result, {
        outcome: "uncertain",
        error: message(error),
        lastDispatch: { scheduledFor, at: instant(now), uncertain: true },
      });
    }
    throw error;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readStatus(path: string): Promise<SchedulerStatus | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as SchedulerStatus;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`status file ${path} is unreadable: ${message(error)}`);
  }
}

/** Write-then-rename, so a reader never sees half a status file. */
export async function writeStatus(path: string, status: SchedulerStatus): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(status, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

const STALE_LOCK_MS = 10 * 60_000;

/**
 * One tick per status file. launchd never overlaps its own job, but a manual tick could, and two
 * ticks racing would both read an empty history and dispatch twice. A lock older than any tick
 * can run is left by a crash and is taken over.
 */
export async function withLock<T>(statusPath: string, body: () => Promise<T>): Promise<T> {
  const path = `${statusPath}.lock`;
  await mkdir(dirname(path), { recursive: true });
  let handle;
  try {
    handle = await open(path, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const age = Date.now() - (await stat(path)).mtimeMs;
    if (age < STALE_LOCK_MS) throw new Error(`another tick holds ${path}`);
    await rm(path, { force: true });
    handle = await open(path, "wx");
  }
  try {
    await handle.writeFile(`${process.pid}\n`);
    return await body();
  } finally {
    await handle.close();
    await rm(path, { force: true });
  }
}

export interface Health {
  healthy: boolean;
  reasons: string[];
}

/** Fresh means a tick finished recently enough for its cadence; it says nothing of the jobs' own success. */
export function health(status: SchedulerStatus | null, now: Date): Health {
  if (!status) return { healthy: false, reasons: ["no tick has written a status yet"] };
  const reasons: string[] = [];
  const limitMs = (status.mode === "backup" ? 20 : 3) * 60_000;
  const age = now.getTime() - new Date(status.observedAt).getTime();
  if (!(age <= limitMs)) reasons.push(`last tick finished ${Math.round(age / 1000)}s ago`);
  for (const repo of status.repositories) {
    if (repo.error) reasons.push(`${repo.repository}: ${repo.error}`);
    for (const schedule of repo.schedules) {
      if (schedule.outcome === "error") reasons.push(`${repo.repository} ${schedule.id}: ${schedule.error}`);
    }
  }
  return { healthy: reasons.length === 0, reasons };
}
