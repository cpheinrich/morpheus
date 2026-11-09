import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import { codexHome } from "../doctor/codex-trust.js";
import { checkoutIdentity } from "../session/start.js";
const desktopCli = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex";
async function withCodex(binary, home, operation) {
    const child = spawn(binary, ["app-server", "--listen", "stdio://"], {
        cwd: homedir(), env: { ...process.env, CODEX_HOME: home }, stdio: ["pipe", "pipe", "ignore"],
    });
    // A server that exits while a request is being written closes stdout too.
    child.stdin.on("error", () => child.kill());
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const messages = lines[Symbol.asyncIterator]();
    const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
    let sequence = 0;
    const send = (message) => child.stdin.write(JSON.stringify(message) + "\n");
    const rpc = async (method, params) => {
        const id = ++sequence;
        send({ id, method, params });
        for (;;) {
            const line = await messages.next();
            if (line.done)
                throw new Error(`Codex stopped responding to ${method}.`);
            const reply = JSON.parse(line.value);
            if (reply.id !== id)
                continue;
            if (reply.error)
                throw new Error(`Codex ${method} failed (code ${reply.error.code}).`);
            return reply.result;
        }
    };
    try {
        await once(child, "spawn");
        const ready = z.object({ codexHome: z.string() }).parse(await rpc("initialize", {
            clientInfo: { name: "morpheus_hook_approval", version: "1" },
            capabilities: { experimentalApi: true },
        }));
        if (await realpath(ready.codexHome) !== home)
            throw new Error("Codex reported a different user config directory.");
        send({ method: "initialized" });
        return await operation(rpc);
    }
    finally {
        clearTimeout(timer);
        lines.close();
        child.kill("SIGKILL");
    }
}
const listResponse = z.object({ data: z.array(z.object({
        cwd: z.string(),
        errors: z.array(z.unknown()),
        hooks: z.array(z.object({
            source: z.string(), sourcePath: z.string(), key: z.string(),
            enabled: z.boolean(), isManaged: z.boolean(), trustStatus: z.string(),
            currentHash: z.string(),
        })),
    })) });
async function projectHooks(rpc, root) {
    const { data } = listResponse.parse(await rpc("hooks/list", { cwds: [root] }));
    const [project] = data;
    if (data.length !== 1 || !project || project.cwd !== root || project.errors.length) {
        throw new Error("Codex could not reliably list hooks for this project.");
    }
    return project.hooks;
}
async function pendingApproval(hook, root) {
    if (hook.source !== "project" || hook.isManaged || !hook.enabled)
        return false;
    if (hook.trustStatus !== "untrusted" && hook.trustStatus !== "modified")
        return false;
    const source = hook.sourcePath;
    if (source !== join(root, ".codex", "hooks.json") && source !== join(root, ".codex", "config.toml"))
        return false;
    if (await realpath(source) !== source)
        throw new Error("Project hook config resolves outside its declared path.");
    if (!hook.key.startsWith(`${source}:`) || !/^sha256:[a-f0-9]{64}$/.test(hook.currentHash)) {
        throw new Error("Codex returned an unexpected project hook identity.");
    }
    return true;
}
const layersResponse = z.object({ layers: z.array(z.object({
        name: z.object({ type: z.string(), file: z.string().optional() }),
        version: z.string().min(1),
    })) });
async function approve(rpc, root, target) {
    const { layers } = layersResponse.parse(await rpc("config/read", { includeLayers: true, cwd: root }));
    const userLayer = layers.find(({ name }) => name.type === "user" && name.file === target);
    const approvals = new Map();
    for (const hook of await projectHooks(rpc, root)) {
        if (await pendingApproval(hook, root))
            approvals.set(hook.key, { trusted_hash: hook.currentHash });
    }
    if (!approvals.size)
        return 0;
    if (!userLayer)
        throw new Error("Codex did not report a version for the active user config.");
    // Codex owns TOML updates. Guard against a config edit between listing and saving.
    const write = z.object({ status: z.literal("ok") });
    write.parse(await rpc("config/batchWrite", {
        filePath: target, expectedVersion: userLayer.version,
        edits: [{ keyPath: "hooks.state", value: Object.fromEntries(approvals), mergeStrategy: "upsert" }],
    }));
    const saved = new Map((await projectHooks(rpc, root)).map((hook) => [hook.key, hook]));
    for (const [key, { trusted_hash }] of approvals) {
        const hook = saved.get(key);
        if (hook?.trustStatus !== "trusted" || hook.currentHash !== trusted_hash) {
            throw new Error("Could not verify the saved hook approvals. Check Codex Settings → Hooks before retrying.");
        }
    }
    return approvals.size;
}
export async function approveCodexHooks(cwd = process.cwd(), binary = existsSync(desktopCli) ? desktopCli : "codex") {
    const checkout = await checkoutIdentity(cwd);
    if (checkout.linked && basename(checkout.common) !== ".git") {
        throw new Error("Run hook approval from the main checkout of this project.");
    }
    const root = checkout.linked ? dirname(checkout.common) : checkout.root;
    const home = await realpath(codexHome());
    return withCodex(binary, home, (rpc) => approve(rpc, root, join(home, "config.toml")));
}
export async function runCodexHooks(args) {
    if (args.length !== 2 || args[0] !== "hooks" || args[1] !== "approve") {
        throw new Error("Usage: morpheus codex hooks approve");
    }
    const count = await approveCodexHooks();
    console.log(count
        ? `Approved ${count} Codex project hook(s) in this repository.`
        : "No enabled project hooks awaiting approval in this repository.");
    return 0;
}
//# sourceMappingURL=codex-hooks.js.map