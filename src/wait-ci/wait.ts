import { type Check, checkKey, EXIT, exitCode, failed, parseRollup, ROLLUP_QUERY, settled, type Snapshot, verdict } from "./checks.js";
import { type FailureDetail, renderDigest } from "./digest.js";
import { isLabelRace, trimFailedLog } from "./logs.js";

/**
 * The impure half of `morpheus wait-ci`: one `gh` runner, one clock and one
 * sleep, all injected, so the loop's timing, SHA tracking and error handling
 * are tested with a scripted fake rather than against GitHub.
 */

export interface GhResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type GhRunner = (args: string[]) => Promise<GhResult>;

export interface WaitDeps {
  gh: GhRunner;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface WaitOptions {
  /** PR number, branch, or URL; the current branch's PR when absent. */
  target?: string;
  repo?: string;
  timeoutMs: number;
  requiredOnly: boolean;
}

export interface WaitResult {
  exitCode: number;
  output: string;
}

export const FIRST_DELAY_MS = 10_000;
export const MAX_DELAY_MS = 60_000;
export const BACKOFF = 1.5;
/** How long an empty check list is treated as "not created yet" before it is reported as no CI. */
export const NO_CHECKS_GRACE_MS = 3 * 60_000;
/** Consecutive failed polls tolerated before giving up — one network blip must not end a 40-minute wait. */
export const MAX_POLL_ERRORS = 3;
/** Failed jobs whose logs are fetched; the rest are listed with their URL. */
export const MAX_LOGS = 5;
/** Log lines shared across all failed jobs, at most 60 each. */
export const LOG_BUDGET = 150;

const PR_URL = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/;

/** The next sleep: geometric backoff, never past the cap or the deadline. */
export function nextDelay(previous: number | null, remainingMs: number): number {
  const base = previous === null ? FIRST_DELAY_MS : Math.min(MAX_DELAY_MS, Math.round(previous * BACKOFF));
  return Math.max(0, Math.min(base, remainingMs));
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}

async function resolvePr(deps: WaitDeps, opts: WaitOptions): Promise<{ repo: string; pr: number } | { error: string }> {
  const args = ["pr", "view", ...(opts.target ? [opts.target] : []), ...(opts.repo ? ["--repo", opts.repo] : []), "--json", "number,url"];
  const res = await deps.gh(args);
  if (res.code !== 0) return { error: `could not find the pull request: ${firstLine(res.stderr) || `gh exited ${res.code}`}` };
  try {
    const { number, url } = JSON.parse(res.stdout) as { number?: number; url?: string };
    const m = PR_URL.exec(url ?? "");
    if (typeof number !== "number" || !m) return { error: `gh pr view returned no pull request URL` };
    return { repo: m[1]!, pr: number };
  } catch {
    return { error: "gh pr view returned output that is not JSON" };
  }
}

async function poll(deps: WaitDeps, repo: string, pr: number): Promise<Snapshot | { error: string }> {
  const [owner, name] = repo.split("/");
  const res = await deps.gh(["api", "graphql", "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${pr}`, "-f", `query=${ROLLUP_QUERY}`]);
  if (res.code !== 0) return { error: firstLine(res.stderr) || `gh exited ${res.code}` };
  try {
    return parseRollup(JSON.parse(res.stdout));
  } catch {
    return { error: "gh api graphql returned output that is not JSON" };
  }
}

async function failureDetails(deps: WaitDeps, repo: string, checks: Check[]): Promise<Map<string, FailureDetail>> {
  const details = new Map<string, FailureDetail>();
  const withLogs = checks.filter((c) => c.outcome === "fail" && c.jobId).slice(0, MAX_LOGS);
  const perJob = Math.max(15, Math.min(60, Math.floor(LOG_BUDGET / Math.max(1, withLogs.length))));
  for (const check of withLogs) {
    const res = await deps.gh(["run", "view", "--repo", repo, "--job", check.jobId!, "--log-failed"]);
    if (res.code !== 0) {
      details.set(checkKey(check), { logError: firstLine(res.stderr) || `gh exited ${res.code}` });
      continue;
    }
    const log = trimFailedLog(res.stdout, perJob);
    // Decided on the whole failing step, not the trimmed view: a real `✗` cut
    // from the middle must not leave the label line looking like the only one.
    const whole = trimFailedLog(res.stdout, Number.MAX_SAFE_INTEGER);
    details.set(checkKey(check), { log, labelRace: isLabelRace(check.name, whole.lines) });
  }
  return details;
}

/**
 * Wait for every check on a PR's head to finish, then digest the result.
 *
 * Prints nothing while waiting: the point is one tool call whose output is the
 * answer. A head that moves mid-wait is followed — the newest push is what the
 * caller needs a verdict on — and the move is named in the digest so results
 * from two commits are never presented as one.
 */
export async function waitCi(deps: WaitDeps, opts: WaitOptions): Promise<WaitResult> {
  const start = deps.now();
  const deadline = start + opts.timeoutMs;
  const target = await resolvePr(deps, opts);
  if ("error" in target) return { exitCode: EXIT.error, output: `wait-ci: ${target.error}` };
  const { repo, pr } = target;

  const movedFrom: string[] = [];
  let headSha: string | null = null;
  let headSeenAt = start;
  let snapshot: Snapshot | null = null;
  let errors = 0;
  let delay: number | null = null;
  let timedOut = false;

  for (;;) {
    const result = await poll(deps, repo, pr);
    if ("error" in result) {
      errors++;
      if (errors >= MAX_POLL_ERRORS) {
        return { exitCode: EXIT.error, output: `wait-ci: ${MAX_POLL_ERRORS} consecutive polls of ${repo}#${pr} failed; last: ${result.error}` };
      }
    } else {
      errors = 0;
      if (headSha !== null && result.headSha !== headSha) {
        movedFrom.push(headSha);
        headSeenAt = deps.now();
        delay = null;
      }
      headSha = result.headSha;
      snapshot = result;
    }
    const visible = snapshot ? relevant(snapshot.checks, opts.requiredOnly) : [];
    if (snapshot && settled(visible)) break;
    const now = deps.now();
    if (snapshot && visible.length === 0 && now - headSeenAt >= NO_CHECKS_GRACE_MS) break;
    if (now >= deadline) {
      timedOut = true;
      break;
    }
    delay = nextDelay(delay, deadline - now);
    await deps.sleep(delay);
  }

  if (!snapshot) return { exitCode: EXIT.error, output: `wait-ci: no successful poll of ${repo}#${pr} before the deadline` };
  const checks = relevant(snapshot.checks, opts.requiredOnly);
  const v = verdict(checks);
  const details = v === "failed" ? await failureDetails(deps, repo, checks.filter(failed)) : new Map<string, FailureDetail>();
  const output = renderDigest({
    repo,
    pr,
    headSha: snapshot.headSha,
    verdict: v,
    checks,
    elapsedMs: deps.now() - start,
    timedOut: timedOut && !settled(checks),
    details,
    movedFrom,
    requiredOnly: opts.requiredOnly,
    truncated: snapshot.truncated,
    ignored: snapshot.checks.length - checks.length,
  });
  return { exitCode: exitCode(v), output };
}

function relevant(checks: Check[], requiredOnly: boolean): Check[] {
  return requiredOnly ? checks.filter((c) => c.required) : checks;
}
