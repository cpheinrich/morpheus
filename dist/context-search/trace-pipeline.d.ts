import type { Trace } from "./trace-summary.js";
export declare class ContextPipeline {
    private readonly sessions;
    private readonly warm;
    observe(trace: Trace): void;
    report(): Promise<{
        sessions: number;
        promptHooks: number;
        codexTurnFallbacks: number;
        noPromptTimestamp: number;
        firstSearches: number;
        firstResults: number;
        visibleSearchResults: number;
        startToPrompt: {
            samples: number;
            meanMs: number | null;
            p50Ms: number | null;
            p95Ms: number | null;
        };
        promptToFirstSearch: {
            samples: number;
            meanMs: number | null;
            p50Ms: number | null;
            p95Ms: number | null;
        };
        promptToFirstResult: {
            samples: number;
            meanMs: number | null;
            p50Ms: number | null;
            p95Ms: number | null;
        };
        startToFirstResult: {
            samples: number;
            meanMs: number | null;
            p50Ms: number | null;
            p95Ms: number | null;
        };
        promptToFirstVisibleResult: {
            samples: number;
            meanMs: number | null;
            p50Ms: number | null;
            p95Ms: number | null;
        };
        firstSearch: {
            samples: number;
            meanMs: number | null;
            p50Ms: number | null;
            p95Ms: number | null;
        };
        firstSearchIndexWait: {
            samples: number;
            meanMs: number | null;
            p50Ms: number | null;
            p95Ms: number | null;
        };
        warmups: number;
        warmupFailures: number;
        warmupCacheHits: number;
        warmupDuration: {
            samples: number;
            meanMs: number | null;
            p50Ms: number | null;
            p95Ms: number | null;
        };
        warmupBuild: {
            samples: number;
            meanMs: number | null;
            p50Ms: number | null;
            p95Ms: number | null;
        };
        warmedBeforePrompt: number;
    }>;
    private promptFallbacks;
}
