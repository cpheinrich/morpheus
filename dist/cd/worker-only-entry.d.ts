import type { AgentExecutor, CdState } from "./schema.js";
import { type LedgerStore } from "./repair-control.js";
export interface WorkerOptions {
    executor: AgentExecutor;
    hostId?: string;
    workId?: string;
    invocationId?: string;
    taskDigest?: string;
}
export type RunWorkerPort<C, S extends LedgerStore> = (config: C, store: S, sourceDir: string, options: WorkerOptions, environment?: NodeJS.ProcessEnv) => Promise<unknown>;
export type HeldAwareResult = {
    state: "repair-held";
    workId: string;
} | {
    state: "repair-control-invalid";
    reason: string;
} | {
    state: "idle";
} | unknown;
/** The worker's own first-due predicate (not complete, due, lease absent or expired). */
export declare const due: (work: CdState["agents"][string], now: string) => boolean;
export declare function runHeldAwareWorker<C, S extends LedgerStore>(d: {
    runWorker: RunWorkerPort<C, S>;
    config: C;
    store: S;
    sourceDir: string;
    options: WorkerOptions;
    environment: NodeJS.ProcessEnv;
    now?: () => string;
}): Promise<HeldAwareResult>;
