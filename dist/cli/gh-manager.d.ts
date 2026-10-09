export declare function ghManagerSweep(repoArg: string | undefined, out: string | undefined): number;
export declare function ghManagerRoutes(repoArg: string | undefined, sweepPath: string | undefined, outDir: string | undefined, dryRun: boolean): number;
export declare function ghManagerPrompt(repoArg: string | undefined, prArg: string | undefined, sweepPath: string | undefined, out: string | undefined): number;
export declare function ghManagerApply(repoArg: string | undefined, prArg: string | undefined, sweepPath: string | undefined, decisionPath: string | undefined, out: string | undefined, dryRun: boolean): number;
export declare function ghManagerDigest(repoArg: string | undefined, sweepPath: string | undefined, outcomesDir: string | undefined, dryRun: boolean): number;
/**
 * Print the preview URL(s) for a commit, one per line. Exit 0 when ready, 2 while Vercel is still
 * building or has not yet described the commit, 1 when there is no preview to capture.
 */
export declare function ghManagerPreviewUrl(repoArg: string | undefined, prArg: string | undefined, shaArg: string | undefined): number;
