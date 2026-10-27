import { z } from "zod";
import { type GhManagerPolicy } from "./policy.js";
import { type ManagerMarker, type Routed } from "./sweep.js";
export declare const Decision: any;
export type Decision = z.infer<typeof Decision>;
export type Operation = {
    kind: "set-body";
    body: string;
} | {
    kind: "ready";
} | {
    kind: "add-label";
    label: string;
} | {
    kind: "remove-label";
    label: string;
} | {
    kind: "auto-merge";
}
/**
 * Merge the base into the branch with GitHub's update-branch endpoint, guarded on the head the
 * plan was made for: if anyone pushed in between, GitHub refuses rather than merging over it.
 * A merge GitHub performs reproduces exactly, so it keeps any review on record valid.
 */
 | {
    kind: "update-branch";
    expectedHead: string;
} | {
    kind: "disable-auto-merge";
} | {
    kind: "rerun";
    runIds: number[];
} | {
    kind: "close";
} | {
    kind: "comment";
    body: string;
};
/** Live facts the plan is checked against, read after the session ended. */
export interface LiveState {
    headSha: string;
    title: string;
    headRefName: string;
    isDraft: boolean;
    labels: string[];
    autoMerge: boolean;
    /** Strict protection holds the branch behind its base; see `PullRequestFacts.behind`. */
    behind?: boolean | undefined;
    body: string;
    /** Every path the pull request changes against its base. */
    changedFiles: string[];
    /** Whether `supersededBy` names a merged pull request; undefined when it could not be read. */
    supersededMerged?: boolean | undefined;
    /** Runs to rerun because their check was cancelled. */
    cancelledRunIds: number[];
    /**
     * What the session pushed, verified with real Git by the apply step: nothing, only merges of
     * trunk that Git reproduces exactly, or anything else. `unverified` when it could not be
     * determined, which is treated as `other`.
     */
    sessionPushed: "nothing" | "trunk-merges" | "other" | "unverified";
    /**
     * Why the manager's review record at this head would be refused by `check pr`, when the
     * decision rests on one. Undefined means it validates, or that no record was claimed.
     */
    recordProblem?: string | undefined;
    /** The author's record was checked against this head even if its label is missing. */
    authorRecordValid?: boolean | undefined;
    authorRecordProblem?: string | undefined;
}
export interface Plan {
    verdict: ManagerMarker["verdict"];
    /** Set when the plan differs from what the session asked for, and why. */
    overridden?: string;
    operations: Operation[];
}
interface Context {
    policy: GhManagerPolicy;
    /** Sessions spent on this pull request before this run. */
    attempts: number;
    now: Date;
    /** Link to the run, for the audit comment. */
    runUrl: string;
}
/**
 * Model-written text, made unable to open or close an HTML comment. The marker is an HTML
 * comment; `parseMarker` already reads only the last one, and this keeps a forged one from
 * existing at all, so the two guards do not depend on each other.
 */
export declare function inert(text: string): string;
/** Turn a session's decision into operations, or into an escalation when it does not hold up. */
export declare function planDecision(decision: Decision, live: LiveState, ctx: Context): Plan;
/**
 * Turn a triage session's decision into operations. Triage is read-only and never lands anything:
 * the most it does is mark a plain draft ready for review, after which the ordinary path decides,
 * with its review, check and merge rules unchanged. Draft state alone neither blocks this nor
 * authorizes a merge, a close or an implementation.
 */
export declare function planTriage(decision: Decision, live: LiveState, ctx: Context): Plan;
/**
 * A triage session that wrote no usable decision. It still spent a triage attempt, a queued
 * auto-merge on WIP is still cancelled, and a branch it changed is still escalated.
 */
export declare function planTriageNoDecision(problem: string, live: LiveState, ctx: Context): Plan;
/** Operations for a route the sweep decided without a session. */
export declare function planRoute(routed: Routed, live: LiveState, ctx: Context): Plan;
/**
 * A session that ended without a decision file. It still spent an attempt, and it must still
 * say so: a session that ran and reported nothing would otherwise look exactly like one that
 * found nothing to do, and would be retried at full cost on every run.
 */
export declare function planNoDecision(problem: string, live: LiveState, ctx: Context): Plan;
export {};
