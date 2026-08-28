import { type MorpheusInstallResult, type MorpheusInstallStatus } from "./self.js";
export declare const AUTO_UPDATE_START = "# morpheus:auto-update:start";
export declare const AUTO_UPDATE_END = "# morpheus:auto-update:end";
export declare const AUTO_UPDATE_SCHEMA = 1;
export declare const AUTO_UPDATE_LOCK_STALE_MS: number;
declare const HOOKS: readonly ["post-merge", "post-rewrite"];
export type AutoUpdatePreference = "unconfigured" | "enabled" | "disabled" | "invalid";
export interface AutoUpdateConfigState {
    path: string;
    preference: AutoUpdatePreference;
    detail?: string;
}
export declare function autoUpdateConfigPath(): string;
export declare function readAutoUpdateConfig(path?: string): Promise<AutoUpdateConfigState>;
export declare function findMorpheusBinary(pathValue?: string): Promise<string | null>;
export declare function autoUpdateHookBlock(binaryPath: string): string;
export type HookOutcome = "created" | "updated" | "present" | "removed" | "absent" | "blocked";
export interface HookRepair {
    root: string;
    hook: (typeof HOOKS)[number];
    path: string;
    outcome: HookOutcome;
    detail: string;
}
export declare function installProjectAutoUpdate(root: string, binaryPath: string): Promise<HookRepair[]>;
export declare function removeProjectAutoUpdate(root: string): Promise<HookRepair[]>;
export declare function inspectProjectAutoUpdate(root: string): Promise<HookRepair[]>;
export interface EnsureOptions {
    configPath?: string;
    now?: Date;
    status?: () => Promise<MorpheusInstallStatus>;
    update?: () => Promise<MorpheusInstallResult>;
}
export type EnsureOutcome = "disabled" | "current" | "updated" | "deferred" | "busy" | "failed";
export interface EnsureResult {
    outcome: EnsureOutcome;
    detail: string;
    commit?: string;
}
export declare function ensureAutoUpdate(opts?: EnsureOptions): Promise<EnsureResult>;
export interface AutoUpdateOptions extends EnsureOptions {
    registryPath?: string;
    binaryPath?: string;
}
export interface AutoUpdateChange {
    config: AutoUpdateConfigState;
    hooks: HookRepair[];
    ensure?: EnsureResult;
}
export declare function enableAutoUpdate(currentRoot: string, opts?: AutoUpdateOptions): Promise<AutoUpdateChange>;
export declare function disableAutoUpdate(currentRoot: string, opts?: AutoUpdateOptions): Promise<AutoUpdateChange>;
export declare function autoUpdateStatus(currentRoot: string, opts?: AutoUpdateOptions): Promise<AutoUpdateChange>;
export {};
