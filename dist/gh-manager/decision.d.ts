import { z } from "zod";
import { type GhManagerPolicy } from "./policy.js";
import { type ManagerMarker, type Routed } from "./sweep.js";
export declare const Decision: z.ZodObject<{
    version: z.ZodLiteral<1>;
    pr: z.ZodNumber;
    head: z.ZodString;
    action: z.ZodEnum<{
        incomplete: "incomplete";
        merge: "merge";
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
    body: string;
    /** Every path the pull request changes against its base. */
    changedFiles: string[];
    /** Whether `supersededBy` names a merged pull request; undefined when it could not be read. */
    supersededMerged?: boolean | undefined;
    /** Runs to rerun because their check was cancelled. */
    cancelledRunIds: number[];
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
