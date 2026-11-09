import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { Repair } from "../session/install.js";

// Resolve device-local tools at launch; never commit one operator's executable or home path.
export const CONTEXT_MCP_COMMAND = {
  command: "sh",
  args: ["-c", 'PATH="${PATH:-/usr/bin:/bin}:${HOME:-/nonexistent}/.local/bin:/opt/homebrew/bin:/usr/local/bin"; export PATH; exec morpheus context mcp'],
};
export const CONTEXT_GUIDANCE = `## Morpheus context tools

Discover live MCP tools at startup/resume/compaction. Use \`get_context_overview\`,
\`search_project_context\`, cited reads and coverage; keep the graph for code structure.
If absent, check/repair with \`morpheus context install\`, reload, and use
\`morpheus context search\` meanwhile. Verify checkout/task freshness.
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

async function save(root: string, target: string, text: string, write: boolean): Promise<void> {
  if (!write) return;
  await mkdir(dirname(join(root, target)), { recursive: true });
  await writeFile(join(root, target), text);
}

function existing(target: string, value: unknown): Repair {
  const same = object(value) && value.command === CONTEXT_MCP_COMMAND.command &&
    JSON.stringify(value.args) === JSON.stringify(CONTEXT_MCP_COMMAND.args) && value.enabled !== false && value.disabled !== true;
  return { target, outcome: same ? "present" : "blocked", detail: same
    ? "Portable Morpheus Context MCP is configured; reload the host to discover its current tools."
    : "Left the existing morpheus_context entry untouched. Inspect its command, scope and enabled state before replacing it." };
}

async function jsonConfig(root: string, target: string, write: boolean): Promise<Repair> {
  const raw = await content(root, target);
  const doc: unknown = raw === undefined ? {} : JSON.parse(raw);
  if (!object(doc) || (doc.mcpServers !== undefined && !object(doc.mcpServers))) throw new Error("expected an object with an mcpServers object");
  const servers = (doc.mcpServers ?? {}) as Record<string, unknown>;
  if (Object.hasOwn(servers, "morpheus_context")) return existing(target, servers.morpheus_context);
  await save(root, target, JSON.stringify({ ...doc, mcpServers: { ...servers, morpheus_context: CONTEXT_MCP_COMMAND } }, null, 2) + "\n", write);
  return { target, outcome: raw === undefined ? "created" : "updated", detail: "Added portable Morpheus Context MCP beside existing settings. Trust the project server in the host, then reload." };
}

async function codexConfig(root: string, write: boolean): Promise<Repair> {
  const target = ".codex/config.toml";
  const raw = await content(root, target);
  const doc = parseToml(raw ?? "");
  if (doc.mcp_servers !== undefined && !object(doc.mcp_servers)) throw new Error("expected an mcp_servers table");
  const servers = (doc.mcp_servers ?? {}) as Record<string, unknown>;
  if (Object.hasOwn(servers, "morpheus_context")) return existing(target, servers.morpheus_context);
  // Append rather than reserialize: unrelated comments and formatting belong to the project.
  const block = `\n[mcp_servers.morpheus_context]\ncommand = "sh"\nargs = ${JSON.stringify(CONTEXT_MCP_COMMAND.args)}\n`;
  const updated = (raw ?? "").replace(/\n?$/, "\n") + block;
  parseToml(updated); // Inline/closed tables cannot safely be extended: preserve them on failure.
  await save(root, target, updated, write);
  return { target, outcome: raw === undefined ? "created" : "updated", detail: "Added portable Codex project MCP configuration. Trust the project and reload to load tools." };
}

async function instructions(root: string, target: string, write: boolean): Promise<Repair> {
  const raw = await content(root, target);
  if (raw?.includes("## Morpheus context tools")) return { target, outcome: "present", detail: "Context discovery and host-boundary guidance is present." };
  await save(root, target, (raw ? raw.trimEnd() + "\n\n" : "") + CONTEXT_GUIDANCE, write);
  return { target, outcome: raw === undefined ? "created" : "updated", detail: "Added proactive context discovery and explicit cloud/mobile fallback guidance." };
}

/** Explicit project setup only. Session startup advises; it never rewrites client configuration. */
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

export const CONTEXT_STARTUP_GUIDANCE = "Morpheus context tools: discover the live MCP catalog and inspect morpheus --help for current capabilities. Use get_context_overview and search_project_context once the task is known; read material citations and check_context_coverage. If absent, run morpheus context install --check, repair explicit project setup and reload; use morpheus context search in the actual checkout meanwhile. A configured server is not proof of a successful call. Remote-control/SSH sessions use their executing host; standalone cloud/mobile chats need a supported authorized repository connector or remote MCP.";
