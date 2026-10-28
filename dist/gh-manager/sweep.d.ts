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
    /** `ready` and `dormant` come only from triage of a draft or WIP pull request. */
    verdict: "merge" | "escalate" | "close" | "warn-stale" | "incomplete" | "ready" | "dormant" | "wait";
    attempts: number;
    /** ISO timestamp of that run. */
    at: string;
    /**
     * The head the App cleared on its own review. Written only when a merge rests on a manager
     * review, and it is what binds that clearance to a commit: `check pr` accepts nothing after
     * this head but exact trunk merges, so a later push cannot ride on the label.
     */
    cleared?: string | undefined;
    /**
     * The head an update-branch was attempted on. A successful update moves the head, so finding
     * this equal to the current head means GitHub refused it, and the next run escalates once
     * instead of retrying every run.
     */
    updated?: string | undefined;
    /**
     * Written by triage. Triage and the ordinary path keep separate attempt budgets: a draft's
     * triage sessions never count against the ordinary path once it is ready, nor the reverse.
     */
    triage?: boolean | undefined;
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
    /**
     * The base has moved past the branch and strict protection requires it up to date. GitHub's
     * auto-merge never updates a branch itself, so a queued pull request in this state waits for
     * ever unless something brings it up to date.
     */
    behind?: boolean | undefined;
    /**
     * The head is the update the manager itself made: a two-parent commit authored by the App whose
     * first parent is the head it recorded updating. Only that is exempt from the quiet period. A
     * session's fix commit is not, and neither is a commit merely claiming the App's address.
     */
    headFirstParent?: string | undefined;
    headByManager?: boolean | undefined;
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
 | "session"
/** Cancel a previously queued auto-merge on work in progress. */
 | "hold" | "skip";
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
/** The session reason that marks a read-only triage of a draft or WIP pull request. */
export declare const TRIAGE_REASON = "triage";
/** A branch name the brief can carry verbatim. Git allows `;`, `$`, backticks and more in a ref. */
export declare const SAFE_REF: RegExp;
/** Branches `context brief` creates for tracked edits rescued from a dirty trunk checkout. */
export declare const RESCUED_TRUNK_PREFIX = "wip/trunk-";
/**
 * Days a rescued trunk draft may go without a push before the sweep closes it, keeping the branch.
 *
 * Rescue drafts used to be escalated to a human after `draftQuietHours`. Of about nineteen opened
 * in their first three weeks, none was adopted, and each one sat in the `manager:needs-human`
 * queue beside decisions that did need a person — the queue went from 4 to 16. Unadopted edits
 * are almost always incidental, and the branch keeps them recoverable, so the default became
 * closing them. A week is long enough for whoever left the edits to notice the draft in the
 * session that made it, and short enough that the drafts stop accumulating. The rescue PR body
 * names this number; a test holds the two equal.
 */
export declare const RESCUE_MAX_AGE_DAYS = 7;
/** The route reason for that close, which the apply step re-checks against live state. */
export declare const RESCUE_AGED_OUT = "rescued-trunk-aged-out";
/** A rescued trunk draft nobody has taken up: still a draft, nothing queued, no review on it. */
export declare function isRescuedTrunkDraft(pr: Pick<PullRequestFacts, "isDraft" | "autoMerge" | "labels" | "headRefName">): boolean;
/**
 * An explicit WIP signal. The manager never merges or repairs such a pull request; once it has
 * been quiet for `draftQuietHours` it is only triaged, read-only (see `routeWorkInProgress`).
 */
export declare function isWorkInProgress(pr: Pick<PullRequestFacts, "isDraft" | "headRefName" | "title">): boolean;
/** A WIP branch or title, which only a person can take back; a plain draft is just `isDraft`. */
export declare function hasWipName(pr: Pick<PullRequestFacts, "headRefName" | "title">): boolean;
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
