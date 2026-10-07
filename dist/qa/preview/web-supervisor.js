import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { startWebQaServer } from "../web/server.js";
/**
 * The launchd job for one web preview: the dev server when this preview started it, and the
 * comment overlay in front of it. A lease end, `stop` or the dev server exiting ends both. The dev
 * server runs in its own process group so its children (Next's workers) end with it.
 */
function endGroup(child) {
    if (!child?.pid || child.exitCode !== null)
        return Promise.resolve();
    return new Promise((done) => {
        const pid = child.pid;
        const kill = (signal) => { try {
            process.kill(-pid, signal);
        }
        catch { /* already gone */ } };
        const timer = setTimeout(() => { kill("SIGKILL"); done(); }, 5000);
        child.once("exit", () => { clearTimeout(timer); done(); });
        kill("SIGTERM");
    });
}
async function main([stateFile]) {
    if (!stateFile)
        throw new Error("usage: web-supervisor <state.json>");
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    let child;
    if (state.spawned && state.command) {
        const [command, ...args] = state.command;
        child = spawn(command, args, { cwd: resolve(state.root, state.cwd), stdio: "inherit", detached: true, env: process.env });
        // A missing binary emits "error", not "exit"; unhandled, it would crash the supervisor silently.
        child.once("error", (error) => { console.error(`dev server could not start: ${error.message}; ending the preview.`); process.exit(1); });
    }
    const server = await startWebQaServer({ root: state.root, project: state.project, upstream: state.upstream, port: state.port });
    console.log(`QA web overlay on port ${server.port} in front of ${state.upstream}${child ? ` (dev server pid ${child.pid})` : ""}`);
    let stopping = false;
    const stop = async (code) => {
        if (stopping)
            return;
        stopping = true;
        // The dev server is what must not outlive the preview: end it first, then give the overlay a
        // bounded moment to close, so no open connection can hold the supervisor until launchd kills it.
        await endGroup(child);
        await Promise.race([server.close().catch(() => undefined), sleep(2000)]);
        process.exit(code);
    };
    process.on("SIGTERM", () => void stop(0));
    process.on("SIGINT", () => void stop(0));
    child?.once("exit", (code) => { console.error(`dev server exited (${code ?? "signal"}); ending the preview.`); void stop(1); });
    for (;;) {
        await sleep(5000);
        try {
            const current = JSON.parse(readFileSync(stateFile, "utf8"));
            if (!Number.isFinite(current.expiresAt) || Date.now() >= current.expiresAt || current.port !== state.port) {
                await stop(0);
                return;
            }
        }
        catch {
            await stop(0);
            return;
        }
    }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
//# sourceMappingURL=web-supervisor.js.map