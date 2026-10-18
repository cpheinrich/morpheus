import { type CdConfig, type CdState } from "./schema.js";
import { ActionsAdapter } from "./actions.js";
import { AppleAdapter } from "./apple.js";
import { GitHubStore } from "./store.js";
export interface TickResult {
    mode: "observe" | "active";
    stateHead: string;
    intents: unknown[];
    decisions: unknown[];
    errors: {
        intentId: string;
        message: string;
    }[];
}
export declare function status(state: CdState, now: string): unknown[];
export declare class Controller {
    readonly config: CdConfig;
    readonly store: GitHubStore;
    readonly actions: ActionsAdapter;
    readonly apple: AppleAdapter;
    readonly sourceDir: string;
    constructor(config: CdConfig, store: GitHubStore, actions: ActionsAdapter, apple: AppleAdapter, sourceDir: string);
    tick(now: string, observe?: boolean): Promise<TickResult>;
    private reconcileIntent;
    private dispatch;
    private failedRun;
    private reconcileUpload;
    private processingDiagnosis;
}
