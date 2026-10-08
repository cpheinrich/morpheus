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
export declare const EXIT: {
    readonly green: 0;
    readonly failed: 1;
    readonly timeout: 2;
    readonly error: 3;
};
/**
 * The single GraphQL query a poll makes. Head SHA and rollup come from one
 * `commits(last: 1)` node, so a push between two requests can never pair one
 * commit's id with another commit's checks.
 */
export declare const ROLLUP_QUERY = "query($owner: String!, $name: String!, $number: Int!) {\n  repository(owner: $owner, name: $name) {\n    pullRequest(number: $number) {\n      number\n      url\n      commits(last: 1) { nodes { commit { oid statusCheckRollup { contexts(first: 100) {\n        pageInfo { hasNextPage }\n        nodes {\n          __typename\n          ... on CheckRun { name status conclusion detailsUrl startedAt isRequired(pullRequestNumber: $number)\n            checkSuite { workflowRun { workflow { name } } } }\n          ... on StatusContext { context state targetUrl createdAt isRequired(pullRequestNumber: $number) }\n        }\n      } } } } }\n    }\n  }\n}";
/** A check run's lifecycle and conclusion, as GitHub's GraphQL enum values. */
export declare function checkRunOutcome(status: string | null | undefined, conclusion: string | null | undefined): Outcome;
/** A commit status (the older API that Vercel and similar integrations use). */
export declare function statusOutcome(state: string | null | undefined): Outcome;
export declare function jobIdFromUrl(url: string | null | undefined): string | undefined;
/** `gh api graphql` output for {@link ROLLUP_QUERY}; an error string when the shape is not what was asked for. */
export declare function parseRollup(json: unknown): Snapshot | {
    error: string;
};
/**
 * One row per check name, the most recently started winning — the rule branch
 * protection itself applies to a required context. A re-run leaves the old
 * attempt beside the new one, and a label-triggered workflow can add a second
 * `pr / conventions` that supersedes the first; reporting both would show a
 * superseded failure as still blocking.
 */
export declare function dedupe(checks: Check[]): Check[];
export declare function failed(check: Check): boolean;
/**
 * The verdict once nothing is left to wait for, or at the deadline.
 *
 * An empty list is `no-checks`, never `green`: right after a push GitHub has
 * not created the runs yet, and "nothing has failed" is not "it passed".
 * A failure is decisive even while other checks run — the head cannot go green
 * without another push or a re-run — so at a deadline it outranks `pending`.
 */
export declare function verdict(checks: Check[]): Verdict;
/** Whether the wait is over: every check finished and there is at least one. */
export declare function settled(checks: Check[]): boolean;
export declare function exitCode(v: Verdict): number;
export declare function counts(checks: Check[]): Record<Outcome, number>;
/**
 * `45m`, `90s`, `1h30m`, or a bare number of minutes. Anything else, and zero,
 * is `null` — a typo must not silently become "wait forever" or "do not wait".
 */
export declare function parseDuration(text: string | undefined): number | null;
export declare function formatDuration(ms: number): string;
