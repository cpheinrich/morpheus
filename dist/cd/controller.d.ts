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
    readonly clock: () => string;
    constructor(config: CdConfig, store: GitHubStore, actions: ActionsAdapter, apple: AppleAdapter, sourceDir: string, clock?: () => string);
    private currentTime;
    tick(now: string, observe?: boolean): Promise<TickResult>;
    /** A delivered intent owes external follow-up only under the opted-in configuration, until it is terminal or available. */
    private externalDue;
    private recordExternalWait;
    private recordReconcileWait;
    private observeRetired;
    private reconcileExternal;
    /** Records one exact-build external observation, confirming a claimed review the provider now shows. */
    private externalRecorder;
    private applyExternalSetting;
    private submitExternalReview;
    private reconcileIntent;
    private yieldPostResume;
    private planNextAttempt;
    /** Every run the dispatch effect produced, each verified at its bound run attempt. */
    private effectRuns;
    private redispatchInvisible;
    /** Sorts the sweep in place, picks the bound (or first) run and cancels running duplicates. */
    private bindRun;
    /** Without an upload claim, a run either outlives its deadline (cancel) or ends as a failure to classify. */
    private settleRun;
    private jobs;
    private dispatch;
    private failedRun;
    private failureEvidence;
    private reconcileUpload;
    private recordProviderRejection;
    /** Accepts the visible exact build, then waits on processing/readiness, promotes it to the internal group, or delivers. */
    private reconcileVisibleBuild;
    private promoteToInternalGroup;
    private retireOrDiagnoseAbsentUpload;
    private processingDiagnosis;
}
