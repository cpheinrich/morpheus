import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { Repair } from "../session/install.js";

// Resolve device-local tools at launch; never commit one operator's executable or home path.
const CONTEXT_MCP_LAUNCH = 'PATH="${PATH:-/usr/bin:/bin}:${HOME:-/nonexistent}/.local/bin:/opt/homebrew/bin:/usr/local/bin"; export PATH; exec morpheus context mcp';
export const CONTEXT_MCP_COMMAND = {
  command: "sh",
  args: ["-c", CONTEXT_MCP_LAUNCH],
};
export const CONTEXT_GUIDANCE = `## Morpheus context tools

Discover live MCP tools at startup/resume/compaction. Use \`get_context_overview\`,
\`search_project_context\`, cited reads and coverage; keep the graph for code structure.
If absent, check/repair with \`morpheus context install\`, reload, and use
\`morpheus context search\` meanwhile. Verify checkout/task freshness.
For fresh subagents, include the task checkout and the same MCP lookup in the handoff.
Phone remote sessions use their host; standalone cloud/mobile needs an authorized connector.
`;

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function content(root: string, target: string): Promise<string | undefined> {
  try {
    let path = root;
    for (const part of target.split("/")) {
      path = join(path, part);
      const entry = await lstat(path).catch(error => { if (error.code === "ENOENT") return; throw error; });
      if (entry?.isSymbolicLink()) throw new Error("symbolic link preserved; configure its owner explicitly");
    }
    return await readFile(join(root, target), "utf8");
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
}

async function save(root: string, target: string, text: string, write: boolean, previous?: string): Promise<void> {
  if (!write) return;
  const path = join(root, target);
  await mkdir(dirname(path), { recursive: true });
  const stage = path + "." + randomUUID() + ".tmp";
  try {
    const mode = (await lstat(path).catch(error => {
      if (error.code !== "ENOENT") throw error;
    }))?.mode ?? 0o600;
    await writeFile(stage, text, { flag: "wx", mode });
    if (await content(root, target) !== previous) throw new Error("settings changed during setup; retry");
    await rename(stage, path);
  } finally {
    await rm(stage, { force: true });
  }
}

function existing(target: string, value: unknown, launch: typeof CONTEXT_MCP_COMMAND): Repair {
  const same = object(value) && value.command === launch.command && value.cwd === undefined &&
    [launch, CONTEXT_MCP_COMMAND].some(spec => JSON.stringify(value.args) === JSON.stringify(spec.args)) && value.enabled !== false && value.disabled !== true;
  return { target, outcome: same ? "present" : "blocked", detail: same
    ? "Portable Morpheus Context MCP is configured; reload the host to discover its current tools."
    : "Left the existing morpheus_context entry untouched. Inspect its command, scope and enabled state before replacing it." };
}

async function jsonConfig(root: string, target: string, write: boolean, launch = CONTEXT_MCP_COMMAND): Promise<Repair> {
  const raw = await content(root, target);
  const doc: unknown = raw === undefined ? {} : JSON.parse(raw);
  if (!object(doc) || (doc.mcpServers !== undefined && !object(doc.mcpServers))) throw new Error("expected an object with an mcpServers object");
  const servers = (doc.mcpServers ?? {}) as Record<string, unknown>;
  if (Object.hasOwn(servers, "morpheus_context")) return existing(target, servers.morpheus_context, launch);
  await save(root, target, JSON.stringify({ ...doc, mcpServers: { ...servers, morpheus_context: launch } }, null, 2) + "\n", write, raw);
  return { target, outcome: raw === undefined ? "created" : "updated", detail: "Added portable Morpheus Context MCP beside existing settings. Trust the project server in the host, then reload." };
}

async function codexConfig(root: string, write: boolean, target = ".codex/config.toml", launch = CONTEXT_MCP_COMMAND): Promise<Repair> {
  const raw = await content(root, target);
  const doc = parseToml(raw ?? "");
  if (doc.mcp_servers !== undefined && !object(doc.mcp_servers)) throw new Error("expected an mcp_servers table");
  const servers = (doc.mcp_servers ?? {}) as Record<string, unknown>;
  if (Object.hasOwn(servers, "morpheus_context")) return existing(target, servers.morpheus_context, launch);
  // Append rather than reserialize: unrelated comments and formatting belong to the project.
  const block = `\n[mcp_servers.morpheus_context]\ncommand = "sh"\nargs = ${JSON.stringify(launch.args)}\n`;
  const updated = (raw ?? "").replace(/\n?$/, "\n") + block;
  parseToml(updated); // Inline/closed tables cannot safely be extended: preserve them on failure.
  await save(root, target, updated, write, raw);
  return { target, outcome: raw === undefined ? "created" : "updated", detail: "Added portable Codex project MCP configuration. Trust the project and reload to load tools." };
}

async function instructions(root: string, target: string, write: boolean): Promise<Repair> {
  const raw = await content(root, target);
  if (raw?.includes("## Morpheus context tools")) return { target, outcome: "present", detail: "Context discovery and host-boundary guidance is present." };
  await save(root, target, (raw ? raw.trimEnd() + "\n\n" : "") + CONTEXT_GUIDANCE, write, raw);
  return { target, outcome: raw === undefined ? "created" : "updated", detail: "Added proactive context discovery and explicit cloud/mobile fallback guidance." };
}

/** Explicit setup for portable, version-controlled project settings. */
export async function installContextClients(root: string, write: boolean, guidance = true): Promise<Repair[]> {
  const repairs: Repair[] = [];
  for (const target of [".mcp.json", ".cursor/mcp.json", ".codex/config.toml", ...(guidance ? ["AGENTS.md"] : [])]) {
    try {
      repairs.push(target.endsWith(".toml") ? await codexConfig(root, write)
        : target === "AGENTS.md" ? await instructions(root, target, write) : await jsonConfig(root, target, write));
    } catch (error) {
      repairs.push({ target, outcome: "blocked", detail: `Left untouched — ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return repairs;
}

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

/** User-scoped registration covers clones and linked worktrees without editing either. */
export async function installUserContextClients(binary: string, env = process.env, home = homedir()): Promise<Repair[]> {
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
  return Promise.all(targets.map(async target => {
    const path = resolve(target);
    try {
      const fromHome = relative(home, path);
      const insideHome = !fromHome.startsWith("..") && !isAbsolute(fromHome);
      const root = insideHome ? home : parse(path).root;
      const file = relative(root, path).split(sep).join("/");
      const repair = path.endsWith(".toml") ? await codexConfig(root, true, file, launch)
        : await jsonConfig(root, file, true, launch);
      return { ...repair, target: path };
    } catch (error) {
      return { target: path, outcome: "blocked", detail: `Left untouched — ${error instanceof Error ? error.message : String(error)}` };
    }
  }));
}

export const CONTEXT_STARTUP_GUIDANCE = "Morpheus context tools: discover the live MCP catalog and inspect morpheus --help for current capabilities. Use get_context_overview and search_project_context once the task is known; read material citations and check_context_coverage. If absent, reload after device registration or check portable setup with morpheus context install --check; use morpheus context search in the actual checkout meanwhile. For each fresh reviewer or subagent, include the task checkout and this MCP lookup in the handoff. A configured server is not proof of a successful call. Remote-control/SSH sessions use their executing host; standalone cloud/mobile chats need a supported authorized repository connector or remote MCP.";
