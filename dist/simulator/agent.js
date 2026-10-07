import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { findMorpheusBinary } from "../self-auto-update.js";
import { DEFAULT_IDLE_HOURS, defaultExec } from "./watchdog.js";
/**
 * The per-device launchd agent that runs the idle sweep, and the preference that governs it.
 *
 * Enabling is an explicit device action, never a side effect of installing Morpheus — the same rule
 * as codebase-memory and auto-update (`.agent/decisions.md`): a background job on someone's Mac is
 * theirs to turn on. `refresh` is the one thing that runs unprompted, after a Morpheus update, and
 * it only repairs an agent the person already enabled; a recorded `disabled` is never reversed.
 */
export const WATCHDOG_LABEL = "morpheus.simulator-watchdog";
export const WATCHDOG_INTERVAL_SECONDS = 1800;
export const WATCHDOG_SCHEMA = 1;
export function watchdogPaths(home = homedir()) {
    return {
        config: process.env["MORPHEUS_SIMULATOR_WATCHDOG_CONFIG"] ?? join(home, ".morpheus", "simulator-watchdog.json"),
        plist: join(home, "Library", "LaunchAgents", `${WATCHDOG_LABEL}.plist`),
        log: join(home, "Library", "Logs", "morpheus", "simulator-watchdog.log"),
    };
}
export async function readWatchdogConfig(path = watchdogPaths().config) {
    let raw;
    try {
        raw = await readFile(path, "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return { path, preference: "unconfigured", idleHours: DEFAULT_IDLE_HOURS };
        return { path, preference: "invalid", idleHours: DEFAULT_IDLE_HOURS, detail: error instanceof Error ? error.message : String(error) };
    }
    try {
        const parsed = JSON.parse(raw);
        const hours = parsed.idleHours;
        if (parsed.schema !== WATCHDOG_SCHEMA || typeof parsed.enabled !== "boolean" || typeof parsed.changedAt !== "string" ||
            (hours !== undefined && !(typeof hours === "number" && Number.isFinite(hours) && hours >= 1))) {
            return { path, preference: "invalid", idleHours: DEFAULT_IDLE_HOURS, detail: "the file does not match schema 1" };
        }
        return { path, preference: parsed.enabled ? "enabled" : "disabled", idleHours: hours ?? DEFAULT_IDLE_HOURS };
    }
    catch (error) {
        return { path, preference: "invalid", idleHours: DEFAULT_IDLE_HOURS, detail: `invalid JSON (${error instanceof Error ? error.message : String(error)})` };
    }
}
async function writeWatchdogConfig(path, enabled, idleHours, now) {
    await mkdir(dirname(path), { recursive: true });
    const config = { schema: WATCHDOG_SCHEMA, enabled, ...(idleHours === undefined ? {} : { idleHours }), changedAt: now.toISOString() };
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
/** The default is never written down, so a later change to it reaches every device that never chose one. */
const storedHours = (hours) => (hours === DEFAULT_IDLE_HOURS ? undefined : hours);
const xml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
/**
 * The agent runs the installed `morpheus` — never a source checkout or worktree, which can be
 * removed under it. launchd's PATH is minimal, so the CLI's own directory and the Node that runs
 * it are put on it. The idle threshold is deliberately not in the plist: `run` reads the
 * preference, so changing it never rewrites or reloads the agent.
 */
export function agentPlist({ binary, node, log }) {
    const path = [...new Set([dirname(binary), dirname(node), "/usr/bin", "/bin", "/usr/sbin", "/sbin"])].join(delimiter);
    const args = [binary, "simulator", "watchdog", "run", "--quiet"];
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xml(WATCHDOG_LABEL)}</string>
<key>ProgramArguments</key><array>${args.map((a) => `<string>${xml(a)}</string>`).join("")}</array>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(path)}</string></dict>
<key>RunAtLoad</key><true/>
<key>StartInterval</key><integer>${WATCHDOG_INTERVAL_SECONDS}</integer>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${xml(log)}</string>
<key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>
`;
}
const resolved = (deps) => ({
    paths: deps.paths ?? watchdogPaths(),
    run: deps.run ?? defaultExec,
    findBinary: deps.findBinary ?? (() => findMorpheusBinary()),
    platform: deps.platform ?? process.platform,
    uid: deps.uid ?? process.getuid?.() ?? 0,
    node: deps.node ?? process.execPath,
    now: deps.now ?? new Date(),
    hasSimctl: deps.hasSimctl ?? ((run) => { try {
        run("xcrun", ["--find", "simctl"]);
        return true;
    }
    catch {
        return false;
    } }),
});
const target = (uid) => `gui/${uid}/${WATCHDOG_LABEL}`;
function isLoaded(run, uid) {
    try {
        run("launchctl", ["print", target(uid)]);
        return true;
    }
    catch {
        return false;
    }
}
async function readOptional(path) {
    try {
        return await readFile(path, "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw error;
    }
}
/** Writes the agent when it differs, and loads it when it is not loaded. Safe to repeat. */
async function installAgent(deps, binary) {
    const { paths, run, uid, node } = deps;
    const wanted = agentPlist({ binary, node, log: paths.log });
    const existing = await readOptional(paths.plist);
    const changed = existing !== wanted;
    if (changed) {
        await mkdir(dirname(paths.plist), { recursive: true });
        await mkdir(dirname(paths.log), { recursive: true });
        await writeFile(paths.plist, wanted, "utf8");
    }
    const loaded = isLoaded(run, uid);
    if (loaded && !changed)
        return { outcome: "current", warnings: [] };
    const warnings = [];
    try {
        // A changed agent must be unloaded first: bootstrap refuses a label that is already loaded.
        if (loaded)
            run("launchctl", ["bootout", target(uid)]);
        run("launchctl", ["bootstrap", `gui/${uid}`, paths.plist]);
    }
    catch (error) {
        const why = error.stderr?.toString().trim() || error.message;
        warnings.push(`launchd would not load the agent now (${why.split("\n")[0]}); it loads at your next login.`);
    }
    return { outcome: existing === null ? "installed" : changed ? "updated" : "loaded", warnings };
}
async function removeAgent(deps) {
    const { paths, run, uid } = deps;
    const existing = await readOptional(paths.plist);
    if (isLoaded(run, uid)) {
        try {
            run("launchctl", ["bootout", target(uid)]);
        }
        catch { /* removing the plist below still stops the next login */ }
    }
    if (existing === null)
        return "absent";
    await rm(paths.plist, { force: true });
    return "removed";
}
function requireMacWithXcode(deps) {
    if (deps.platform !== "darwin")
        throw new Error("The simulator watchdog needs macOS and Xcode.");
    if (!deps.hasSimctl(deps.run))
        throw new Error("Xcode's simctl was not found. Install Xcode and select it with xcode-select, then retry.");
}
export async function enableWatchdog({ idleHours, ...rest } = {}) {
    const deps = resolved(rest);
    requireMacWithXcode(deps);
    const binary = await deps.findBinary();
    if (!binary)
        throw new Error("morpheus is not on PATH, and the agent must run an installed copy. Run `morpheus self install` from a clean main checkout.");
    const previous = await readWatchdogConfig(deps.paths.config);
    await writeWatchdogConfig(deps.paths.config, true, storedHours(idleHours ?? previous.idleHours), deps.now);
    const { outcome, warnings } = await installAgent(deps, binary);
    return { config: await readWatchdogConfig(deps.paths.config), agent: outcome, warnings, plist: deps.paths.plist, log: deps.paths.log };
}
/** Removes the agent and records the choice, so `refresh` never brings it back. */
export async function disableWatchdog(rest = {}) {
    const deps = resolved(rest);
    const previous = await readWatchdogConfig(deps.paths.config);
    await writeWatchdogConfig(deps.paths.config, false, storedHours(previous.idleHours), deps.now);
    const agent = await removeAgent(deps);
    return { config: await readWatchdogConfig(deps.paths.config), agent, warnings: [], plist: deps.paths.plist, log: deps.paths.log };
}
/**
 * Repairs the agent after a Morpheus update, only for a device that enabled it. `unconfigured`
 * does nothing; `disabled` makes sure no stale agent is left behind.
 */
export async function refreshWatchdog(rest = {}) {
    const deps = resolved(rest);
    const config = await readWatchdogConfig(deps.paths.config);
    const base = { config, warnings: [], plist: deps.paths.plist, log: deps.paths.log };
    if (deps.platform !== "darwin" || config.preference === "unconfigured" || config.preference === "invalid")
        return { ...base, agent: "absent" };
    if (config.preference === "disabled")
        return { ...base, agent: await removeAgent(deps) };
    const binary = await deps.findBinary();
    if (!binary)
        return { ...base, agent: "absent", warnings: ["morpheus is not on PATH, so the simulator watchdog agent was left as it was."] };
    const { outcome, warnings } = await installAgent(deps, binary);
    return { ...base, agent: outcome, warnings };
}
export async function watchdogStatus(rest = {}) {
    const deps = resolved(rest);
    const config = await readWatchdogConfig(deps.paths.config);
    const binary = await deps.findBinary();
    const existing = await readOptional(deps.paths.plist);
    const wanted = binary ? agentPlist({ binary, node: deps.node, log: deps.paths.log }) : null;
    return {
        config,
        plist: existing === null ? "missing" : existing === wanted ? "current" : "stale",
        loaded: isLoaded(deps.run, deps.uid),
        binary,
        paths: deps.paths,
    };
}
/**
 * One line for an iOS project's agent when this Mac has not decided. Null for a Mac that has —
 * enabled or disabled — so nobody who said no is asked again.
 */
export async function watchdogNudge(rest = {}) {
    const deps = resolved(rest);
    if (deps.platform !== "darwin")
        return null;
    const config = await readWatchdogConfig(deps.paths.config);
    if (config.preference !== "unconfigured" || !deps.hasSimctl(deps.run))
        return null;
    return "This Mac has no simulator watchdog: a forgotten booted simulator holds RAM, and its data once filled a disk. " +
        "Run `morpheus simulator watchdog enable` to shut down any simulator idle for 24 hours.";
}
//# sourceMappingURL=agent.js.map