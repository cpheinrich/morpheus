import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { sessionGit } from "../session/start.js";
import { countContextTokens, drainContextIndexBuilds } from "./engine.js";
import { contextMcpScope, contextMcpSession } from "./mcp-scope.js";
import { CONTEXT_SEARCH_HEADER, MCP_EXCERPT_BYTES } from "./output.js";
import { contextOverview } from "./overview.js";
import { buildRelationships, relatedContext } from "./relationships.js";
import { retrieveContext } from "./retrieve.js";
import { warmContextMcp } from "./warm.js";
import { contextArm, traceContext } from "./rollout.js";
import { CONTEXT_KINDS, contextCoverage, contextKind, discoverSources, readContextSources } from "./sources.js";
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const pathInput = z.string().min(1).max(512).describe("Repository-relative Markdown path from a citation.");
const worktreeInput = z.string().min(1).max(4096).optional().describe("Absolute registered worktree path in this repository. Omit for the current session checkout; pinned Factory workers cannot leave their admitted checkout.");
const tokenInput = z.number().int().min(1).max(2500).default(1000);
function activeIndexFor(indexes, root, kinds) {
    const key = JSON.stringify([root, [...new Set(kinds)].sort()]);
    const active = indexes.get(key) ?? {};
    indexes.delete(key);
    indexes.set(key, active);
    // Keep at most a few source snapshots when a host switches worktrees or filters.
    if (indexes.size > 4)
        indexes.delete(indexes.keys().next().value);
    return active;
}
function result(text, fields) {
    return { content: [{ type: "text", text }], structuredContent: fields };
}
/** A refused read names its category, so the trace can say why without the path or the message. */
class ReadRefusal extends Error {
    reason;
    constructor(reason, message) {
        super(message);
        this.reason = reason;
    }
}
function refusalReason(operation, error) {
    if (operation !== "read")
        return;
    return error instanceof ReadRefusal ? error.reason : "other";
}
async function recordTool(scope, operation, outcome, started, detail = {}) {
    const arm = await contextArm(scope.root, scope.session, scope.config);
    await traceContext(scope.root, {
        type: "tool", arm: arm.arm, engine: arm.engine, session: arm.session, rollout: arm.id,
        transport: "mcp", operation, outcome, queryMs: performance.now() - started, ...detail,
    });
}
async function call(cwd, metadata, operation, handler, worktree) {
    const started = performance.now();
    let scope;
    try {
        scope = await contextMcpScope(cwd, contextMcpSession(metadata), worktree);
        const response = await handler(scope, started);
        if (operation !== "search") {
            const tokens = response.structuredContent?.returnedTokens;
            await recordTool(scope, operation, response.structuredContent?.outcome === "empty" ? "empty" : "ok", started, { returnedTokens: typeof tokens === "number" ? tokens : undefined });
        }
        return response;
    }
    catch (error) {
        if (scope && operation !== "search")
            await recordTool(scope, operation, "error", started, { reason: refusalReason(operation, error) }).catch(() => { });
        return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Morpheus Context could not complete this operation." }] };
    }
}
async function search(scope, input, started, active, mcpStartedAt) {
    const found = await retrieveContext(scope.root, input.query, input.max_tokens, {
        session: scope.session, transport: "mcp", kinds: input.kinds, started, mcpStartedAt, active,
    });
    const { output, excerpts, returnedTokens, partial } = found.data;
    const note = partial ? "Index updating. These results cover unchanged records only. Retry search shortly or read a known record directly.\n" : "";
    const message = note + (output ? `${CONTEXT_SEARCH_HEADER}\n${output}`
        : "No matching excerpts within the return budget. Refine the search or read a known source.");
    return result(message, {
        excerpt: message, outcome: output ? "ok" : "empty", engine: found.engine, fallback: false, returnedTokens,
        ...(partial ? { partial } : {}),
        citations: excerpts.map(({ path, from, to }) => ({ path, from, to, kind: contextKind(path) })),
    });
}
async function read(scope, input) {
    const { path, from, to = from + 15, max_tokens: budget } = input;
    if (to < from || to - from > 99) {
        throw new ReadRefusal("range", `Choose an inclusive range of 1–100 lines: read from ${from} to ${from + 99}, then continue from ${from + 100}.`);
    }
    const sources = await discoverSources(scope.root, scope.config);
    if (!sources.included.includes(path)) {
        const file = path.split("#", 1)[0];
        throw new ReadRefusal("coverage", file !== path && sources.included.includes(file)
            ? `Read ${file} by line range; a heading anchor is not part of the path.`
            : "The path is outside the project context corpus. Check context coverage.");
    }
    const [record] = await readContextSources(scope.root, [path]);
    if (!record)
        throw new ReadRefusal("unavailable", "The record is unavailable in this worktree.");
    const source = record.text.replace(/\r?\n$/, "").split(/\r?\n/);
    // The record's own end is not a truncation: only lines dropped for the budget are.
    const last = Math.min(to, source.length);
    const lines = source.slice(from - 1, last);
    while (lines.length) {
        const end = from + lines.length - 1;
        const excerpt = `${path}:${from}-${end}\n${lines.join("\n")}`;
        const tokens = countContextTokens(excerpt);
        if (Buffer.byteLength(excerpt) <= MCP_EXCERPT_BYTES && tokens <= budget && lines.some(line => line.trim())) {
            const message = `${CONTEXT_SEARCH_HEADER}\n${excerpt}`;
            return result(message, {
                excerpt: message, outcome: "ok", path, from, to: end, returnedTokens: tokens, truncated: end < last,
                // The next call picks up at the first line left out, so a continued read skips nothing.
                ...(end < last ? { next: { path, from: end + 1, to: last } } : {}),
            });
        }
        lines.pop();
    }
    return result("No readable lines fit that range and budget.", { outcome: "empty" });
}
async function coverage(scope, input) {
    const info = await contextCoverage(scope.root, scope.config);
    const categories = ["included", "excluded", "uncovered", "unavailable"];
    const counts = Object.fromEntries(categories.map(key => [key, info[key].length]));
    const paths = (input.paths ?? []).map(path => ({
        path, status: categories.find(key => info[key].includes(path)) ?? "outside_inventory",
    }));
    const data = { counts, paths, unmatchedPatterns: info.emptyPatterns.slice(0, 20) };
    return result(JSON.stringify(data), data);
}
async function related(scope, input) {
    const included = (await discoverSources(scope.root, scope.config)).included;
    if (!included.includes(input.path.split("#", 1)[0]))
        throw new Error("Choose an eligible project context record.");
    const sources = await readContextSources(scope.root, included);
    const origin = await sessionGit(scope.root, ["remote", "get-url", "origin"]).catch(() => undefined);
    const found = relatedContext(buildRelationships(sources, origin), input.path, input.depth, input.limit);
    const data = { ...found, outcome: found.relationships.length ? "ok" : "empty" };
    return result(JSON.stringify(data), data);
}
export function createContextMcp(cwd, mcpStartedAt, indexes = new Map()) {
    const server = new McpServer({ name: "morpheus_context", version: "1.0.0" });
    server.registerTool("search_project_context", {
        description: "Find decisions, prior attempts, roadmap items, runbooks and meeting notes in the active project. Returns ranked excerpts and citations. Use this first for governing records and project history, including in reviews and delegated tasks.",
        inputSchema: {
            worktree: worktreeInput, query: z.string().trim().min(1).max(4000), max_tokens: tokenInput,
            kinds: z.array(z.enum(CONTEXT_KINDS)).min(1).max(CONTEXT_KINDS.length).optional()
                .describe("Optional restriction to particular record kinds. Search all eligible kinds by default."),
        }, annotations: READ_ONLY,
    }, (input, extra) => call(cwd, extra._meta, "search", (scope, started) => search(scope, input, started, activeIndexFor(indexes, scope.root, input.kinds), mcpStartedAt), input.worktree));
    server.registerTool("read_project_record", {
        description: "Read an exact cited section of an indexed project record in source order. Use the citation path and line range.",
        inputSchema: { worktree: worktreeInput, path: pathInput, from: z.number().int().min(1).max(10_000_000).default(1),
            to: z.number().int().min(1).max(10_000_000).optional(), max_tokens: tokenInput }, annotations: READ_ONLY,
    }, (input, extra) => call(cwd, extra._meta, "read", scope => read(scope, input), input.worktree));
    server.registerTool("check_context_coverage", {
        description: "Check project context source eligibility. Reports included, excluded, uncovered and unavailable tracked Markdown.",
        inputSchema: { worktree: worktreeInput, paths: z.array(pathInput).max(50).optional() }, annotations: READ_ONLY,
    }, (input, extra) => call(cwd, extra._meta, "coverage", scope => coverage(scope, input), input.worktree));
    server.registerTool("get_context_overview", {
        description: "Orient a fresh agent. Find the governing Morpheus architecture sections, the active task and the project's record locations.",
        inputSchema: { worktree: worktreeInput }, annotations: READ_ONLY,
    }, (input, extra) => call(cwd, extra._meta, "overview", async (scope) => {
        const data = await contextOverview(scope.root, scope.task);
        return result(JSON.stringify(data), data);
    }, input.worktree));
    server.registerTool("get_related_context", {
        description: "Follow explicit links from a project record, including backlinks, roadmap associations and GitHub references. Each relationship cites its declaring source.",
        inputSchema: { worktree: worktreeInput, path: pathInput, depth: z.number().int().min(1).max(3).default(1),
            limit: z.number().int().min(1).max(30).default(15) }, annotations: READ_ONLY,
    }, (input, extra) => call(cwd, extra._meta, "related", scope => related(scope, input), input.worktree));
    return server;
}
export async function runContextMcp() {
    const cwd = process.cwd();
    const indexes = new Map();
    const server = createContextMcp(cwd, performance.timeOrigin, indexes);
    const warming = warmContextMcp(cwd, root => activeIndexFor(indexes, root)).catch(() => { });
    const closed = new Promise(resolve => {
        server.server.onclose = () => { void warming.then(drainContextIndexBuilds).then(() => resolve(0)); };
    });
    await server.connect(new StdioServerTransport());
    return closed;
}
//# sourceMappingURL=mcp.js.map