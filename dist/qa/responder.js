import { spawn } from "node:child_process";
import { access, link, mkdir, mkdtemp, open, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_COMMENTS_DIR } from "./comments.js";
import { claimNextBatch, listPending, readBatchClaim, releaseBatchClaim, showBatch } from "./store.js";
export const QA_RESPONDER_CONFIG = `${QA_COMMENTS_DIR}/responder.json`;
export const QA_RESPONDER_LOCK = `${QA_COMMENTS_DIR}/responder.lock`;
const RECOVERY_LOCK = `${QA_COMMENTS_DIR}/responder.recovering`;
function stopFile(root, pid) {
    return join(root, QA_COMMENTS_DIR, `responder.stop.${pid}`);
}
async function recoveryActive(root) {
    try {
        await access(join(root, RECOVERY_LOCK));
        return true;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
export async function loadResponderConfig(root) {
    const path = join(root, QA_RESPONDER_CONFIG);
    const raw = JSON.parse(await readFile(path, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error(`${path}: expected a JSON object`);
    const settings = raw;
    if (typeof settings.agent !== "string" || !settings.agent.trim())
        throw new Error(`${path}: agent is required`);
    if (!Array.isArray(settings.command) || !settings.command.length || !settings.command.every((part) => typeof part === "string" && part.length > 0)) {
        throw new Error(`${path}: command must be a nonempty argv array`);
    }
    const pollMs = settings.pollMs === undefined ? 2000 : settings.pollMs;
    if (typeof pollMs !== "number" || !Number.isInteger(pollMs) || pollMs < 250 || pollMs > 60000) {
        throw new Error(`${path}: pollMs must be an integer from 250 to 60000`);
    }
    return { agent: settings.agent, command: settings.command, pollMs };
}
async function acquireResponder(root, agent) {
    const path = join(root, QA_RESPONDER_LOCK);
    await mkdir(join(root, QA_COMMENTS_DIR), { recursive: true });
    if (await recoveryActive(root))
        throw new Error(`QA responder recovery owns ${root}; retry after it finishes`);
    const marker = { agent, pid: process.pid, startedAt: new Date().toISOString(), root };
    const staging = await mkdtemp(join(root, QA_COMMENTS_DIR, ".responder-"));
    try {
        const prepared = join(staging, "owner.json");
        await writeFile(prepared, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
        // A hard link publishes a complete marker with exclusive EEXIST semantics.
        await link(prepared, path);
        if (await recoveryActive(root)) {
            await unlink(path);
            throw new Error(`QA responder recovery owns ${root}; retry after it finishes`);
        }
    }
    catch (error) {
        if (error.code !== "EEXIST")
            throw error;
        const owner = await responderStatus(root).catch(() => null);
        throw new Error(`QA responder already owns ${root}${owner ? ` (agent ${owner.agent}, pid ${owner.pid})` : ""}; stop it before starting another`);
    }
    finally {
        await rm(staging, { recursive: true, force: true });
    }
    return async () => {
        await unlink(path);
        await rm(stopFile(root, marker.pid), { force: true });
    };
}
export async function responderStatus(root) {
    try {
        return JSON.parse(await readFile(join(root, QA_RESPONDER_LOCK), "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw error;
    }
}
function responderPidAlive(marker) {
    if (!Number.isInteger(marker.pid) || marker.pid <= 0)
        return false;
    try {
        process.kill(marker.pid, 0);
        return true;
    }
    catch (error) {
        if (error.code === "ESRCH")
            return false;
        if (error.code === "EPERM")
            return true;
        throw error;
    }
}
export async function isResponderActive(root) {
    try {
        const marker = await responderStatus(root);
        return marker ? responderPidAlive(marker) : false;
    }
    catch {
        // The optional status indicator must never turn a successful Send into an error.
        return false;
    }
}
export async function requestResponderStop(root) {
    const marker = await responderStatus(root);
    if (!marker)
        return false;
    if (!responderPidAlive(marker))
        throw new Error(`QA responder pid ${marker.pid} has stopped; verify no agent process is editing, then run responder recover --confirm-no-agent-process`);
    await writeFile(stopFile(root, marker.pid), "stop after current batch\n", "utf8");
    return true;
}
export async function recoverStoppedResponder(root, confirmedNoAgentProcess = false) {
    await mkdir(join(root, QA_COMMENTS_DIR), { recursive: true });
    const recoveryPath = join(root, RECOVERY_LOCK);
    let guard;
    try {
        guard = await open(recoveryPath, "wx", 0o600);
    }
    catch (error) {
        if (error.code === "EEXIST")
            throw new Error(`QA responder recovery is already in progress for ${root}`);
        throw error;
    }
    try {
        const marker = await responderStatus(root);
        if (!marker)
            return false;
        try {
            process.kill(marker.pid, 0);
            throw new Error(`QA responder pid ${marker.pid} is still running; stop it first`);
        }
        catch (error) {
            if (error.code !== "ESRCH")
                throw error;
        }
        if (!confirmedNoAgentProcess) {
            throw new Error(`QA responder pid ${marker.pid} stopped, but its agent process may still be editing; verify it has stopped, then retry with --confirm-no-agent-process`);
        }
        await unlink(join(root, QA_RESPONDER_LOCK));
        await rm(stopFile(root, marker.pid), { force: true });
        return true;
    }
    finally {
        await guard.close();
        await unlink(recoveryPath);
    }
}
async function stopRequested(root) {
    const marker = await responderStatus(root);
    if (!marker)
        return false;
    try {
        await access(stopFile(root, marker.pid));
        return true;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
function promptForBatch(root, id, agent) {
    const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
    const cli = `${quote(process.execPath)} ${quote(fileURLToPath(new URL("../../dist/cli/index.js", import.meta.url)))}`;
    return `You are the separate QA comment responder for ${root}. A serialized Morpheus worker has exclusively claimed batch ${id} as ${agent}. Read this checkout's AGENTS.md and run "${cli} qa guide". Show the batch with "${cli} qa comments show ${quote(id)} --root ${quote(root)}" and inspect its frame. Implement or answer its comments, run focused checks, and commit locally on the existing QA session branch. Keep the person's live overlay and simulator untouched while they comment. Do not push, open a PR, merge, or stop the preview; the interactive chat will finish the session later. When the batch is fully handled, run "${cli} qa comments resolve ${quote(id)} --agent ${quote(agent)} --root ${quote(root)}". If you cannot finish, leave the claim in place and explain the blocker. Handle only this batch; the worker will give you later batches serially.\n`;
}
async function runCommand(root, id, config, signal) {
    const expanded = config.command.map((part) => part.replaceAll("{root}", root).replaceAll("{id}", id).replaceAll("{agent}", config.agent));
    const child = spawn(expanded[0], expanded.slice(1), {
        cwd: root,
        env: { ...process.env, MORPHEUS_QA_ROOT: root, MORPHEUS_QA_BATCH_ID: id, MORPHEUS_QA_AGENT: config.agent },
        stdio: ["pipe", "inherit", "inherit"],
        detached: process.platform !== "win32",
        shell: false,
    });
    return new Promise((resolve, reject) => {
        let killTimer;
        let aborted = false;
        const signalGroup = (kind) => {
            if (child.pid && process.platform !== "win32") {
                try {
                    process.kill(-child.pid, kind);
                    return;
                }
                catch (error) {
                    if (error.code !== "ESRCH")
                        throw error;
                }
            }
            child.kill(kind);
        };
        const onAbort = () => {
            if (aborted)
                return;
            aborted = true;
            signalGroup("SIGTERM");
            killTimer = setTimeout(() => signalGroup("SIGKILL"), 5000);
            killTimer.unref();
        };
        const cleanup = () => {
            signal.removeEventListener("abort", onAbort);
            if (killTimer)
                clearTimeout(killTimer);
        };
        child.once("error", (error) => { cleanup(); reject(error); });
        child.once("close", (code) => {
            cleanup();
            // Kill any descendant that inherited this child's process group before releasing ownership.
            signalGroup("SIGKILL");
            resolve(code ?? 1);
        });
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted)
            onAbort();
        child.stdin.on("error", () => undefined); // A child that exits early may close stdin before the prompt is written.
        child.stdin.end(promptForBatch(root, id, config.agent));
    });
}
/** One process per checkout. Later Sends accumulate while the configured agent handles a batch. */
export async function runQaResponder(root, config, signal, log = console.log) {
    root = resolvePath(root);
    const release = await acquireResponder(root, config.agent);
    try {
        log(`QA responder ${config.agent} owns ${root} (pid ${process.pid})`);
        for (const batch of await listPending(root)) {
            if ((await readBatchClaim(root, batch.id))?.agent === config.agent) {
                throw new Error(`QA batch ${batch.id} still has an unresolved claim by ${config.agent}; finish or release it before restarting the responder`);
            }
        }
        while (!signal.aborted && !await stopRequested(root)) {
            const claim = await claimNextBatch(root, config.agent);
            if (!claim) {
                await new Promise((resolve) => {
                    const onAbort = () => { clearTimeout(timer); resolve(); };
                    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, config.pollMs);
                    signal.addEventListener("abort", onAbort, { once: true });
                });
                continue;
            }
            log(`QA responder: handling ${claim.id}`);
            const code = await runCommand(root, claim.id, config, signal);
            const shown = await showBatch(root, claim.id);
            if (code !== 0 || shown?.batch.status !== "resolved") {
                throw new Error(`QA responder stopped on ${claim.id}: command exited ${code}, batch is ${shown?.batch.status ?? "missing"}; claim remains for recovery`);
            }
            // An older installed CLI may have moved the batch without clearing the newer claim file.
            await releaseBatchClaim(root, claim.id, config.agent);
            log(`QA responder: resolved ${claim.id}`);
        }
    }
    finally {
        await release();
    }
}
//# sourceMappingURL=responder.js.map