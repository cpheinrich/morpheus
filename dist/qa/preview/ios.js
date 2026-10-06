import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { homedir, hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { expand } from "./config.js";
export const defaultRun = (command, args, options = {}) => {
    const stdio = options.stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"];
    return (execFileSync(command, args, { encoding: "utf8", cwd: options.cwd, env: options.env, stdio: stdio }) ?? "").toString().trim();
};
/** Overlay port follows the preview port, so two checkouts' overlays differ. */
export const OVERLAY_PORT_OFFSET = 256;
export const DEFAULT_TTL_MINUTES = 240;
export function parsePreviewArgs(argv, modes) {
    const args = [...argv];
    const options = { command: "start", build: true };
    if (args[0] && !args[0].startsWith("-"))
        options.command = args.shift();
    if (!["start", "status", "stop", "doctor"].includes(options.command))
        throw new Error("Unknown command. Use start, status, stop or doctor.");
    const byFlag = new Map();
    for (const mode of Object.values(modes))
        for (const flag of mode.flags)
            byFlag.set(flag, mode.name);
    while (args.length) {
        const flag = args.shift();
        if (flag === "--no-build")
            options.build = false;
        else if (byFlag.has(flag))
            options.mode = byFlag.get(flag);
        else if (["--port", "--ssh-host", "--ttl-minutes", "--mode"].includes(flag)) {
            const value = args.shift();
            if (!value || value.startsWith("-"))
                throw new Error(`Missing value for ${flag}`);
            if (flag === "--ttl-minutes") {
                if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 1440)
                    throw new Error("TTL must be 1–1440 minutes.");
                options.ttlMinutes = Number(value);
            }
            else if (flag === "--port") {
                if (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) + OVERLAY_PORT_OFFSET > 65535)
                    throw new Error(`Port must be an integer from 1024 to ${65535 - OVERLAY_PORT_OFFSET}.`);
                options.port = Number(value);
            }
            else if (flag === "--mode") {
                if (!modes[value])
                    throw new Error(`Unknown mode "${value}". Declared: ${Object.keys(modes).join(", ")}.`);
                options.mode = value;
            }
            else {
                if (!/^[\w.@-]+$/.test(value))
                    throw new Error("SSH host must be a hostname or user@hostname (or an SSH config alias).");
                options.sshHost = value;
            }
        }
        else
            throw new Error(`Unknown option: ${flag}`);
    }
    return options;
}
/** The checkout key: the first 12 hex of SHA-256 over the app directory's absolute path. */
export function checkoutKey(root, config) {
    return createHash("sha256").update(resolve(root, config.app)).digest("hex").slice(0, 12);
}
/** A per-checkout default port in 3200–3455, so two projects' previews do not collide by default. */
export function defaultPort(key) {
    return 3200 + (Number.parseInt(key.slice(0, 4), 16) % 256);
}
export function selectRuntime(runtimes) {
    const selected = runtimes
        .filter((r) => r.isAvailable && r.identifier.includes(".iOS-") && Number(r.version.split(".")[0]) >= 26)
        .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
    if (!selected)
        throw new Error("No available iOS 26+ simulator runtime. Install one in Xcode > Settings > Components, then retry.");
    if (!selected.supportedDeviceTypes?.some((d) => d.productFamily === "iPhone"))
        throw new Error("The installed iOS runtime has no supported iPhone device type.");
    return selected;
}
const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
export function launchPlist({ label, args, cwd, log, env }) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>${xml(label)}</string>
<key>ProgramArguments</key><array>${args.map((a) => `<string>${xml(a)}</string>`).join("")}</array>
<key>WorkingDirectory</key><string>${xml(cwd)}</string>
<key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k, v]) => `<key>${xml(k)}</key><string>${xml(v)}</string>`).join("")}</dict>
<key>RunAtLoad</key><true/>
<key>StandardOutPath</key><string>${xml(log)}</string>
<key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>\n`;
}
const shellQuote = (value) => (/^[\w./@:=+-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`);
/** Forwards only the overlay: it proxies the stream and input server-side, so one port suffices. */
export function tunnelCommand(host, port) {
    return `ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 127.0.0.1:${port}:127.0.0.1:${port} ${host}`;
}
/** The overlay on this port is ours only if its /health names this preview's stream as upstream. */
async function overlayServes(overlayPort, previewPort) {
    try {
        const response = await fetch(`http://127.0.0.1:${overlayPort}/health`, { signal: AbortSignal.timeout(5000) });
        if (!response.ok)
            return false;
        const body = (await response.json());
        return body.previewUrl === `http://127.0.0.1:${previewPort}/`;
    }
    catch {
        return false;
    }
}
export async function requireFreePort(port) {
    await new Promise((ok, fail) => {
        const server = createServer();
        server.once("error", () => fail(new Error(`Port ${port} is occupied. Use --port with a different port; the existing service will not be stopped.`)));
        server.listen(port, "127.0.0.1", () => server.close(() => ok()));
    });
}
/** Xcode 27 Device Hub can shadow CoreSimulator's legacy touch/keyboard service. */
export function repairSimulatorInput(udid, run = defaultRun) {
    const notification = "com.apple.coredevice.dtuhidd.active";
    const prefix = ["simctl", "spawn", udid];
    if (run("xcrun", [...prefix, "notifyutil", "-g", notification])?.trim() !== `${notification} 1`)
        return false;
    run("xcrun", [...prefix, "notifyutil", "-s", notification, "0"]);
    // Xcode 27 rejects the legacy system/ identifier and terminates the helper that requested it.
    run("xcrun", [...prefix, "launchctl", "kickstart", "-k", "user/foreground/com.apple.backboardd"]);
    return true;
}
/** Shut down this preview's simulator, and only if its name proves this checkout owns it. */
export function shutdownPreview(state, ownerName, sim) {
    const devices = Object.values(JSON.parse(sim("list", "devices", "-j")).devices).flat();
    const device = devices.find((d) => d.udid === state.udid);
    if (!device)
        return;
    if (state.name !== ownerName || device.name !== ownerName)
        throw new Error("Refusing to stop a device not owned by this preview.");
    if (device.state !== "Shutdown")
        sim("shutdown", device.udid);
}
/**
 * Turns a prepare command's stdout into the app's launch environment. Only `{"env": {...}}` with
 * string values is accepted; names must be environment-variable shaped.
 */
export function launchEnvironment(prepared) {
    let parsed;
    try {
        parsed = JSON.parse(prepared);
    }
    catch {
        throw new Error("The mode's prepare command did not print JSON.");
    }
    const env = parsed?.env;
    if (!env || typeof env !== "object" || Array.isArray(env))
        throw new Error('The mode\'s prepare command must print {"env": {...}}.');
    const out = {};
    for (const [name, value] of Object.entries(env)) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(name) || typeof value !== "string" || !value)
            throw new Error("The mode's prepare command printed an invalid environment entry.");
        out[`SIMCTL_CHILD_${name}`] = value;
    }
    return out;
}
/**
 * Runs a mode's prepare command and returns only the app's launch environment. With
 * `credentials: true` it runs under `morpheus credentials run --`. Its output is captured in memory
 * (piped, never inherited) and a failure reports a fixed message, so nothing the command printed —
 * a token included — can reach a terminal, a log, state or launchd.
 */
export function prepareLaunchEnvironment(mode, vars, run) {
    if (!mode.prepare)
        return {};
    const command = mode.prepare.command.map((a) => expand(a, vars));
    const [c, ...a] = mode.prepare.credentials ? ["morpheus", "credentials", "run", "--", ...command] : command;
    let out;
    try {
        out = run(c, a, { cwd: vars.root, stdio: "pipe" });
    }
    catch {
        throw new Error(`The ${mode.name} mode could not prepare its launch. Check morpheus credentials setup; no other mode was launched.`);
    }
    return launchEnvironment(out);
}
// Signal handlers only record intent. The operation owns sequencing and awaits its current
// stop/readiness work before cleanup; callers retain their lock until this settles.
export async function withPreviewCancellation(operation, cleanup, signals = process) {
    let cancelled = false;
    const interrupt = () => { cancelled = true; };
    const check = () => { if (cancelled)
        throw new Error("Preview operation interrupted."); };
    signals.on("SIGTERM", interrupt);
    signals.on("SIGINT", interrupt);
    try {
        const result = await operation(check);
        check();
        return result;
    }
    finally {
        try {
            if (cancelled)
                await cleanup();
        }
        finally {
            signals.removeListener("SIGTERM", interrupt);
            signals.removeListener("SIGINT", interrupt);
        }
    }
}
/** serve-sim's CLI. Its exports hide the file, so it is found beside an exported entry. */
export function serveSimCli() {
    const require = createRequire(import.meta.url);
    const dist = dirname(require.resolve("serve-sim/middleware"));
    const version = JSON.parse(readFileSync(join(dist, "..", "package.json"), "utf8")).version;
    return { path: join(dist, "serve-sim.js"), version };
}
export function previewContext(root, config, run = defaultRun, log = console.log) {
    const key = checkoutKey(root, config);
    const stateDir = join(homedir(), "Library", "Caches", config.namespace, key);
    const label = `${config.namespace}.${key}`;
    return {
        root, config, key, stateDir, stateFile: join(stateDir, "session.json"), label,
        target: `gui/${process.getuid?.()}/${label}`, deviceName: `${config.device.name} ${key}`, run, log,
    };
}
const readJSON = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined);
function writeState(ctx, state) {
    const temporary = `${ctx.stateFile}.tmp`;
    writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
    renameSync(temporary, ctx.stateFile);
}
function job(ctx) {
    try {
        return ctx.run("launchctl", ["print", ctx.target]);
    }
    catch {
        return "";
    }
}
/**
 * serve-sim's page can take over two seconds to answer the first request after it has been idle
 * (measured 2026-10-06), so a single 2 s probe reported a working preview as unhealthy. Five
 * seconds, and the body is released so the probe holds no connection open.
 */
async function reachable(port, path = "/") {
    try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(5000) });
        await response.body?.cancel().catch(() => undefined);
        return response.ok;
    }
    catch {
        return false;
    }
}
function streamRecord(state) {
    return readJSON(join(tmpdir(), "serve-sim", `server-${state.udid}.json`));
}
/** The preview is healthy when launchd's job owns serve-sim on our port and both pages answer. */
export async function healthy(ctx, state) {
    if (!state)
        return false;
    try {
        const record = streamRecord(state);
        const pid = job(ctx).match(/\bpid = (\d+)/)?.[1];
        const owned = record?.device === state.udid && record?.port === state.port
            && (String(record?.pid) === pid || Boolean(pid && record?.pid && ctx.run("ps", ["-o", "ppid=", "-p", String(record.pid)]) === pid));
        if (!owned || !(await reachable(state.port)))
            return false;
        // A legacy preview (started by a project's own script) has no overlay port; it stays usable.
        return state.overlayPort ? overlayServes(state.overlayPort, state.port) : true;
    }
    catch {
        return false;
    }
}
export function report(ctx, state, options) {
    const { log, config } = ctx;
    const overlay = state.overlayPort ? `http://127.0.0.1:${state.overlayPort}/` : undefined;
    log(`Simulator host: ${hostname()}\nCheckout: ${ctx.root}\nSimulator: ${state.name} (${state.udid})\nBuild: ${state.build ?? "unknown"}`);
    log(`Preview expires: ${new Date(state.expiresAt).toISOString()}. Run start to renew, or stop when finished.`);
    const mode = state.mode ? config.modes[state.mode] : undefined;
    if (mode)
        log(mode.summary);
    if (overlay) {
        log(`\nQA overlay: ${overlay}`);
        log("Open the overlay, not the stream, in the agent's browser:");
        log(`  Claude:  the Browser pane (preview_start with this url)\n  Codex:   the in-app browser panel\n  Grok, or any agent without a browser panel:  open ${overlay}`);
        log("Left-click and drag drive the app, right-click pins a comment, Enter saves it, ⌘Enter sends the batch.");
    }
    else {
        log("\nThis preview predates the shared overlay; run start to relaunch it with one.");
    }
    log(`Stream (diagnostics only): http://127.0.0.1:${state.port}/`);
    log(`Inbox: morpheus qa comments pending --root ${shellQuote(ctx.root)}\nInstructions: morpheus qa guide`);
    log(`Log: ${join(ctx.stateDir, "preview.log")}`);
    if (options.sshHost && state.overlayPort)
        log(`\nOn the Mac displaying your browser, leave this running:\n${tunnelCommand(options.sshHost, state.overlayPort)}\nThen open the overlay URL above on that Mac.`);
    else if (!options.sshHost)
        log("Viewing from another Mac? Run status --ssh-host user@simulator-host for the tunnel command.");
}
export function prerequisites(ctx) {
    const { run } = ctx;
    if (process.platform !== "darwin" || process.arch !== "arm64")
        throw new Error("Preview requires an Apple Silicon Mac.");
    if (Number(process.versions.node.split(".")[0]) < 22)
        throw new Error("Install Node.js 22+ and retry.");
    const developer = run("xcode-select", ["-p"]);
    if (!developer.includes(".app/Contents/Developer"))
        throw new Error("Select full Xcode, not Command Line Tools: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer");
    run("xcrun", ["--find", "simctl"]);
    const xcode = run("xcodebuild", ["-version"]).match(/^Xcode (\d+)\.(\d+)/m);
    const [needMajor, needMinor = 0] = ctx.config.minimumXcode.split(".").map(Number);
    const have = xcode ? [Number(xcode[1]), Number(xcode[2])] : [0, 0];
    if (have[0] < needMajor || (have[0] === needMajor && have[1] < needMinor))
        throw new Error(`Install Xcode ${ctx.config.minimumXcode} or newer for this app.`);
    return selectRuntime(JSON.parse(run("xcrun", ["simctl", "list", "runtimes", "-j"])).runtimes);
}
export async function stopPreview(ctx) {
    const state = readJSON(ctx.stateFile);
    const pid = job(ctx).match(/\bpid = (\d+)/)?.[1];
    if (job(ctx))
        ctx.run("launchctl", ["bootout", ctx.target]);
    // Wait for the supervisor's shutdown before another start can boot this device.
    if (pid) {
        for (let attempt = 0; attempt < 150; attempt++) {
            try {
                process.kill(Number(pid), 0);
            }
            catch {
                break;
            }
            if (attempt === 149)
                throw new Error("Preview is still stopping; retry stop before restarting.");
            await sleep(200);
        }
    }
    if (state)
        shutdownPreview(state, ctx.deviceName, (...a) => ctx.run("xcrun", ["simctl", ...a]));
    rmSync(ctx.stateFile, { force: true });
}
const supervisorPath = () => fileURLToPath(new URL("./supervisor.js", import.meta.url));
export async function runPreview(ctx, options) {
    const { run, config, log } = ctx;
    const sim = (...args) => run("xcrun", ["simctl", ...args]);
    const previous = readJSON(ctx.stateFile);
    if (options.command === "status") {
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
            ok = await healthy(ctx, previous);
            if (!ok && previous && attempt < 2)
                await sleep(1000);
        }
        if (!ok)
            throw new Error(`No healthy managed preview for this checkout. Run start. Log: ${join(ctx.stateDir, "preview.log")}`);
        report(ctx, previous, options);
        return;
    }
    const runtime = options.command === "stop" ? undefined : prerequisites(ctx);
    // stop needs only launchctl and simctl; a broken serve-sim install must not keep a preview up.
    const serveSim = options.command === "stop" ? undefined : serveSimCli();
    if (options.command === "doctor") {
        log(`Ready on ${hostname()}: iOS ${runtime.version}; Node ${process.versions.node}; serve-sim ${serveSim.version}. No other Mac is required.`);
        return;
    }
    mkdirSync(ctx.stateDir, { recursive: true, mode: 0o700 });
    // Atomic mkdir prevents concurrent starts/stops from this checkout racing.
    const lock = join(ctx.stateDir, "start.lock");
    try {
        mkdirSync(lock);
    }
    catch {
        throw new Error(`Another preview start is running. If it was interrupted, remove ${lock} after confirming it has ended.`);
    }
    const stop = () => stopPreview(ctx);
    try {
        await withPreviewCancellation(async (checkCancelled) => {
            if (options.command === "stop") {
                await stop();
                log("Stopped this checkout's preview and its overlay. The simulator is shut down; its data is retained.");
                return;
            }
            const port = options.port ?? previous?.port ?? defaultPort(ctx.key);
            const overlayPort = port + OVERLAY_PORT_OFFSET;
            if (previous && options.port && previous.port !== port && job(ctx))
                throw new Error("Stop the current preview before changing its port.");
            const modeName = options.mode ?? config.defaultMode;
            const mode = config.modes[modeName];
            // start deliberately relaunches the app; stop the old supervisor before renewing.
            await stop();
            checkCancelled();
            await requireFreePort(port);
            await requireFreePort(overlayPort);
            checkCancelled();
            const vars = { key: ctx.key, root: ctx.root };
            const cmd = (argv) => argv.map((a) => expand(a, vars));
            if (options.build && config.precheck) {
                const [c, ...a] = cmd(config.precheck);
                run(c, a, { cwd: ctx.root, stdio: "inherit" });
            }
            const devices = (JSON.parse(sim("list", "devices", "available", "-j")).devices[runtime.identifier] ?? []);
            let device = devices.find((d) => d.name === ctx.deviceName);
            if (!device) {
                const types = runtime.supportedDeviceTypes.filter((d) => d.productFamily === "iPhone");
                const type = types.find((d) => d.name === config.device.type) ?? types[0];
                device = { udid: sim("create", ctx.deviceName, type.identifier, runtime.identifier), name: ctx.deviceName };
            }
            // Recover a prior interrupted start that booted before writing state.
            shutdownPreview({ udid: device.udid, name: ctx.deviceName }, ctx.deviceName, sim);
            const derived = process.env.DERIVED_DATA_PATH ?? expand(config.derivedData, vars);
            const app = join(derived, config.product);
            if (options.build) {
                log(`Building this checkout for ${ctx.deviceName}, iOS ${runtime.version}…`);
                const [c, ...a] = cmd(config.build);
                run(c, a, { cwd: ctx.root, stdio: "inherit", env: { ...process.env, DERIVED_DATA_PATH: derived, SIMULATOR_NAME: ctx.deviceName, SIMULATOR_OS: runtime.version, SIMULATOR_UDID: device.udid } });
            }
            if (!existsSync(app))
                throw new Error(`No build at ${app}. Run start without --no-build.`);
            // Record ownership before boot so a failed install/launch/readiness can clean up.
            const pending = { udid: device.udid, name: ctx.deviceName, port, overlayPort, root: ctx.root, expiresAt: Date.now() + (options.ttlMinutes ?? DEFAULT_TTL_MINUTES) * 60000 };
            writeState(ctx, pending);
            try {
                sim("boot", device.udid);
                sim("bootstatus", device.udid, "-b");
                repairSimulatorInput(device.udid, run);
                sim("bootstatus", device.udid, "-b");
                sim("install", device.udid, app);
                // The prepared environment goes to simctl launch only: never to state, the plist or a log.
                const launchEnv = { ...process.env, ...prepareLaunchEnvironment(mode, vars, run) };
                run("xcrun", ["simctl", "launch", "--terminate-running-process", device.udid, config.bundleId, ...cmd(mode.args)], { env: launchEnv });
                const revision = run("git", ["rev-parse", "--short", "HEAD"], { cwd: ctx.root });
                const dirty = run("git", ["status", "--porcelain"], { cwd: ctx.root }) ? " (working tree changes)" : "";
                const state = {
                    ...pending, mode: mode.name,
                    build: options.build ? `${revision}${dirty}, built ${new Date().toISOString()}` : "existing build products; source revision/freshness unverified (--no-build)",
                };
                writeState(ctx, state);
                const plist = join(ctx.stateDir, "preview.plist");
                writeFileSync(plist, launchPlist({
                    label: ctx.label,
                    args: [process.execPath, supervisorPath(), ctx.stateFile, serveSim.path],
                    cwd: ctx.root, log: join(ctx.stateDir, "preview.log"),
                    env: { PATH: process.env.PATH ?? "", HOME: homedir(), ...(process.env.DEVELOPER_DIR ? { DEVELOPER_DIR: process.env.DEVELOPER_DIR } : {}) },
                }), { mode: 0o600 });
                run("launchctl", ["bootstrap", `gui/${process.getuid()}`, plist]);
                for (let attempt = 0; attempt < 90; attempt++) {
                    const ready = await healthy(ctx, state);
                    checkCancelled();
                    if (ready)
                        break;
                    await sleep(500);
                    checkCancelled();
                }
                if (!(await healthy(ctx, state))) {
                    await stop();
                    throw new Error(`Preview failed to become healthy on ports ${port}/${overlayPort}. Read ${join(ctx.stateDir, "preview.log")}; a logged-in macOS desktop session is required.`);
                }
                checkCancelled();
                report(ctx, state, options);
            }
            catch (error) {
                await stop();
                throw error;
            }
        }, stop);
    }
    finally {
        rmSync(lock, { recursive: true, force: true });
    }
}
//# sourceMappingURL=ios.js.map