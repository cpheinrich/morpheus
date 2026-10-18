import { type AgentResult, type CdConfig, type QuotaSnapshot } from "./schema.js";
import { GitHubStore } from "./store.js";
export declare const agentResultSchema: {
    type: string;
    additionalProperties: boolean;
    properties: {
        outcome: {
            type: string;
            enum: string[];
        };
        summary: {
            type: string;
        };
        pullRequest: {
            type: string;
        };
        sourceSha: {
            type: string;
        };
        reviewHead: {
            type: string;
        };
        evidence: {
            type: string;
            items: {
                type: string;
            };
        };
        missingCapability: {
            type: string;
        };
    };
    required: string[];
};
export declare function normalizeClaudeQuota(value: unknown, now: string): QuotaSnapshot;
/** No model request: read the same actual account limits exposed by the runtime. */
export declare function codexQuota(command: string[], cwd: string, now: string): Promise<QuotaSnapshot>;
export declare class QuotaReader {
    readonly config: CdConfig;
    readonly executor: "local" | "hosted";
    readonly sourceDir: string;
    readonly environment: NodeJS.ProcessEnv;
    readonly fetcher: typeof fetch;
    private cached?;
    private retryAt;
    constructor(config: CdConfig, executor: "local" | "hosted", sourceDir: string, environment?: NodeJS.ProcessEnv, fetcher?: typeof fetch);
    read(now?: string): Promise<QuotaSnapshot>;
}
export declare function scheduleHosted(config: CdConfig, store: GitHubStore, now: string): Promise<void>;
export declare function verifyRepair(config: CdConfig, store: GitHubStore, sourceDir: string, result: AgentResult): Promise<string>;
export declare function runWorker(config: CdConfig, store: GitHubStore, sourceDir: string, options: {
    executor: "local" | "hosted";
    workId?: string;
    invocationId?: string;
    taskDigest?: string;
}, environment?: NodeJS.ProcessEnv): Promise<unknown>;
