import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { activityPath } from "./activity.js";
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
export const DEFAULT_IDLE_HOURS = 24;
export const MIN_IDLE_HOURS = 1;
export const MAX_IDLE_HOURS = 720;
/** Entries a container walk may inspect before the device is reported as unmeasurable. */
export const WALK_BUDGET = 250_000;
export const defaultExec = (command, args, input) => execFileSync(command, args, {
    encoding: "utf8",
    input,
    timeout: 60_000,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
}).toString();
const message = (error) => {
    const e = error;
    const stderr = e?.stderr?.toString().trim();
    return (stderr || e?.message || String(error)).split("\n")[0];
};
export function parseIdleHours(value) {
    const hours = Number(value);
    if (!/^\d+(\.\d+)?$/.test(value) || hours < MIN_IDLE_HOURS || hours > MAX_IDLE_HOURS) {
        throw new Error(`--idle-hours must be a number from ${MIN_IDLE_HOURS} to ${MAX_IDLE_HOURS}.`);
    }
    return hours;
}
const SET_ARGS = { default: [], testing: ["--set", "testing"] };
export const testingSetDirectory = () => join(homedir(), "Library", "Developer", "XCTestDevices");
/** `simctl --set testing` prints a banner line before its JSON; everything before the brace is noise. */
function deviceList(output) {
    const parsed = JSON.parse(output.slice(output.indexOf("{")));
    return Object.values(parsed.devices ?? {}).flat();
}
/**
 * Booted devices in the default set and in XCTest's parallel-clone set. A killed test run leaves
 * its `Clone N of …` devices booted in the second one, which `simctl list` does not show by default.
 */
export function listBooted(exec, testingSet = existsSync(testingSetDirectory())) {
    const devices = [];
    const issues = [];
    for (const set of ["default", "testing"]) {
        if (set === "testing" && !testingSet)
            continue;
        try {
            for (const d of deviceList(exec("xcrun", ["simctl", ...SET_ARGS[set], "list", "devices", "-j"]))) {
                if (d.state === "Booted")
                    devices.push({ udid: d.udid.toUpperCase(), name: d.name, set });
            }
        }
        catch (error) {
            issues.push(`Could not list the ${set} simulator set: ${message(error)}`);
        }
    }
    return { devices, issues };
}
const ETIME = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/;
/** `ps` elapsed time, `[[dd-]hh:]mm:ss`, in seconds. Locale and time-zone independent, unlike `lstart`. */
export function parseEtime(value) {
    const m = ETIME.exec(value.trim());
    if (!m)
        return null;
    return ((Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3])) * 60 + Number(m[4]);
}
const LAUNCHD_SIM = /^\s*(\S+)\s+launchd_sim\s+(\/.+)\/data\/var\/run\/launchd_bootstrap\.plist\s*$/;
/**
 * Boot time per device, from `ps -axo etime=,command=`. CoreSimulator does not record when a
 * device booted; the device's own `launchd_sim` process is created at boot and lives until
 * shutdown, so its age is the device's uptime. The same line names the device directory, so the
 * default and testing sets need no path assumptions.
 */
export function parseRunningDevices(ps, now) {
    const running = new Map();
    for (const line of ps.split("\n")) {
        const m = LAUNCHD_SIM.exec(line);
        if (!m)
            continue;
        const seconds = parseEtime(m[1]);
        if (seconds === null)
            continue;
        const root = m[2];
        const udid = basename(root).toUpperCase();
        running.set(udid, { udid, root, bootedAt: now - seconds * 1000 });
    }
    return running;
}
const UDID_ANYWHERE = /\b[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}\b/gi;
const TEST_TOOL = /(?:^|[\s/])(?:xcodebuild|xctest)(?:\s|$)/;
/** Devices that a running `xcodebuild` or `xctest` addresses by UDID, e.g. `-destination id=…`. */
export function busyDevices(ps) {
    const busy = new Set();
    for (const line of ps.split("\n")) {
        if (!TEST_TOOL.test(line))
            continue;
        for (const id of line.match(UDID_ANYWHERE) ?? [])
            busy.add(id.toUpperCase());
    }
    return busy;
}
const filePath = (url) => {
    try {
        return url ? fileURLToPath(url) : null;
    }
    catch {
        return null;
    }
};
/** User-installed apps from `simctl listapps` converted to JSON. System apps are not activity. */
export function parseUserApps(json) {
    const apps = JSON.parse(json);
    return Object.entries(apps)
        .filter(([, app]) => app.ApplicationType === "User")
        .map(([bundleId, app]) => {
        const bundle = filePath(app.Bundle);
        return { bundleId, dataContainer: filePath(app.DataContainer), app: bundle, bundleContainer: bundle ? dirname(bundle) : null };
    });
}
/**
 * The first write strictly after `since` under `root`, directories included (an entry added or
 * removed moves its parent's mtime). It stops at the first hit — proving "active" needs no more,
 * and an idle device is the only case that walks the whole tree. Symlinks are never followed. A
 * walk over `budget` entries reports `truncated` rather than a verdict.
 */
export function writtenSince(root, since, budget = WALK_BUDGET) {
    const mtime = (path) => {
        try {
            return lstatSync(path).mtimeMs;
        }
        catch {
            return null;
        }
    };
    const stack = [root];
    let seen = 0;
    while (stack.length) {
        const dir = stack.pop();
        if (++seen > budget)
            return { found: null, truncated: true };
        const own = mtime(dir);
        if (own !== null && own > since)
            return { found: own, truncated: false };
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (++seen > budget)
                return { found: null, truncated: true };
            if (entry.isSymbolicLink())
                continue;
            const path = join(dir, entry.name);
            if (entry.isDirectory()) {
                stack.push(path);
                continue;
            }
            const t = mtime(path);
            if (t !== null && t > since)
                return { found: t, truncated: false };
        }
    }
    return { found: null, truncated: false };
}
/** Cheapest signals first: the heartbeat, then installs, then the walk over each app's data. */
export function recentActivity({ udid, apps, since, heartbeatDir, budget }) {
    const beat = activityPath(udid, heartbeatDir);
    if (beat) {
        try {
            const at = statSync(beat).mtimeMs;
            if (at > since)
                return { kind: "active", source: "driven by Morpheus tooling", at };
        }
        catch { /* no heartbeat file: nothing has driven this device */ }
    }
    const mtime = (path) => {
        if (!path)
            return null;
        try {
            return lstatSync(path).mtimeMs;
        }
        catch {
            return null;
        }
    };
    for (const app of apps) {
        for (const path of [app.bundleContainer, app.app]) {
            const at = mtime(path);
            if (at !== null && at > since)
                return { kind: "active", source: `${app.bundleId} was installed`, at };
        }
    }
    for (const app of apps) {
        if (!app.dataContainer)
            continue;
        const { found, truncated } = writtenSince(app.dataContainer, since, budget);
        if (found !== null)
            return { kind: "active", source: `${app.bundleId} wrote data`, at: found };
        if (truncated)
            return { kind: "unmeasurable", why: `${app.bundleId}'s container has too many files to inspect` };
    }
    return { kind: "idle" };
}
export function formatDuration(ms) {
    const minutes = Math.max(0, Math.floor(ms / 60_000));
    const hours = Math.floor(minutes / 60);
    return hours >= 1 ? `${hours}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
}
function userApps(exec, device) {
    const listing = exec("xcrun", ["simctl", ...SET_ARGS[device.set], "listapps", device.udid]);
    return parseUserApps(exec("plutil", ["-convert", "json", "-o", "-", "-"], listing));
}
/** Decides each booted device and, unless `dryRun`, shuts down the ones that are idle. */
export function sweep(options = {}) {
    const idleHours = options.idleHours ?? DEFAULT_IDLE_HOURS;
    if (!(idleHours >= MIN_IDLE_HOURS))
        throw new Error(`The idle threshold must be at least ${MIN_IDLE_HOURS} hour.`);
    const exec = options.exec ?? defaultExec;
    const now = options.now ?? Date.now();
    const threshold = idleHours * 3_600_000;
    const since = now - threshold;
    const result = { idleHours, decisions: [], issues: [] };
    const { devices, issues } = listBooted(exec, options.testingSet);
    result.issues.push(...issues);
    if (devices.length === 0)
        return result;
    let ps = "";
    try {
        ps = exec("ps", ["-axo", "etime=,command="]);
    }
    catch (error) {
        // Without boot times nothing can be aged, so nothing is shut down.
        result.issues.push(`Could not read the process list: ${message(error)}`);
    }
    const running = parseRunningDevices(ps, now);
    const busy = busyDevices(ps);
    for (const device of devices) {
        const decision = { udid: device.udid, name: device.name, set: device.set, action: "keep", reason: "", shutDown: false };
        result.decisions.push(decision);
        const run = running.get(device.udid);
        if (!run) {
            decision.reason = "its boot time could not be read";
            continue;
        }
        const age = now - run.bootedAt;
        if (age < threshold) {
            decision.reason = `booted ${formatDuration(age)} ago`;
            continue;
        }
        if (busy.has(device.udid)) {
            decision.reason = "a running xcodebuild addresses it";
            continue;
        }
        let activity;
        try {
            activity = recentActivity({ udid: device.udid, apps: userApps(exec, device), since, heartbeatDir: options.heartbeatDir, budget: options.walkBudget });
        }
        catch (error) {
            activity = { kind: "unmeasurable", why: `its apps could not be listed (${message(error)})` };
        }
        if (activity.kind === "active") {
            decision.reason = `booted ${formatDuration(age)} ago; ${activity.source} ${formatDuration(now - activity.at)} ago`;
            continue;
        }
        if (activity.kind === "unmeasurable") {
            decision.reason = `booted ${formatDuration(age)} ago; activity could not be measured: ${activity.why}`;
            continue;
        }
        decision.action = "shutdown";
        decision.reason = `booted ${formatDuration(age)} ago with no activity in the last ${idleHours}h`;
        if (options.dryRun)
            continue;
        try {
            exec("xcrun", ["simctl", ...SET_ARGS[device.set], "shutdown", device.udid]);
            decision.shutDown = true;
        }
        catch (error) {
            const why = message(error);
            // Something else shut it down between the listing and now: the outcome is the one we wanted.
            if (/current state: Shutdown/i.test(why))
                decision.shutDown = true;
            else
                decision.error = why;
        }
    }
    return result;
}
/** Human-readable lines. `quiet` prints only what changed or went wrong, for the launchd log. */
export function formatSweep(result, { dryRun = false, quiet = false } = {}) {
    const lines = [];
    for (const d of result.decisions) {
        const label = `${d.name} (${d.udid})${d.set === "testing" ? " [XCTest clone]" : ""}`;
        if (d.action === "shutdown") {
            if (d.error)
                lines.push(`✗ ${label}: could not shut down: ${d.error}`);
            else
                lines.push(`${dryRun ? "~ would shut down" : "✓ shut down"} ${label}: ${d.reason}`);
        }
        else if (!quiet)
            lines.push(`· kept ${label}: ${d.reason}`);
    }
    for (const issue of result.issues)
        lines.push(`✗ ${issue}`);
    if (!quiet && result.decisions.length === 0 && result.issues.length === 0)
        lines.push("No booted simulators.");
    return lines.join("\n");
}
//# sourceMappingURL=watchdog.js.map