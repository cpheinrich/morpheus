declare const ARMS: readonly ["tantivy-full", "tantivy-bounded", "ripgrep-bounded", "ripgrep-full", "manual", "legacy"];
declare const ENGINES: readonly ["tantivy", "ripgrep"];
declare const OPERATIONS: readonly ["search", "read", "coverage", "overview", "related"];
declare const TYPES: readonly ["assignment", "query", "tool", "visible", "session-start", "prompt", "warm"];
declare const OUTCOMES: readonly ["ok", "empty", "error"];
type Arm = typeof ARMS[number];
type Engine = typeof ENGINES[number];
type Operation = typeof OPERATIONS[number];
type Transport = "cli" | "mcp" | "unknown";
export type Trace = {
    at: number;
    type: typeof TYPES[number];
    arm: Arm;
    engine: Engine;
    actualEngine?: Engine;
    overrideEngine?: Engine;
    rollout: string | null;
    session: string | null;
    transport: Transport;
    operation?: Operation;
    durationMs?: number;
    queryStartedAt?: number;
    mcpStartedAt?: number;
    waitMs?: number;
    engineQueryMs?: number;
    buildMs?: number;
    cacheHit?: boolean;
    returnedTokens?: number;
    outcome?: typeof OUTCOMES[number];
};
/** Aggregate workspace, legacy and archived traces without emitting any per-session values. */
export declare function summarizeContextTraces(root: string, options?: {
    since?: string;
}): Promise<{
    since: string | null;
    files: number;
    skippedFiles: number;
    invalidRows: number;
    duplicateRows: number;
    assignments: {
        sessions: number;
        rollout: string | null;
        arm: Arm;
        unattributed: number;
    }[];
    byArmTransport: {
        sessions: number;
        visibleSessions: number;
        operations: {
            [k: string]: {
                calls: number;
                empty: number;
                errors: number;
                latencySamples: number;
                p50Ms: number | null;
                p95Ms: number | null;
                returnedTokens: number;
                tokenSamples: number;
                p50ReturnedTokens: number | null;
            };
        };
        searchByActualEngine: {
            [k: string]: {
                p50EngineMs: number | null;
                p95EngineMs: number | null;
                builds: number;
                p50BuildMs: number | null;
                cacheHits: number;
                calls: number;
                empty: number;
                errors: number;
                latencySamples: number;
                p50Ms: number | null;
                p95Ms: number | null;
                returnedTokens: number;
                tokenSamples: number;
                p50ReturnedTokens: number | null;
            };
        };
        rollout: string | null;
        arm: Arm;
        transport: Transport;
        visible: number;
        fallbacks: number;
        overrides: number;
    }[];
    pipeline: {
        sessions: number;
        promptHooks: number;
        codexTurnFallbacks: number;
        noPromptTimestamp: number;
        firstSearches: number;
        firstSearchCacheHits: number;
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
    };
}>;
export {};
