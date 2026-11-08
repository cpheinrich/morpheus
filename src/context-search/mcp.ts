import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { sessionGit } from "../session/start.js";
import { countContextTokens } from "./engine.js";
import { contextMcpScope, contextMcpSession } from "./mcp-scope.js";
import { CONTEXT_SEARCH_HEADER, MCP_EXCERPT_BYTES } from "./output.js";
import { contextOverview } from "./overview.js";
import { buildRelationships, relatedContext } from "./relationships.js";
import { retrieveContext } from "./retrieve.js";
import { contextArm, traceContext, type ContextOperation, type ContextOutcome } from "./rollout.js";
import { CONTEXT_KINDS, contextCoverage, contextKind, discoverSources, readContextSources, type ContextKind } from "./sources.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const pathInput = z.string().min(1).max(512).describe("Repository-relative Markdown path from a citation.");
const tokenInput = z.number().int().min(1).max(2500).default(1000);
type Scope = Awaited<ReturnType<typeof contextMcpScope>>;

function result(text: string, fields: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent: fields };
}

async function recordTool(scope: Scope, operation: ContextOperation, outcome: ContextOutcome, started: number, returnedTokens?: number) {
  const arm = await contextArm(scope.root, scope.session, scope.config);
  await traceContext(scope.root, {
    type: "tool", arm: arm.arm, engine: arm.engine, session: arm.session, rollout: arm.id,
    transport: "mcp", operation, outcome, queryMs: performance.now() - started, returnedTokens,
  });
}

async function call(
  cwd: string, metadata: unknown, operation: ContextOperation, handler: (scope: Scope, started: number) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const started = performance.now();
  let scope: Scope | undefined;
  try {
    scope = await contextMcpScope(cwd, contextMcpSession(metadata));
    const response = await handler(scope, started);
    if (operation !== "search") {
      const tokens = response.structuredContent?.returnedTokens;
      await recordTool(scope, operation, response.structuredContent?.outcome === "empty" ? "empty" : "ok", started,
        typeof tokens === "number" ? tokens : undefined);
    }
    return response;
  } catch (error) {
    if (scope && operation !== "search") await recordTool(scope, operation, "error", started).catch(() => {});
    return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Morpheus Context could not complete this operation." }] };
  }
}

async function search(scope: Scope, input: { query: string; max_tokens: number; kinds?: ContextKind[] }, started: number) {
  const found = await retrieveContext(scope.root, input.query, input.max_tokens, { session: scope.session, transport: "mcp", kinds: input.kinds, started });
  const { output, excerpts, returnedTokens } = found.data;
  const message = output ? `${CONTEXT_SEARCH_HEADER}\n${output}`
    : "No matching excerpts within the return budget. Refine the search or read a known source.";
  return result(message, {
    excerpt: message, outcome: output ? "ok" : "empty", engine: found.engine, fallback: found.fallback, returnedTokens,
    citations: excerpts.map(({ path, from, to }) => ({ path, from, to, kind: contextKind(path) })),
  });
}

async function read(scope: Scope, input: { path: string; from: number; to?: number; max_tokens: number }) {
  const { path, from, to = from + 15, max_tokens: budget } = input;
  if (to < from || to - from > 99) throw new Error("Choose an inclusive range of 1–100 lines.");
  const sources = await discoverSources(scope.root, scope.config);
  if (!sources.included.includes(path)) throw new Error("The path is outside the project context corpus. Check context coverage.");
  const [record] = await readContextSources(scope.root, [path]);
  if (!record) throw new Error("The record is unavailable in this worktree.");
  const lines = record.text.replace(/\r?\n$/, "").split(/\r?\n/).slice(from - 1, to);
  while (lines.length) {
    const end = from + lines.length - 1;
    const excerpt = `${path}:${from}-${end}\n${lines.join("\n")}`;
    const tokens = countContextTokens(excerpt);
    if (Buffer.byteLength(excerpt) <= MCP_EXCERPT_BYTES && tokens <= budget && lines.some(line => line.trim())) {
      const message = `${CONTEXT_SEARCH_HEADER}\n${excerpt}`;
      return result(message, {
        excerpt: message, outcome: "ok", path, from, to: end, returnedTokens: tokens, truncated: end < to && lines.length < to - from + 1,
      });
    }
    lines.pop();
  }
  return result("No readable lines fit that range and budget.", { outcome: "empty" });
}

async function coverage(scope: Scope, input: { paths?: string[] }) {
  const info = await contextCoverage(scope.root, scope.config);
  const categories = ["included", "excluded", "uncovered", "unavailable"] as const;
  const counts = Object.fromEntries(categories.map(key => [key, info[key].length]));
  const paths = (input.paths ?? []).map(path => ({
    path, status: categories.find(key => info[key].includes(path)) ?? "outside_inventory",
  }));
  const data = { counts, paths, unmatchedPatterns: info.emptyPatterns.slice(0, 20) };
  return result(JSON.stringify(data), data);
}

async function related(scope: Scope, input: { path: string; depth: number; limit: number }) {
  const included = (await discoverSources(scope.root, scope.config)).included;
  if (!included.includes(input.path.split("#", 1)[0]!)) throw new Error("Choose an eligible project context record.");
  const sources = await readContextSources(scope.root, included);
  const origin = await sessionGit(scope.root, ["remote", "get-url", "origin"]).catch(() => undefined);
  const found = relatedContext(buildRelationships(sources, origin), input.path, input.depth, input.limit);
  const data = { ...found, outcome: found.relationships.length ? "ok" : "empty" };
  return result(JSON.stringify(data), data);
}

export function createContextMcp(cwd: string): McpServer {
  const server = new McpServer({ name: "morpheus_context", version: "1.0.0" });
  server.registerTool("search_project_context", {
    description: "Find decisions, prior attempts, roadmap items, runbooks and meeting notes in the active project. Returns ranked excerpts and citations. Use for project history and governing records.",
    inputSchema: {
      query: z.string().trim().min(1).max(4000), max_tokens: tokenInput,
      kinds: z.array(z.enum(CONTEXT_KINDS)).min(1).max(CONTEXT_KINDS.length).optional()
        .describe("Optional restriction to particular record kinds. Search all eligible kinds by default."),
    }, annotations: READ_ONLY,
  }, (input, extra) => call(cwd, extra._meta, "search", (scope, started) => search(scope, input, started)));
  server.registerTool("read_project_record", {
    description: "Read an exact cited section of an indexed project record in source order. Use the citation path and line range.",
    inputSchema: { path: pathInput, from: z.number().int().min(1).max(10_000_000).default(1),
      to: z.number().int().min(1).max(10_000_000).optional(), max_tokens: tokenInput }, annotations: READ_ONLY,
  }, (input, extra) => call(cwd, extra._meta, "read", scope => read(scope, input)));
  server.registerTool("check_context_coverage", {
    description: "Check project context source eligibility. Reports included, excluded, uncovered and unavailable tracked Markdown.",
    inputSchema: { paths: z.array(pathInput).max(50).optional() }, annotations: READ_ONLY,
  }, (input, extra) => call(cwd, extra._meta, "coverage", scope => coverage(scope, input)));
  server.registerTool("get_context_overview", {
    description: "Orient a fresh agent. Find the governing Morpheus architecture sections, the active task and the project's record locations.",
    inputSchema: {}, annotations: READ_ONLY,
  }, (_input, extra) => call(cwd, extra._meta, "overview", async scope => {
    const data = await contextOverview(scope.root, scope.task);
    return result(JSON.stringify(data), data);
  }));
  server.registerTool("get_related_context", {
    description: "Follow explicit links from a project record, including backlinks, roadmap associations and GitHub references. Each relationship cites its declaring source.",
    inputSchema: { path: pathInput, depth: z.number().int().min(1).max(3).default(1),
      limit: z.number().int().min(1).max(30).default(15) }, annotations: READ_ONLY,
  }, (input, extra) => call(cwd, extra._meta, "related", scope => related(scope, input)));
  return server;
}

export async function runContextMcp(): Promise<number> {
  const server = createContextMcp(process.cwd());
  const closed = new Promise<number>(resolve => { server.server.onclose = () => resolve(0); });
  await server.connect(new StdioServerTransport());
  return closed;
}
