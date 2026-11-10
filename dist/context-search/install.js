import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { braceExpand } from "minimatch";
import { parse as parseToml } from "smol-toml";
import { getSearchConfig } from "./rollout.js";
import { CONTEXT_SOURCE_DEFAULTS } from "./sources.js";
// Resolve device-local tools at launch; never commit one operator's executable or home path.
const CONTEXT_MCP_LAUNCH = 'PATH="${PATH:-/usr/bin:/bin}:${HOME:-/nonexistent}/.local/bin:/opt/homebrew/bin:/usr/local/bin"; export PATH; exec morpheus context mcp';
export const CONTEXT_MCP_COMMAND = {
    command: "sh",
    args: ["-c", CONTEXT_MCP_LAUNCH],
};
export const CONTEXT_GUIDANCE = `## Morpheus context tools

Discover live tools at startup/resume/compaction. Use \`search_project_context\` for project
records, \`read_project_record\` for citations, and the graph for code structure.
Pass the task checkout and this rule to fresh subagents. If MCP is unavailable, use
\`morpheus context search\` in that checkout. See the [setup guide](https://github.com/cpheinrich/morpheus/blob/main/docs/runbooks/context-search.md).
`;
function object(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
async function content(root, target) {
    try {
        let path = root;
        for (const part of target.split("/")) {
            path = join(path, part);
            const entry = await lstat(path).catch(error => { if (error.code === "ENOENT")
                return; throw error; });
            if (entry?.isSymbolicLink())
                throw new Error("symbolic link preserved; configure its owner explicitly");
        }
        return await readFile(join(root, target), "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return;
        throw error;
    }
}
async function save(root, target, text, write, previous) {
    if (!write)
        return;
    const path = join(root, target);
    await mkdir(dirname(path), { recursive: true });
    const stage = path + "." + randomUUID() + ".tmp";
    try {
        const mode = (await lstat(path).catch(error => {
            if (error.code !== "ENOENT")
                throw error;
        }))?.mode ?? 0o600;
        await writeFile(stage, text, { flag: "wx", mode });
        if (await content(root, target) !== previous)
            throw new Error("settings changed during setup; retry");
        await rename(stage, path);
    }
    finally {
        await rm(stage, { force: true });
    }
}
function existing(target, value, launch) {
    const same = object(value) && value.command === launch.command && value.cwd === undefined &&
        [launch, CONTEXT_MCP_COMMAND].some(spec => JSON.stringify(value.args) === JSON.stringify(spec.args)) && value.enabled !== false && value.disabled !== true;
    return { target, outcome: same ? "present" : "blocked", detail: same
            ? "Portable Morpheus Context MCP is configured; reload the host to discover its current tools."
            : "Left the existing morpheus_context entry untouched. Inspect its command, scope and enabled state before replacing it." };
}
async function jsonConfig(root, target, write, launch = CONTEXT_MCP_COMMAND) {
    const raw = await content(root, target);
    const doc = raw === undefined ? {} : JSON.parse(raw);
    if (!object(doc) || (doc.mcpServers !== undefined && !object(doc.mcpServers)))
        throw new Error("expected an object with an mcpServers object");
    const servers = (doc.mcpServers ?? {});
    if (Object.hasOwn(servers, "morpheus_context"))
        return existing(target, servers.morpheus_context, launch);
    await save(root, target, JSON.stringify({ ...doc, mcpServers: { ...servers, morpheus_context: launch } }, null, 2) + "\n", write, raw);
    return { target, outcome: raw === undefined ? "created" : "updated", detail: "Added portable Morpheus Context MCP beside existing settings. Trust the project server in the host, then reload." };
}
async function codexConfig(root, write, target = ".codex/config.toml", launch = CONTEXT_MCP_COMMAND) {
    const raw = await content(root, target);
    const doc = parseToml(raw ?? "");
    if (doc.mcp_servers !== undefined && !object(doc.mcp_servers))
        throw new Error("expected an mcp_servers table");
    const servers = (doc.mcp_servers ?? {});
    if (Object.hasOwn(servers, "morpheus_context"))
        return existing(target, servers.morpheus_context, launch);
    // Append rather than reserialize: unrelated comments and formatting belong to the project.
    const block = `\n[mcp_servers.morpheus_context]\ncommand = "sh"\nargs = ${JSON.stringify(launch.args)}\n`;
    const updated = (raw ?? "").replace(/\n?$/, "\n") + block;
    parseToml(updated); // Inline/closed tables cannot safely be extended: preserve them on failure.
    await save(root, target, updated, write, raw);
    return { target, outcome: raw === undefined ? "created" : "updated", detail: "Added portable Codex project MCP configuration. Trust the project and reload to load tools." };
}
async function instructions(root, target, write) {
    const raw = await content(root, target);
    if (raw?.includes("## Morpheus context tools"))
        return { target, outcome: "present", detail: "Context discovery and host-boundary guidance is present." };
    await save(root, target, (raw ? raw.trimEnd() + "\n\n" : "") + CONTEXT_GUIDANCE, write, raw);
    return { target, outcome: raw === undefined ? "created" : "updated", detail: "Added proactive context discovery and explicit cloud/mobile fallback guidance." };
}
const CBM_START = "# >>> morpheus context records >>>";
const CBM_END = "# <<< morpheus context records <<<";
/** Replace the generated block in place, or append it after the project's own rules. */
function replaceBlock(raw, block) {
    const start = raw.indexOf(CBM_START);
    const end = raw.indexOf(CBM_END);
    if ((start < 0) !== (end < 0))
        throw new Error("its Morpheus block is incomplete");
    if (start < 0)
        return raw.replace(/\n*$/, raw.trim() ? "\n\n" : "") + block;
    return raw.slice(0, start) + block + raw.slice(end + CBM_END.length).replace(/^\n/, "");
}
/**
 * Project records belong to the context MCP, code to codebase-memory. Excluding the
 * record globs from the graph keeps codebase-memory's search hook from answering a
 * record search with section headings beside the context excerpts.
 */
async function cbmIgnore(root, target, write) {
    const raw = await content(root, target);
    const { include } = await getSearchConfig(root);
    const patterns = [...new Set([...CONTEXT_SOURCE_DEFAULTS, ...include].flatMap(pattern => braceExpand(pattern)))];
    const block = [CBM_START, "# Generated by morpheus context install: these records are searched with the Morpheus Context MCP.",
        ...patterns.map(pattern => "/" + pattern.replace(/^\/+/, "")), CBM_END].join("\n") + "\n";
    const updated = raw === undefined ? block : replaceBlock(raw, block);
    if (updated === raw)
        return { target, outcome: "present", detail: "Codebase-memory leaves project records to the Context MCP." };
    await save(root, target, updated, write, raw);
    return { target, outcome: raw === undefined ? "created" : "updated", detail: "Excluded project records from codebase-memory, keeping any other ignore rules." };
}
/** Explicit setup for portable, version-controlled project settings. */
export async function installContextClients(root, write, guidance = true) {
    const repairs = [];
    for (const target of [".mcp.json", ".cursor/mcp.json", ".codex/config.toml", ".cbmignore", ...(guidance ? ["AGENTS.md"] : [])]) {
        try {
            repairs.push(target.endsWith(".toml") ? await codexConfig(root, write)
                : target === ".cbmignore" ? await cbmIgnore(root, target, write)
                    : target === "AGENTS.md" ? await instructions(root, target, write) : await jsonConfig(root, target, write));
        }
        catch (error) {
            repairs.push({ target, outcome: "blocked", detail: `Left untouched — ${error instanceof Error ? error.message : String(error)}` });
        }
    }
    return repairs;
}
function shellQuote(value) {
    return "'" + value.replaceAll("'", "'\\''") + "'";
}
/** Is this user-level entry a Morpheus Context launch, in any shape Morpheus has written? */
function morpheusLaunch(value) {
    if (!object(value) || typeof value.command !== "string" || !Array.isArray(value.args))
        return false;
    const args = value.args.map(String);
    if (value.command === "sh")
        return args[0] === "-c" && /\bexec \S*morpheus'? context mcp$/.test(args[1] ?? "");
    return /(^|\/)morpheus$/.test(value.command) && args.join(" ") === "context mcp";
}
/**
 * Claude reads each project's `.mcp.json`, approved by its settings, so a user-level copy
 * only duplicates it: Claude warns about one server in two scopes, and offers the tools in
 * sessions that are not Morpheus projects. Remove the copy Morpheus registered; any other
 * entry under the name is the user's own and stays.
 */
async function removeClaudeUserEntry(root, file) {
    const raw = await content(root, file);
    const doc = raw === undefined ? {} : JSON.parse(raw);
    if (!object(doc))
        throw new Error("expected an object");
    const servers = doc.mcpServers;
    const target = join(root, file);
    if (!object(servers) || !Object.hasOwn(servers, "morpheus_context")) {
        return { target, outcome: "present", detail: "Claude uses each project's Morpheus Context MCP; no user-level copy." };
    }
    if (!morpheusLaunch(servers.morpheus_context))
        return existing(target, servers.morpheus_context, CONTEXT_MCP_COMMAND);
    const { morpheus_context: _removed, ...rest } = servers;
    await save(root, file, JSON.stringify({ ...doc, mcpServers: rest }, null, 2) + "\n", true, raw);
    return { target, outcome: "updated", detail: "Removed the user-level Morpheus Context MCP; each project's .mcp.json provides it." };
}
/** User-scoped registration covers clones and linked worktrees without editing either. */
export async function installUserContextClients(binary, env = process.env, home = homedir()) {
    const launch = {
        ...CONTEXT_MCP_COMMAND,
        args: ["-c", CONTEXT_MCP_LAUNCH.replace("; export PATH", () => `:${shellQuote(dirname(process.execPath))}; export PATH`)
                .replace("exec morpheus", () => `exec ${shellQuote(binary)}`)],
    };
    const targets = [
        join(env.CODEX_HOME || join(home, ".codex"), "config.toml"),
        join(env.CLAUDE_CONFIG_DIR || home, ".claude.json"),
        join(home, ".cursor", "mcp.json"),
    ];
    return Promise.all(targets.map(async (target) => {
        const path = resolve(target);
        try {
            const fromHome = relative(home, path);
            const insideHome = !fromHome.startsWith("..") && !isAbsolute(fromHome);
            const root = insideHome ? home : parse(path).root;
            const file = relative(root, path).split(sep).join("/");
            const repair = path.endsWith(".toml") ? await codexConfig(root, true, file, launch)
                : path.endsWith(".claude.json") ? await removeClaudeUserEntry(root, file)
                    : await jsonConfig(root, file, true, launch);
            return { ...repair, target: path };
        }
        catch (error) {
            return { target: path, outcome: "blocked", detail: `Left untouched — ${error instanceof Error ? error.message : String(error)}` };
        }
    }));
}
export const CONTEXT_STARTUP_GUIDANCE = "Morpheus context tools: discover the live MCP catalog and inspect morpheus --help for current capabilities. Use get_context_overview and search_project_context once the task is known; read material citations and check_context_coverage. If absent, reload after device registration or check portable setup with morpheus context install --check; use morpheus context search in the actual checkout meanwhile. For each fresh reviewer or subagent, include the task checkout and this MCP lookup in the handoff. A configured server is not proof of a successful call. Remote-control/SSH sessions use their executing host; standalone cloud/mobile chats need a supported authorized repository connector or remote MCP.";
//# sourceMappingURL=install.js.map