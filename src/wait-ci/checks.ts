/**
 * The pure half of `morpheus wait-ci`: what GitHub said about one commit's
 * checks, reduced to outcomes, a verdict and an exit code.
 *
 * Everything here takes parsed data and returns data, so the whole decision
 * table is tested against fixtures without `gh` or a clock.
 */

export type Outcome = "pass" | "skipped" | "fail" | "cancelled" | "pending";

export interface Check {
  name: string;
  /** The Actions workflow, when the check is a job. */
  workflow?: string;
  outcome: Outcome;
  url?: string;
  required: boolean;
  startedAt?: string;
  /** Actions job id, parsed from the details URL, for `gh run view --job <id> --log-failed`. */
  jobId?: string;
}

export interface Snapshot {
  pr: number;
  url: string;
  /** The commit these checks belong to. Read in the same response as the checks, so the two cannot disagree. */
  headSha: string;
  checks: Check[];
  /** GitHub had more than one page of contexts; the rest were not read. */
  truncated: boolean;
}

export type Verdict = "green" | "failed" | "pending" | "no-checks";

export const EXIT = { green: 0, failed: 1, timeout: 2, error: 3 } as const;

/**
 * The single GraphQL query a poll makes. Head SHA and rollup come from one
 * `commits(last: 1)` node, so a push between two requests can never pair one
 * commit's id with another commit's checks.
 */
export const ROLLUP_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number
      url
      commits(last: 1) { nodes { commit { oid statusCheckRollup { contexts(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          __typename
          ... on CheckRun { name status conclusion detailsUrl startedAt isRequired(pullRequestNumber: $number)
            checkSuite { workflowRun { workflow { name } } } }
          ... on StatusContext { context state targetUrl createdAt isRequired(pullRequestNumber: $number) }
        }
      } } } } }
    }
  }
}`;

/** A check run's lifecycle and conclusion, as GitHub's GraphQL enum values. */
export function checkRunOutcome(status: string | null | undefined, conclusion: string | null | undefined): Outcome {
  if (status !== "COMPLETED") return "pending";
  switch (conclusion) {
    case "SUCCESS":
    case "NEUTRAL":
      return "pass";
    case "SKIPPED":
      return "skipped";
    case "CANCELLED":
    case "STALE":
      return "cancelled";
    case "FAILURE":
    case "TIMED_OUT":
    case "STARTUP_FAILURE":
    case "ACTION_REQUIRED":
      return "fail";
    default:
      // A completed run with a conclusion this table has never seen is not
      // evidence of success; reading it as a failure surfaces it in the digest.
      return "fail";
  }
}

/** A commit status (the older API that Vercel and similar integrations use). */
export function statusOutcome(state: string | null | undefined): Outcome {
  switch (state) {
    case "SUCCESS":
      return "pass";
    case "FAILURE":
    case "ERROR":
      return "fail";
    default:
      return "pending";
  }
}

const JOB_URL = /\/actions\/runs\/\d+\/job\/(\d+)/;

export function jobIdFromUrl(url: string | null | undefined): string | undefined {
  return url ? JOB_URL.exec(url)?.[1] : undefined;
}

interface RawNode {
  __typename?: string;
  name?: string;
  status?: string | null;
  conclusion?: string | null;
  detailsUrl?: string | null;
  startedAt?: string | null;
  isRequired?: boolean;
  checkSuite?: { workflowRun?: { workflow?: { name?: string } | null } | null } | null;
  context?: string;
  state?: string;
  targetUrl?: string | null;
  createdAt?: string | null;
}

/** `gh api graphql` output for {@link ROLLUP_QUERY}; an error string when the shape is not what was asked for. */
export function parseRollup(json: unknown): Snapshot | { error: string } {
  const data = json as { data?: { repository?: { pullRequest?: unknown } }; errors?: { message?: string }[] } | null;
  if (data?.errors?.length) return { error: data.errors.map((e) => e.message ?? "unknown GraphQL error").join("; ") };
  const pr = data?.data?.repository?.pullRequest as
    | { number?: number; url?: string; commits?: { nodes?: { commit?: { oid?: string; statusCheckRollup?: { contexts?: { pageInfo?: { hasNextPage?: boolean }; nodes?: RawNode[] } } | null } }[] } }
    | null
    | undefined;
  if (!pr || typeof pr.number !== "number") return { error: "pull request not found in the response" };
  const commit = pr.commits?.nodes?.[0]?.commit;
  if (!commit?.oid) return { error: `pull request #${pr.number} has no head commit in the response` };
  const contexts = commit.statusCheckRollup?.contexts;
  const checks: Check[] = [];
  for (const node of contexts?.nodes ?? []) {
    if (node.__typename === "CheckRun") {
      checks.push({
        name: node.name ?? "(unnamed check)",
        workflow: node.checkSuite?.workflowRun?.workflow?.name ?? undefined,
        outcome: checkRunOutcome(node.status, node.conclusion),
        url: node.detailsUrl ?? undefined,
        required: node.isRequired === true,
        startedAt: node.startedAt ?? undefined,
        jobId: jobIdFromUrl(node.detailsUrl),
      });
    } else if (node.__typename === "StatusContext") {
      checks.push({
        name: node.context ?? "(unnamed status)",
        outcome: statusOutcome(node.state),
        url: node.targetUrl ?? undefined,
        required: node.isRequired === true,
        startedAt: node.createdAt ?? undefined,
      });
    }
  }
  return {
    pr: pr.number,
    url: pr.url ?? "",
    headSha: commit.oid,
    checks: dedupe(checks),
    truncated: contexts?.pageInfo?.hasNextPage === true,
  };
}

/**
 * The identity two rollup rows share when one supersedes the other.
 *
 * A required check is keyed by name alone — the rule branch protection itself
 * applies — so the `pr / conventions` a label-triggered workflow adds supersedes
 * CI's own. Anything else is keyed by workflow and name, so two unrelated
 * workflows that each have a `test` job stay two rows and one cannot hide the
 * other's failure.
 */
export function checkKey(check: Check): string {
  return check.required ? check.name : `${check.workflow ?? ""}\u0000${check.name}`;
}

/** Sorts after any ISO timestamp: a run that has not started yet is the newest attempt. */
const NOT_STARTED = "\uffff";

/**
 * One row per {@link checkKey}, the most recent attempt winning. A re-run
 * leaves the old attempt beside the new one; reporting both would show a
 * superseded failure as still blocking. A queued replacement has no
 * `startedAt` and must still win, or a fresh run would be judged by the
 * failure it replaces.
 */
export function dedupe(checks: Check[]): Check[] {
  const latest = new Map<string, Check>();
  for (const check of checks) {
    const key = checkKey(check);
    const prior = latest.get(key);
    if (!prior || (check.startedAt ?? NOT_STARTED) >= (prior.startedAt ?? NOT_STARTED)) latest.set(key, check);
  }
  return [...latest.values()];
}

export function failed(check: Check): boolean {
  return check.outcome === "fail" || check.outcome === "cancelled";
}

/**
 * The verdict once nothing is left to wait for, or at the deadline.
 *
 * An empty list is `no-checks`, never `green`: right after a push GitHub has
 * not created the runs yet, and "nothing has failed" is not "it passed".
 * A failure is decisive even while other checks run — the head cannot go green
 * without another push or a re-run — so at a deadline it outranks `pending`.
 */
export function verdict(checks: Check[]): Verdict {
  if (checks.length === 0) return "no-checks";
  if (checks.some(failed)) return "failed";
  if (checks.some((c) => c.outcome === "pending")) return "pending";
  return "green";
}

/** Whether the wait is over: every check finished and there is at least one. */
export function settled(checks: Check[]): boolean {
  return checks.length > 0 && checks.every((c) => c.outcome !== "pending");
}

export function exitCode(v: Verdict): number {
  if (v === "green") return EXIT.green;
  if (v === "failed") return EXIT.failed;
  return EXIT.timeout;
}

export function counts(checks: Check[]): Record<Outcome, number> {
  const out: Record<Outcome, number> = { pass: 0, skipped: 0, fail: 0, cancelled: 0, pending: 0 };
  for (const c of checks) out[c.outcome]++;
  return out;
}

const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };

/**
 * `45m`, `90s`, `1h30m`, or a bare number of minutes. Anything else, and zero,
 * is `null` — a typo must not silently become "wait forever" or "do not wait".
 */
export function parseDuration(text: string | undefined): number | null {
  if (text === undefined) return null;
  const value = text.trim();
  if (/^\d+$/.test(value)) {
    const minutes = Number(value);
    return minutes > 0 ? minutes * UNIT_MS.m! : null;
  }
  if (!/^(\d+[hms])+$/.test(value)) return null;
  let total = 0;
  const seen = new Set<string>();
  for (const [, n, unit] of value.matchAll(/(\d+)([hms])/g)) {
    if (seen.has(unit!)) return null;
    seen.add(unit!);
    total += Number(n) * UNIT_MS[unit!]!;
  }
  return total > 0 ? total : null;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}
