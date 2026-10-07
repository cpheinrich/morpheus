import { type Exec } from "./watchdog.js";
/**
 * The per-device launchd agent that runs the idle sweep, and the preference that governs it.
 *
 * Enabling is an explicit device action, never a side effect of installing Morpheus — the same rule
 * as codebase-memory and auto-update (`.agent/decisions.md`): a background job on someone's Mac is
 * theirs to turn on. `refresh` is the one thing that runs unprompted, after a Morpheus update, and
 * it only repairs an agent the person already enabled; a recorded `disabled` is never reversed.
 */
export declare const WATCHDOG_LABEL = "morpheus.simulator-watchdog";
export declare const WATCHDOG_INTERVAL_SECONDS = 1800;
export declare const WATCHDOG_SCHEMA = 1;
export type WatchdogPreference = "unconfigured" | "enabled" | "disabled" | "invalid";
export interface WatchdogConfigState {
    path: string;
    preference: WatchdogPreference;
    idleHours: number;
    detail?: string;
}
export interface WatchdogPaths {
    config: string;
    plist: string;
    log: string;
}
export declare function watchdogPaths(home?: string): WatchdogPaths;
export declare function readWatchdogConfig(path?: string): Promise<WatchdogConfigState>;
/**
 * The agent runs the installed `morpheus` — never a source checkout or worktree, which can be
 * removed under it. launchd's PATH is minimal, so the CLI's own directory and the Node that runs
 * it are put on it. The idle threshold is deliberately not in the plist: `run` reads the
 * preference, so changing it never rewrites or reloads the agent.
 */
export declare function agentPlist({ binary, node, log }: {
    binary: string;
    node: string;
    log: string;
}): string;
export interface AgentDeps {
    paths?: WatchdogPaths;
    run?: Exec;
    findBinary?: () => Promise<string | null>;
    platform?: NodeJS.Platform;
    uid?: number;
    node?: string;
    now?: Date;
    /** Whether Xcode's simctl exists on this Mac. */
    hasSimctl?: (run: Exec) => boolean;
}
export type AgentOutcome = "installed" | "updated" | "loaded" | "current" | "removed" | "absent";
export interface WatchdogChange {
    config: WatchdogConfigState;
    agent: AgentOutcome;
    /** Problems that did not stop the change: the agent is on disk but launchd would not load it now. */
    warnings: string[];
    plist: string;
    log: string;
}
export declare function enableWatchdog({ idleHours, ...rest }?: {
    idleHours?: number;
} & AgentDeps): Promise<WatchdogChange>;
/** Removes the agent and records the choice, so `refresh` never brings it back. */
export declare function disableWatchdog(rest?: AgentDeps): Promise<WatchdogChange>;
/**
 * Repairs the agent after a Morpheus update, only for a device that enabled it. `unconfigured`
 * does nothing; `disabled` makes sure no stale agent is left behind.
 */
export declare function refreshWatchdog(rest?: AgentDeps): Promise<WatchdogChange>;
export interface WatchdogStatus {
    config: WatchdogConfigState;
    /** `current`: the file is what this Morpheus would write. `stale`: it differs. `missing`: no file. */
    plist: "current" | "stale" | "missing";
    loaded: boolean;
    binary: string | null;
    paths: WatchdogPaths;
}
export declare function watchdogStatus(rest?: AgentDeps): Promise<WatchdogStatus>;
/**
 * One line for an iOS project's agent when this Mac has not decided. Null for a Mac that has —
 * enabled or disabled — so nobody who said no is asked again.
 */
export declare function watchdogNudge(rest?: AgentDeps): Promise<string | null>;
