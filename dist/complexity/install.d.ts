import { type LizardPin } from "./pin.js";
export interface RunResult {
    code: number;
    stdout: string;
    stderr: string;
}
/** Every external program is started with an argument array; nothing reaches a shell. */
export declare function run(command: string, args: string[], opts?: {
    cwd?: string;
    input?: string;
    env?: NodeJS.ProcessEnv;
}): Promise<RunResult>;
export declare const RUNNER_PATH: string;
export interface Toolchain {
    dir: string;
    lizard: string;
    python: string;
}
export declare function toolchainFor(pin?: LizardPin, env?: NodeJS.ProcessEnv): Toolchain;
export type ToolStatus = {
    state: "ok";
    toolchain: Toolchain;
    lizardVersion: string | null;
    python: string;
} | {
    state: "missing" | "broken";
    toolchain: Toolchain;
    reason: string;
};
/**
 * Runs the canary through the installed runtime. `ready.json` only names what
 * was installed; this is the proof it still works.
 */
export declare function toolStatus(pin?: LizardPin, env?: NodeJS.ProcessEnv): Promise<ToolStatus>;
export type InstallResult = {
    ok: true;
    status: ToolStatus;
    changed: boolean;
} | {
    ok: false;
    reason: string;
};
/**
 * Installs the pinned analyzer: Lizard fetched by commit id, its two wheels
 * into a venv by hash. Built in a scratch directory and renamed into place,
 * so a failed install never leaves a stamp. Idempotent: a working install is
 * left alone.
 */
export declare function installLizard(pin?: LizardPin, env?: NodeJS.ProcessEnv): Promise<InstallResult>;
export declare function checkPython(python: string, pin: LizardPin): Promise<string | null>;
export declare function formatStatus(status: ToolStatus): string;
