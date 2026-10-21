import { Decision, type LiveState, type Plan, planRoute, planTriage } from "../gh-manager/decision.js";
import { type Routed } from "../gh-manager/sweep.js";
export declare function ghManagerSweep(repoArg: string | undefined, out: string | undefined): number;
export declare function ghManagerRoutes(repoArg: string | undefined, sweepPath: string | undefined, outDir: string | undefined, dryRun: boolean): number;
export declare function ghManagerPrompt(repoArg: string | undefined, prArg: string | undefined, sweepPath: string | undefined, out: string | undefined): number;
export declare function ghManagerApply(repoArg: string | undefined, prArg: string | undefined, sweepPath: string | undefined, decisionPath: string | undefined, out: string | undefined, dryRun: boolean): number;
/**
 * A triage session's decision. No evidence is published and no review record is read: triage
 * changes nothing on the branch, and that is verified here with Git before anything is planned.
 */
export declare function planTriageApply(live: LiveState & {
    base: string;
}, routed: Routed, ctx: Parameters<typeof planTriage>[2], decision: Decision | undefined, problem: string, decisionPath: string | undefined, number: number): Plan;
/** Check the live WIP signal before any evidence publication or session fallback. */
export declare function planWithLiveWipGuard(live: LiveState, routed: Routed, ctx: Parameters<typeof planRoute>[2], proceed: () => Plan): Plan;
export declare function ghManagerDigest(repoArg: string | undefined, sweepPath: string | undefined, outcomesDir: string | undefined, dryRun: boolean): number;
/**
 * Print the preview URL(s) for a commit, one per line. Exit 0 when ready, 2 while Vercel is still
 * building or has not yet described the commit, 1 when there is no preview to capture.
 */
export declare function ghManagerPreviewUrl(repoArg: string | undefined, prArg: string | undefined, shaArg: string | undefined): number;
