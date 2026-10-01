export declare function ghManagerSweep(repoArg: string | undefined, out: string | undefined): number;
export declare function ghManagerRoutes(repoArg: string | undefined, sweepPath: string | undefined, outDir: string | undefined, dryRun: boolean): number;
export declare function ghManagerPrompt(repoArg: string | undefined, prArg: string | undefined, sweepPath: string | undefined, out: string | undefined): number;
export declare function ghManagerApply(repoArg: string | undefined, prArg: string | undefined, sweepPath: string | undefined, decisionPath: string | undefined, out: string | undefined, dryRun: boolean): number;
export declare function ghManagerDigest(repoArg: string | undefined, sweepPath: string | undefined, outcomesDir: string | undefined, dryRun: boolean): number;
