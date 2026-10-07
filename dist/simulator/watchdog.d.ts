/**
 * The idle-simulator sweep behind `morpheus simulator watchdog run`.
 *
 * A booted simulator is shut down when it has been booted for the whole threshold *and* nothing
 * showed activity inside it. The only simctl write it can issue is `shutdown` of one named device:
 * never `delete`, never `erase`, never `shutdown all` — the rules `qa preview ios` already keeps,
 * and the reason a wrong guess here costs a reboot rather than someone's data.
 *
 * **What counts as activity** was measured on a real Mac (2026-10-06), not assumed. Whole-tree
 * mtimes are useless: logd, IdentityServices and `com.apple.xpc.activity2` write every minute on
 * a device nobody touches. Apple's own AppGroup and PluginKit containers are no better — the News
 * widget cache, chrono timelines and Intelligence embeddings are rewritten every few minutes.
 * Counting either would make every simulator look busy forever. What is left, and what this uses:
 *
 * - the device's boot time, from the age of its `launchd_sim` process;
 * - writes inside **user-installed** apps' data containers (`simctl listapps` marks them
 *   `ApplicationType = User`; the 39 system apps are ignored), and an install or reinstall;
 * - an explicit heartbeat from tooling that drives the device (`activity.ts`).
 *
 * Whatever cannot be measured keeps the device up. A watchdog that guesses wrong shuts down
 * someone's work; one that is cautious leaves a device running until the next sweep.
 */
export declare const DEFAULT_IDLE_HOURS = 24;
export declare const MIN_IDLE_HOURS = 1;
export declare const MAX_IDLE_HOURS = 720;
/** Entries a container walk may inspect before the device is reported as unmeasurable. */
export declare const WALK_BUDGET = 250000;
export type Exec = (command: string, args: string[], input?: string) => string;
export declare const defaultExec: Exec;
/** Everything a failed command said: its stderr, or the error's own message. */
export declare const errorText: (error: unknown) => string;
/**
 * The cause, not the header. simctl reports `An error was encountered processing the command
 * (domain=…, code=405):` and then the reason on the next line, and `execFile` prefixes its own
 * "Command failed:" line, so the useful text is always last.
 */
export declare const errorSummary: (error: unknown) => string;
export declare function parseIdleHours(value: string): number;
export type DeviceSet = "default" | "testing";
export declare const testingSetDirectory: () => string;
export interface BootedDevice {
    udid: string;
    name: string;
    set: DeviceSet;
}
/**
 * Booted devices in the default set and in XCTest's parallel-clone set. A killed test run leaves
 * its `Clone N of …` devices booted in the second one, which `simctl list` does not show by default.
 */
export declare function listBooted(exec: Exec, testingSet?: boolean): {
    devices: BootedDevice[];
    issues: string[];
};
/** `ps` elapsed time, `[[dd-]hh:]mm:ss`, in seconds. Locale and time-zone independent, unlike `lstart`. */
export declare function parseEtime(value: string): number | null;
export interface RunningDevice {
    udid: string;
    /** The device directory: `<set>/<UDID>`. Its `data/` holds the containers. */
    root: string;
    bootedAt: number;
}
/**
 * Boot time per device, from `ps -axo etime=,command=`. CoreSimulator does not record when a
 * device booted; the device's own `launchd_sim` process is created at boot and lives until
 * shutdown, so its age is the device's uptime. The same line names the device directory, so the
 * default and testing sets need no path assumptions.
 */
export declare function parseRunningDevices(ps: string, now: number): Map<string, RunningDevice>;
/** Devices that a running `xcodebuild` or `xctest` addresses by UDID, e.g. `-destination id=…`. */
export declare function busyDevices(ps: string): Set<string>;
export interface UserApp {
    bundleId: string;
    /** The app's data container, where its own writes land. */
    dataContainer: string | null;
    /** The `<GUID>` directory holding `<Name>.app`; its mtime moves on an install or reinstall. */
    bundleContainer: string | null;
    app: string | null;
}
/** User-installed apps from `simctl listapps` converted to JSON. System apps are not activity. */
export declare function parseUserApps(json: string): UserApp[];
/**
 * The first write strictly after `since` under `root`, directories included (an entry added or
 * removed moves its parent's mtime). It stops at the first hit — proving "active" needs no more,
 * and an idle device is the only case that walks the whole tree. Symlinks are never followed. A
 * walk over `budget` entries reports `truncated` rather than a verdict.
 */
export declare function writtenSince(root: string, since: number, budget?: number): {
    found: number | null;
    truncated: boolean;
    unreadable: boolean;
};
export type Activity = {
    kind: "active";
    source: string;
    at: number;
} | {
    kind: "idle";
} | {
    kind: "unmeasurable";
    why: string;
};
/** Cheapest signals first: the heartbeat, then installs, then the walk over each app's data. */
export declare function recentActivity({ udid, apps, since, heartbeatDir, budget }: {
    udid: string;
    apps: UserApp[];
    since: number;
    heartbeatDir?: string;
    budget?: number;
}): Activity;
export declare function formatDuration(ms: number): string;
export interface Decision {
    udid: string;
    name: string;
    set: DeviceSet;
    action: "shutdown" | "keep";
    reason: string;
    /** True only when a shutdown was issued and succeeded. */
    shutDown: boolean;
    error?: string;
}
export interface SweepOptions {
    idleHours?: number;
    dryRun?: boolean;
    now?: number;
    exec?: Exec;
    heartbeatDir?: string;
    /** Whether the XCTest parallel-clone set exists; defaults to checking the disk. */
    testingSet?: boolean;
    walkBudget?: number;
}
export interface SweepResult {
    idleHours: number;
    decisions: Decision[];
    issues: string[];
}
/** Decides each booted device and, unless `dryRun`, shuts down the ones that are idle. */
export declare function sweep(options?: SweepOptions): SweepResult;
/** Human-readable lines. `quiet` prints only what changed or went wrong, for the launchd log. */
export declare function formatSweep(result: SweepResult, { dryRun, quiet }?: {
    dryRun?: boolean;
    quiet?: boolean;
}): string;
