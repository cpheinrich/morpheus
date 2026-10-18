import { type Attempt, type CdConfig, type TestEvidence, type UploadEvidence } from "./schema.js";
import { type GitHubApi } from "./store.js";
export interface WorkflowRun {
    id: number;
    run_attempt: number;
    status: string;
    conclusion: string | null;
    display_title: string;
    head_sha: string;
    event: string;
    path: string;
    created_at: string;
    updated_at: string;
}
export declare function matchesEffect(title: string, effect: string): boolean;
export declare class ActionsAdapter {
    readonly api: GitHubApi;
    readonly config: CdConfig;
    constructor(api: GitHubApi, config: CdConfig);
    runs(effectId: string, workflow?: string): Promise<WorkflowRun[]>;
    run(id: string): Promise<WorkflowRun>;
    runAttempt(id: string, attempt: string): Promise<WorkflowRun>;
    dispatch(attempt: Attempt, intentId: string, channel: string): Promise<void>;
    cancel(id: string): Promise<void>;
    verifyRun(run: WorkflowRun, attempt: Attempt): void;
    evidence(run: WorkflowRun, attempt: Attempt): Promise<{
        tests: TestEvidence[];
        uploads: UploadEvidence[];
        failures: unknown[];
    }>;
}
export declare function uploadEvidence(raw: Record<string, unknown>): UploadEvidence;
