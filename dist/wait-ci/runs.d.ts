import { type Check, type Verdict } from "./checks.js";
/**
 * The pure half of `morpheus wait-ci --run` and `--workflow`: what `gh run
 * view` and `gh run list` said about one Actions run, reduced to the same
 * `Check` rows and `Verdict` the pull-request mode uses, so the digest and
 * exit codes cannot drift between the two.
 */
/** Fields every run poll asks for. `gh run list` cannot return `jobs`. */
export declare const RUN_FIELDS = "databaseId,status,conclusion,headSha,headBranch,event,workflowName,url,createdAt,attempt";
export declare const RUN_VIEW_FIELDS = "databaseId,status,conclusion,headSha,headBranch,event,workflowName,url,createdAt,attempt,jobs";
/** Enough rows that the newest run is among them even when `gh` orders a tie unexpectedly. */
export declare const RUN_LIST_LIMIT = 20;
export interface RunSnapshot {
    id: number;
    /** gh's lowercase REST values: `queued`, `in_progress`, `waiting`, `completed`, … */
    status: string;
    /** Empty until the run completes. */
    conclusion: string;
    headSha: string;
    headBranch: string;
    event: string;
    workflow: string;
    url: string;
    createdAt: string;
    attempt: number;
    /** Present only when read with `gh run view`. */
    jobs?: Check[];
}
export declare function repoFromRunUrl(url: string): string | undefined;
interface RawJob {
    name?: unknown;
    status?: unknown;
    conclusion?: unknown;
    databaseId?: unknown;
    url?: unknown;
    startedAt?: unknown;
}
/**
 * One job as a `Check`. gh's REST enums are lowercase where the rollup's
 * GraphQL enums are not; upper-casing them reuses the one outcome table, so a
 * conclusion the table has never seen is a failure here too, never a pass.
 */
export declare function jobCheck(job: RawJob): Check;
/** `gh run view <id> --json RUN_VIEW_FIELDS`. */
export declare function parseRun(json: unknown): RunSnapshot | {
    error: string;
};
/** `gh run list --json RUN_FIELDS`; one malformed row rejects the list rather than vanishing from it. */
export declare function parseRunList(json: unknown): RunSnapshot[] | {
    error: string;
};
/**
 * The newest run: latest `createdAt`, then the higher id. `gh` already lists
 * newest first, but a rerun keeps its original creation time and a re-sorted
 * response must not quietly turn an older run into "the latest".
 */
export declare function latestRun(runs: RunSnapshot[]): RunSnapshot | undefined;
/**
 * A run's verdict comes from its own conclusion, not from its jobs: a
 * `continue-on-error` job can fail inside a run that succeeded, and a run can
 * fail before any job starts (`startup_failure`). The jobs explain; the run
 * decides.
 */
export declare function runVerdict(run: RunSnapshot): Verdict;
export {};
