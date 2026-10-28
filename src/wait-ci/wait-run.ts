import { EXIT, exitCode, failed } from "./checks.js";
import { type FailureDetail, renderRunDigest } from "./digest.js";
import {
  latestRun,
  parseRun,
  parseRunList,
  repoFromRunUrl,
  RUN_FIELDS,
  RUN_LIST_LIMIT,
  RUN_VIEW_FIELDS,
  type RunSnapshot,
  runVerdict,
} from "./runs.js";
import { failureDetails, firstLine, MAX_POLL_ERRORS, NO_CHECKS_GRACE_MS, nextDelay, type WaitDeps, type WaitResult } from "./wait.js";

/**
 * `morpheus wait-ci --run <id>` and `--workflow <name|file>`: the same one
 * quiet blocking call as the pull-request mode, for the runs no pull request
 * owns — TestFlight, release and nightly workflows, which agents otherwise
 * watched with `gh run view <id> --json status,conclusion,jobs` every minute.
 */
export interface RunWaitOptions {
  /** A run's database id: wait for exactly this run. */
  run?: string;
  /** A workflow name or file: wait for its latest matching run. */
  workflow?: string;
  branch?: string;
  sha?: string;
  repo?: string;
  timeoutMs: number;
}

const repoArgs = (repo?: string): string[] => (repo ? ["--repo", repo] : []);

async function viewRun(deps: WaitDeps, id: string | number, repo?: string): Promise<RunSnapshot | { error: string }> {
  const res = await deps.gh(["run", "view", String(id), ...repoArgs(repo), "--json", RUN_VIEW_FIELDS]);
  if (res.code !== 0) return { error: firstLine(res.stderr) || `gh exited ${res.code}` };
  try {
    return parseRun(JSON.parse(res.stdout));
  } catch {
    return { error: "gh run view returned output that is not JSON" };
  }
}

async function findRun(deps: WaitDeps, opts: RunWaitOptions): Promise<{ run?: RunSnapshot } | { error: string }> {
  const res = await deps.gh([
    "run", "list", ...repoArgs(opts.repo),
    "--workflow", opts.workflow!,
    ...(opts.branch ? ["--branch", opts.branch] : []),
    ...(opts.sha ? ["--commit", opts.sha] : []),
    "--limit", String(RUN_LIST_LIMIT),
    "--json", RUN_FIELDS,
  ]);
  if (res.code !== 0) return { error: firstLine(res.stderr) || `gh exited ${res.code}` };
  let runs: ReturnType<typeof parseRunList>;
  try {
    runs = parseRunList(JSON.parse(res.stdout));
  } catch {
    return { error: "gh run list returned output that is not JSON" };
  }
  if ("error" in runs) return runs;
  return { run: latestRun(runs) };
}

/** `ci.yml on main @ abc1234` — what was asked for, for the messages that have no run to name. */
export function describeWanted(opts: RunWaitOptions): string {
  if (opts.run !== undefined) return `run ${opts.run}`;
  return `${opts.workflow}${opts.branch ? ` on ${opts.branch}` : ""}${opts.sha ? ` @ ${opts.sha.slice(0, 7)}` : ""}`;
}

/**
 * Wait for one Actions run to complete, then digest it.
 *
 * By id, the run is fixed and a rerun of it is still it. By workflow, every
 * poll re-selects the newest matching run, so a push or dispatch that starts a
 * newer run mid-wait is followed and named — the same rule the pull-request
 * mode applies to a moved head. A workflow that has no matching run yet gets
 * the same grace as a pull request with no checks yet.
 */
export async function waitRun(deps: WaitDeps, opts: RunWaitOptions): Promise<WaitResult> {
  const start = deps.now();
  const deadline = start + opts.timeoutMs;
  const byId = opts.run !== undefined;
  const wanted = describeWanted(opts);
  let selected: RunSnapshot | undefined;
  let polled = false;
  let alreadyComplete = false;
  const movedFrom: number[] = [];
  let errors = 0;
  let delay: number | null = null;
  let timedOut = false;

  for (;;) {
    const result = byId
      ? await viewRun(deps, opts.run!, opts.repo).then((r) => ("error" in r ? r : { run: r }))
      : await findRun(deps, opts);
    if ("error" in result) {
      // Before any successful read the cause is a mistyped id or workflow, or
      // missing auth; retrying for half a minute only delays saying so.
      if (!polled) return { exitCode: EXIT.error, output: `wait-ci: could not read ${wanted}: ${result.error}` };
      errors++;
      if (errors >= MAX_POLL_ERRORS) {
        return { exitCode: EXIT.error, output: `wait-ci: ${MAX_POLL_ERRORS} consecutive polls of ${wanted} failed; last: ${result.error}` };
      }
    } else {
      polled = true;
      errors = 0;
      const run = result.run;
      if (run && !selected) {
        // A finished run found by branch alone may be the previous push's,
        // with the expected run not created yet. Said in the digest rather
        // than guessed at: `--sha` is the exact form.
        alreadyComplete = !byId && !opts.sha && run.status === "completed";
      } else if (run && selected && run.id !== selected.id) {
        movedFrom.push(selected.id);
        alreadyComplete = false;
        delay = null;
      }
      if (run) selected = run;
    }
    if (selected?.status === "completed") break;
    const now = deps.now();
    if (!selected && now - start >= NO_CHECKS_GRACE_MS) break;
    if (now >= deadline) {
      timedOut = true;
      break;
    }
    delay = nextDelay(delay, deadline - now);
    await deps.sleep(delay);
  }

  if (!selected) {
    const output = renderRunDigest({ verdict: "no-checks", jobs: [], elapsedMs: deps.now() - start, timedOut, details: new Map(), movedFrom, alreadyComplete: false, wanted });
    return { exitCode: EXIT.timeout, output };
  }

  // `gh run list` has no jobs; the digest needs them to say what failed.
  let final = selected;
  let jobsError: string | undefined;
  if (!final.jobs) {
    const viewed = await viewRun(deps, final.id, opts.repo);
    if ("error" in viewed) jobsError = viewed.error;
    else if (viewed.attempt !== final.attempt) jobsError = `attempt ${viewed.attempt} started after attempt ${final.attempt} was read`;
    else final = { ...final, jobs: viewed.jobs };
  }

  const verdict = runVerdict(final);
  const repo = opts.repo ?? repoFromRunUrl(final.url);
  const jobs = final.jobs ?? [];
  const details = verdict === "failed" ? await failureDetails(deps, repo, jobs.filter(failed)) : new Map<string, FailureDetail>();
  const output = renderRunDigest({
    run: final,
    repo,
    verdict,
    jobs,
    elapsedMs: deps.now() - start,
    timedOut: timedOut && verdict === "pending",
    details,
    movedFrom,
    alreadyComplete,
    jobsError,
    wanted,
  });
  return { exitCode: exitCode(verdict), output };
}
