import { type Evaluation, type Finding, type MeasuredFile } from "./evaluate.js";
import { type LizardPin } from "./pin.js";
import { type ComplexityConfig } from "./policy.js";
export interface CheckOptions {
    root: string;
    /**
     * Measure untracked files too (default). CI turns this off: its workspace holds only the
     * commit plus what the workflow put there, such as the `.morpheus/` checkout of Morpheus
     * itself, which is not the project's code.
     */
    untracked?: boolean;
    /** The ref to compare with; the project's trunk when absent. */
    base?: string;
    all: boolean;
    pin?: LizardPin;
    env?: NodeJS.ProcessEnv;
}
export type CheckReport = {
    state: "not-run";
    reason: string;
    enrolled: boolean;
    mode: string;
    exitCode: 2;
} | {
    state: "ran";
    enrolled: boolean;
    config: ComplexityConfig;
    scope: "changed" | "all";
    mergeBase: string | null;
    delta: string[];
    evaluation: Evaluation;
    findings: Finding[];
    /** Every measured function, flagged or not, for before/after family metrics. */
    files: MeasuredFile[];
    lizardVersion: string | null;
    exitCode: 0 | 1;
};
export declare function runCheck(opts: CheckOptions): Promise<CheckReport>;
export declare function projectConfig(root: string): Promise<import("./policy.js").ConfigRead>;
