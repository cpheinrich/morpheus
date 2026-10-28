import { checkRunOutcome } from "./checks.js";
/**
 * The pure half of `morpheus wait-ci --run` and `--workflow`: what `gh run
 * view` and `gh run list` said about one Actions run, reduced to the same
 * `Check` rows and `Verdict` the pull-request mode uses, so the digest and
 * exit codes cannot drift between the two.
 */
/** Fields every run poll asks for. `gh run list` cannot return `jobs`. */
export const RUN_FIELDS = "databaseId,status,conclusion,headSha,headBranch,event,workflowName,url,createdAt,attempt";
export const RUN_VIEW_FIELDS = `${RUN_FIELDS},jobs`;
/** Enough rows that the newest run is among them even when `gh` orders a tie unexpectedly. */
export const RUN_LIST_LIMIT = 20;
const RUN_URL = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/actions\/runs\/\d+/;
export function repoFromRunUrl(url) {
    return RUN_URL.exec(url)?.[1];
}
const text = (value) => (typeof value === "string" ? value : "");
/**
 * One job as a `Check`. gh's REST enums are lowercase where the rollup's
 * GraphQL enums are not; upper-casing them reuses the one outcome table, so a
 * conclusion the table has never seen is a failure here too, never a pass.
 */
export function jobCheck(job) {
    const id = typeof job.databaseId === "number" ? String(job.databaseId) : undefined;
    return {
        name: text(job.name) || "(unnamed job)",
        outcome: checkRunOutcome(text(job.status).toUpperCase(), text(job.conclusion).toUpperCase()),
        url: text(job.url) || undefined,
        required: false,
        startedAt: text(job.startedAt) || undefined,
        jobId: id,
    };
}
function snapshot(row) {
    if (!row || typeof row !== "object" || Array.isArray(row))
        return { error: "a run row is not an object" };
    const r = row;
    if (typeof r["databaseId"] !== "number" || typeof r["status"] !== "string" || typeof r["headSha"] !== "string") {
        return { error: "a run row has no databaseId, status or headSha" };
    }
    const run = {
        id: r["databaseId"],
        status: r["status"],
        conclusion: text(r["conclusion"]),
        headSha: r["headSha"],
        headBranch: text(r["headBranch"]),
        event: text(r["event"]),
        workflow: text(r["workflowName"]) || "workflow",
        url: text(r["url"]),
        createdAt: text(r["createdAt"]),
        attempt: typeof r["attempt"] === "number" ? r["attempt"] : 1,
    };
    if (Array.isArray(r["jobs"]))
        run.jobs = r["jobs"].map(jobCheck);
    return run;
}
/** `gh run view <id> --json RUN_VIEW_FIELDS`. */
export function parseRun(json) {
    return snapshot(json);
}
/** `gh run list --json RUN_FIELDS`; one malformed row rejects the list rather than vanishing from it. */
export function parseRunList(json) {
    if (!Array.isArray(json))
        return { error: "gh run list did not return an array" };
    const runs = [];
    for (const row of json) {
        const run = snapshot(row);
        if ("error" in run)
            return run;
        runs.push(run);
    }
    return runs;
}
/**
 * The newest run: latest `createdAt`, then the higher id. `gh` already lists
 * newest first, but a rerun keeps its original creation time and a re-sorted
 * response must not quietly turn an older run into "the latest".
 */
export function latestRun(runs) {
    let best;
    for (const run of runs) {
        if (!best || run.createdAt > best.createdAt || (run.createdAt === best.createdAt && run.id > best.id))
            best = run;
    }
    return best;
}
/**
 * A run's verdict comes from its own conclusion, not from its jobs: a
 * `continue-on-error` job can fail inside a run that succeeded, and a run can
 * fail before any job starts (`startup_failure`). The jobs explain; the run
 * decides.
 */
export function runVerdict(run) {
    const outcome = checkRunOutcome(run.status.toUpperCase(), run.conclusion.toUpperCase());
    if (outcome === "pending")
        return "pending";
    return outcome === "pass" || outcome === "skipped" ? "green" : "failed";
}
//# sourceMappingURL=runs.js.map