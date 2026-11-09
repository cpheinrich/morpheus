export type ContextTransport = "cli" | "mcp";
export type ContextOperation = "search" | "read" | "coverage" | "overview" | "related";
export type ContextOutcome = "ok" | "empty" | "error";
export type SearchEngine = "tantivy" | "ripgrep";
export type Arm = "tantivy-bounded" | "ripgrep-bounded" | "ripgrep-full" | "manual" | "legacy";
export interface SearchRollout {
    id: string;
    coreInputs: string[];
}
export interface SearchConfig {
    mode?: SearchEngine;
    transport?: ContextTransport;
    include: string[];
    exclude: string[];
    rollout?: SearchRollout;
}
export interface ContextArm {
    /** The experiment ID from the manifest. */
    id?: string;
    /** An opaque key shared between assignment and query traces, never the provider ID. */
    session?: string;
    arm: Arm;
    engine: SearchEngine;
    startup: "bounded" | "full";
    coreInputs?: string[];
    unavailable?: string;
}
export declare function providerSessionId(env?: NodeJS.ProcessEnv): string | undefined;
export declare function isHumanInbox(path: string): boolean;
export declare function parseSearchConfig(value: unknown): SearchConfig;
export declare function getSearchConfig(root: string): Promise<SearchConfig>;
export declare function armForBucket(bucket: number): "tantivy-bounded" | "ripgrep-bounded" | "ripgrep-full";
export declare function contextTraceSession(rollout: string, session: string): string;
export declare function contextArm(root: string, sessionId?: string | undefined, config?: SearchConfig): Promise<ContextArm>;
export interface ContextTrace {
    type: "assignment" | "query" | "tool" | "visible" | "session-start" | "prompt" | "warm";
    transport?: ContextTransport;
    operation?: ContextOperation;
    outcome?: ContextOutcome;
    arm: Arm;
    engine: SearchEngine;
    /** Actual engine, when different from the assigned engine. */
    actualEngine?: SearchEngine;
    overrideEngine?: SearchEngine;
    session?: string;
    rollout?: string;
    startup?: "bounded" | "full";
    startupBytes?: number;
    startupTokens?: number;
    queryMs?: number;
    queryStartedAt?: number;
    mcpStartedAt?: number;
    waitMs?: number;
    engineQueryMs?: number;
    buildMs?: number;
    cacheHit?: boolean;
    resultCount?: number;
    returnedTokens?: number;
    budget?: number;
}
/** Keep traces in ignored workspace storage writable from the agent sandbox. */
export declare function traceContext(root: string, event: ContextTrace, now?: Date): Promise<void>;
