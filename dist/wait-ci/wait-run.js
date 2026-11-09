import { EXIT, exitCode, failed } from "./checks.js";
import { renderRunDigest } from "./digest.js";
import { latestRun, parseRun, parseRunList, repoFromRunUrl, RUN_FIELDS, RUN_LIST_LIMIT, RUN_VIEW_FIELDS, runVerdict, } from "./runs.js";
import { failureDetails, firstLine, MAX_POLL_ERRORS, NO_CHECKS_GRACE_MS, nextDelay } from "./wait.js";
/**
 * How long a latest run that had already finished — found by workflow and
 * branch, not pinned by `--sha` — is held before it is reported. A run just
 * dispatched or pushed is listed within seconds; returning the previous run's
 * verdict at once hands an agent chaining on the exit code someone else's
 * result. Inside the window a newer run is followed like any other move.
 */
export const ALREADY_COMPLETE_SETTLE_MS = 20_000;
const repoArgs = (repo) => (repo ? ["--repo", repo] : []);
async function viewRun(deps, id, repo) {
    const res = await deps.gh(["run", "view", String(id), ...repoArgs(repo), "--json", RUN_VIEW_FIELDS]);
    if (res.code !== 0)
        return { error: firstLine(res.stderr) || `gh exited ${res.code}` };
    try {
        return parseRun(JSON.parse(res.stdout));
    }
    catch {
        return { error: "gh run view returned output that is not JSON" };
    }
}
async function findRun(deps, opts) {
    const res = await deps.gh([
        "run", "list", ...repoArgs(opts.repo),
        "--workflow", opts.workflow,
        ...(opts.branch ? ["--branch", opts.branch] : []),
        ...(opts.sha ? ["--commit", opts.sha] : []),
        "--limit", String(RUN_LIST_LIMIT),
        "--json", RUN_FIELDS,
    ]);
    if (res.code !== 0)
        return { error: firstLine(res.stderr) || `gh exited ${res.code}` };
    let runs;
    try {
        runs = parseRunList(JSON.parse(res.stdout));
    }
    catch {
        return { error: "gh run list returned output that is not JSON" };
    }
    if ("error" in runs)
        return runs;
    return { run: latestRun(runs) };
}
/** `ci.yml on main @ abc1234` — what was asked for, for the messages that have no run to name. */
export function describeWanted(opts) {
    if (opts.run !== undefined)
        return `run ${opts.run}`;
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
export async function waitRun(deps, opts) {
    const start = deps.now();
    const deadline = start + opts.timeoutMs;
    const byId = opts.run !== undefined;
    const wanted = describeWanted(opts);
    const watch = new RunWatch(byId, opts.sha);
    for (;;) {
        const result = byId
            ? await viewRun(deps, opts.run, opts.repo).then((r) => ("error" in r ? r : { run: r }))
            : await findRun(deps, opts);
        if ("error" in result) {
            // Before any successful read the cause is a mistyped id or workflow, or
            // missing auth; retrying for half a minute only delays saying so.
            if (!watch.polled)
                return { exitCode: EXIT.error, output: `wait-ci: could not read ${wanted}: ${result.error}` };
            if (++watch.errors >= MAX_POLL_ERRORS) {
                return { exitCode: EXIT.error, output: `wait-ci: ${MAX_POLL_ERRORS} consecutive polls of ${wanted} failed; last: ${result.error}` };
            }
        }
        else
            watch.observe(result.run);
        const now = deps.now();
        const selected = watch.selected;
        if (selected?.status === "completed" && !(watch.alreadyComplete && now - start < ALREADY_COMPLETE_SETTLE_MS))
            break;
        if (!selected && now - start >= NO_CHECKS_GRACE_MS)
            break;
        if (now >= deadline) {
            watch.timedOut = true;
            break;
        }
        watch.delay = nextDelay(watch.delay, deadline - now);
        await deps.sleep(watch.delay);
    }
    return runDigest(deps, opts, watch, wanted, start);
}
/** The run being followed. By workflow a newer matching run replaces it, is named, and restarts the backoff. */
class RunWatch {
    byId;
    sha;
    selected;
    polled = false;
    alreadyComplete = false;
    movedFrom = [];
    errors = 0;
    delay = null;
    timedOut = false;
    constructor(byId, sha) {
        this.byId = byId;
        this.sha = sha;
    }
    observe(run) {
        this.polled = true;
        this.errors = 0;
        if (run && !this.selected) {
            // A finished run found by branch alone may be the previous push's,
            // with the expected run not created yet. Said in the digest rather
            // than guessed at: `--sha` is the exact form.
            this.alreadyComplete = !this.byId && !this.sha && run.status === "completed";
        }
        else if (run && this.selected && run.id !== this.selected.id) {
            this.movedFrom.push(this.selected.id);
            this.alreadyComplete = false;
            this.delay = null;
        }
        if (run)
            this.selected = run;
    }
}
async function runDigest(deps, opts, watch, wanted, start) {
    const { selected, timedOut, movedFrom, alreadyComplete } = watch;
    if (!selected) {
        const output = renderRunDigest({ verdict: "no-checks", jobs: [], elapsedMs: deps.now() - start, timedOut, details: new Map(), movedFrom, alreadyComplete: false, wanted });
        return { exitCode: EXIT.timeout, output };
    }
    const { final, jobsError } = await withJobs(deps, selected, opts.repo);
    const verdict = runVerdict(final);
    const repo = opts.repo ?? repoFromRunUrl(final.url);
    const jobs = final.jobs ?? [];
    const details = verdict === "failed" ? await failureDetails(deps, repo, jobs.filter(failed)) : new Map();
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
/** `gh run list` has no jobs; the digest needs them to say what failed. */
async function withJobs(deps, selected, repo) {
    if (selected.jobs)
        return { final: selected, jobsError: undefined };
    const viewed = await viewRun(deps, selected.id, repo);
    if ("error" in viewed)
        return { final: selected, jobsError: viewed.error };
    if (viewed.attempt !== selected.attempt)
        return { final: selected, jobsError: `attempt ${viewed.attempt} started after attempt ${selected.attempt} was read` };
    return { final: { ...selected, jobs: viewed.jobs }, jobsError: undefined };
}
//# sourceMappingURL=wait-run.js.map