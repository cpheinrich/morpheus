import { type Evaluation, type Finding } from "./evaluate.js";
import { type LizardPin } from "./pin.js";
import { type ComplexityConfig } from "./policy.js";
export interface CheckOptions {
    root: string;
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
    lizardVersion: string | null;
    exitCode: 0 | 1;
};
export declare function runCheck(opts: CheckOptions): Promise<CheckReport>;
export declare function projectConfig(root: string): Promise<import("./policy.js").ConfigRead>;
