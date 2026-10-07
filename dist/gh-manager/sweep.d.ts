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
    /**
     * The head the App cleared on its own review. Written only when a merge rests on a manager
     * review, and it is what binds that clearance to a commit: `check pr` accepts nothing after
     * this head but exact trunk merges, so a later push cannot ride on the label.
     */
    cleared?: string | undefined;
}
export interface PullRequestFacts {
    number: number;
    title: string;
    author: string;
    authorAssociation: string;
    /**
     * The author's permission on the repository, read only when the association alone does not
     * establish trust. Undefined when it was not read or could not be, which is not trust.
     */
    authorPermission?: string | undefined;
    isDraft: boolean;
    /** Head branch lives in another repository (a fork). */
    isCrossRepository: boolean;
    headRefName: string;
    headSha: string;
    /** ISO commit date of the head commit. */
    headCommittedAt: string;
    /** ISO time the pull request was opened. A commit made hours before it was pushed is not quiet. */
    createdAt: string;
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
/** A branch name the brief can carry verbatim. Git allows `;`, `$`, backticks and more in a ref. */
export declare const SAFE_REF: RegExp;
export declare function renderMarker(marker: ManagerMarker): string;
/**
 * The marker in a comment body, or undefined.
 *
 * Only the **last** marker in the body is read. The comment also carries text a model wrote, and
 * the deterministic step appends the real marker after all of it; reading the first match let a
 * marker-shaped string in a summary forge the attempt count or the stale warning's date. A
 * malformed last marker is absent, not an error, and never falls back to an earlier one.
 */
export declare function parseMarker(body: string): ManagerMarker | undefined;
/** Route one pull request. Pure: `now` is passed in. */
export declare function routePullRequest(pr: PullRequestFacts, policy: GhManagerPolicy, now: Date): Routed;
/** Route every pull request, then hold sessions to the per-run budget. */
export declare function sweep(prs: PullRequestFacts[], policy: GhManagerPolicy, now: Date): Routed[];
