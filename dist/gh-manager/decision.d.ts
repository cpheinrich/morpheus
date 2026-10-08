import { z } from "zod";
import { type GhManagerPolicy } from "./policy.js";
import { type ManagerMarker, type Routed } from "./sweep.js";
export declare const Decision: z.ZodObject<{
    version: z.ZodLiteral<1>;
    pr: z.ZodNumber;
    head: z.ZodString;
    action: z.ZodEnum<{
        merge: "merge";
        incomplete: "incomplete";
        close: "close";
        escalate: "escalate";
        wait: "wait";
    }>;
    summary: z.ZodString;
    reasoning: z.ZodString;
    usedManagerReview: z.ZodDefault<z.ZodBoolean>;
    body: z.ZodOptional<z.ZodString>;
    markReady: z.ZodDefault<z.ZodBoolean>;
    supersededBy: z.ZodOptional<z.ZodNumber>;
    missing: z.ZodOptional<z.ZodString>;
    needsHuman: z.ZodOptional<z.ZodString>;
    findings: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        severity: z.ZodEnum<{
            minor: "minor";
            substantive: "substantive";
            incidental: "incidental";
        }>;
        description: z.ZodString;
        disposition: z.ZodEnum<{
            fixed: "fixed";
            noted: "noted";
        }>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
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
/** Operations for a route the sweep decided without a session. */
export declare function planRoute(routed: Routed, live: LiveState, ctx: Context): Plan;
/**
 * A session that ended without a decision file. It still spent an attempt, and it must still
 * say so: a session that ran and reported nothing would otherwise look exactly like one that
 * found nothing to do, and would be retried at full cost on every run.
 */
export declare function planNoDecision(problem: string, live: LiveState, ctx: Context): Plan;
export {};
