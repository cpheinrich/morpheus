/**
 * Display rules shared by HQ infrastructure desks (Darwin's Operations Desk, Lakina's Infra tab).
 *
 * Pure and project-neutral: each project keeps its own sources, authorization, copy and
 * pipeline topology. What lives here is the part both desks must render the same way —
 * compact browser-local times, exact GitHub links built only from validated identifiers,
 * dated terminal outcomes that survive a stale source, newest-attempt ordering, and
 * shareable URL-fragment views.
 */

/**
 * Every absolute desk time reads like `Nov 12, 9:19pm PST`: the viewer's browser zone with its
 * DST-aware short name, no year or seconds. Anything that is not a parseable time string is
 * `Unknown`, never a guessed date.
 */
export function formatStamp(value: unknown, timeZone?: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "Unknown";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    hourCycle: "h12", timeZoneName: "short",
  }).formatToParts(new Date(value));
  const { month, day, hour, minute, dayPeriod, timeZoneName } = Object.fromEntries(
    parts.map(({ type, value: part }) => [type, part]),
  );
  return `${month} ${day}, ${hour}:${minute}${dayPeriod?.toLowerCase() ?? ""} ${timeZoneName}`;
}

const TERMINAL = new Set(["succeeded", "failed", "cancelled", "skipped"]);

/** A recorded result that stays true however old the observation that carried it becomes. */
export function isTerminalState(state: string): boolean {
  return TERMINAL.has(state);
}

/**
 * What a desk may show for a reported state. A dated terminal outcome is kept when its source
 * goes stale; a live state (`running`, `queued`, …) only means anything while the source is
 * current, so it becomes `unknown` rather than claiming work is still active.
 */
export function displayedState(state: string, current: boolean): string {
  return current || isTerminalState(state) ? state : "unknown";
}

/**
 * Latest attempt first, by when it started — never by when it was read or by its status, so a
 * historical run read after a newer one cannot become the "latest" attempt. Run id breaks ties.
 */
export function newestAttemptFirst(
  a: { startedAt: string; runId: number },
  b: { startedAt: string; runId: number },
): number {
  return (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0) || b.runId - a.runId;
}

// `owner/name`, where neither segment may be `.` or `..` (a browser would resolve them away).
const REPOSITORY = /^(?!\.{1,2}\/)[-\w.]+\/(?!\.{1,2}$)[-\w.]+$/;
const SHA = /^[0-9a-f]{40}$/;
const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** `owner/name`, in the only shape a link may be built from. */
export function validRepository(repository: unknown): repository is string {
  return typeof repository === "string" && REPOSITORY.test(repository);
}

/** A workflow run, or one exact attempt of it. Null unless every identifier is valid. */
export function githubRunUrl(repository: unknown, runId: unknown, attempt?: unknown): string | null {
  if (!validRepository(repository) || !positive(runId)) return null;
  const run = `https://github.com/${repository}/actions/runs/${runId}`;
  if (attempt === undefined) return run;
  return positive(attempt) ? `${run}/attempts/${attempt}` : null;
}

/** One exact job. A stage without an observed positive job id gets no link. */
export function githubJobUrl(repository: unknown, runId: unknown, jobId: unknown): string | null {
  const run = githubRunUrl(repository, runId);
  return run && positive(jobId) ? `${run}/job/${jobId}` : null;
}

/** A reported job URL is used only when it is exactly the one its identifiers produce. */
export function exactJobUrl(job: { repository?: unknown; runId?: unknown; jobId?: unknown; url?: unknown }): string | null {
  const expected = githubJobUrl(job.repository, job.runId, job.jobId);
  return expected !== null && job.url === expected ? expected : null;
}

/** A full 40-character lowercase commit SHA; an abbreviated or malformed one gets no link. */
export function githubCommitUrl(repository: unknown, sha: unknown): string | null {
  return validRepository(repository) && typeof sha === "string" && SHA.test(sha)
    ? `https://github.com/${repository}/commit/${sha}`
    : null;
}

/**
 * Pull-request links from a bounded list of distinct positive numbers. Anything else — too
 * many, duplicates, a non-number — yields no links at all rather than a partial list.
 */
export function githubPullLinks(repository: unknown, numbers: unknown, max = 3): { number: number; url: string }[] {
  if (!validRepository(repository) || !Array.isArray(numbers) || numbers.length > max) return [];
  if (new Set(numbers).size !== numbers.length || !numbers.every(positive)) return [];
  return numbers.map(number => ({ number, url: `https://github.com/${repository}/pull/${number}` }));
}

/** `Scheduled Tasks` → `scheduled-tasks`: the form a view label takes in a URL fragment. */
export function fragmentSlug(label: string): string {
  return label.toLowerCase().replaceAll(" ", "-");
}

/**
 * `#work?view=recent&detail=x` → `{ section: "work", params }`. The fragment never reaches the
 * server, so a shareable view adds no identifier to any request.
 */
export function parseFragment(hash: string): { section: string; params: URLSearchParams } {
  const body = hash.replace(/^#/, "");
  const mark = body.indexOf("?");
  // Everything after the first `?` is the query, including any later `?` typed by hand.
  return mark < 0
    ? { section: body, params: new URLSearchParams() }
    : { section: body.slice(0, mark), params: new URLSearchParams(body.slice(mark + 1)) };
}

/** The inverse of `parseFragment`. An empty section is the default view: no fragment at all. */
export function buildFragment(section: string, params: Record<string, string | null | undefined> = {}): string {
  if (!section) return "";
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `#${section}${query.size ? `?${query}` : ""}`;
}
