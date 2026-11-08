declare const ARMS: readonly ["tantivy-bounded", "ripgrep-bounded", "ripgrep-full", "manual", "legacy"];
type Arm = typeof ARMS[number];
type Transport = "cli" | "mcp" | "unknown";
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
}>;
export {};
