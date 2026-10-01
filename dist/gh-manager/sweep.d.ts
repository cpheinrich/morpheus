import { type GhManagerPolicy } from "./policy.js";
/**
 * The sweep: every open pull request, routed from facts alone.
 *
 * No model runs here. The same reasoning as the heartbeat's ranker — a
 * deterministic first stage is testable, costs a runner minute, and cannot be
 * talked into anything by a pull request's own text. It also does the cheap
 * work outright: a reviewed, green pull request needs auto-merge switched on,
 * not a session.
 */
export type CheckState = "success" | "failure" | "pending" | "skipped" | "neutral" | "cancelled";
/** What the manager wrote on a pull request last time, read back from its own comment. */
export interface ManagerMarker {
    head: string;
    verdict: "merge" | "escalate" | "close" | "warn-stale" | "incomplete" | "wait";
    attempts: number;
    /** ISO timestamp of that run. */
    at: string;
}
export interface PullRequestFacts {
    number: number;
    title: string;
    author: string;
    authorAssociation: string;
    isDraft: boolean;
    /** Head branch lives in another repository (a fork). */
    isCrossRepository: boolean;
    headRefName: string;
    headSha: string;
    /** ISO commit date of the head commit. */
    headCommittedAt: string;
    labels: string[];
    autoMerge: boolean;
    mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
    /** The latest run of each check on the head commit, one entry per name. */
    checks: {
        name: string;
        state: CheckState;
        runId?: number | undefined;
    }[];
    marker?: ManagerMarker | undefined;
}
export type Route = 
/** Deterministic: enable auto-merge. */
"merge"
/** Deterministic: the stale grace period ran out. */
 | "close"
/** Deterministic: the attempt budget is spent. */
 | "escalate"
/** One model session. */
 | "session" | "skip";
export interface Routed {
    number: number;
    title: string;
    headSha: string;
    route: Route;
    /** Stable slug, for tests and the digest table. */
    reason: string;
    /** One line a human reads. */
    detail: string;
    /** Sessions already spent on this pull request, carried into the next marker. */
    attempts: number;
}
export declare function renderMarker(marker: ManagerMarker): string;
/** The marker in a comment body, or undefined. A malformed one is absent, not an error: it is our own bookkeeping. */
export declare function parseMarker(body: string): ManagerMarker | undefined;
/** Route one pull request. Pure: `now` is passed in. */
export declare function routePullRequest(pr: PullRequestFacts, policy: GhManagerPolicy, now: Date): Routed;
/** Route every pull request, then hold sessions to the per-run budget. */
export declare function sweep(prs: PullRequestFacts[], policy: GhManagerPolicy, now: Date): Routed[];
