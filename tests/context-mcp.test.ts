import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, expect, it, vi } from "vitest";
import { contextMcpSession } from "../src/context-search/mcp-scope.js";
import { createContextMcp } from "../src/context-search/mcp.js";
import { contextArm, contextTraceSession, traceContext } from "../src/context-search/rollout.js";
import { summarizeContextTraces } from "../src/context-search/trace-summary.js";
import { armMcpTaskContext, taskContextRefusal, taskPrompt } from "../src/context-search/task-start.js";
import { bindTask } from "../src/session/tasks.js";
import { recordRead } from "../src/session/read-hook.js";

const taskPath = "hq/product/roadmap/MO-001-verify.md";
const worklogPath = ".agent/worklog/2026-11-08-verification.md";
const secretQuery = "signed release authority";
const dirs: string[] = [];
const clients: Client[] = [];

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "morpheus-mcp-")));
  dirs.push(root);
  const files = {
    "morpheus.json": JSON.stringify({ name: "fixture", prefix: "MO", context: {
      search: { transport: "mcp", rollout: { id: "fixture-pilot", coreInputs: [".agent/context-core.md"] } },
    } }),
    ".gitignore": "local/\n",
    ".agent/context-core.md": "Use the core release rules.\n",
    ".agent/decisions.md": "# Release decision\nUse the signed release authority.\nCheck the rollout window.\n",
    [taskPath]: "---\nid: MO-001\nprs: [7]\nissues: [8]\n---\n# Verify release\n",
    [worklogPath]: "---\nroadmap: MO-001\n---\n[Decision](../decisions.md#release-decision)\n",
  };
  for (const [path, text] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, text);
  }
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("remote", "add", "origin", "git@github.com:example/fixture.git");
  const sessions = new Map();
  for (let i = 0; i < 100 && sessions.size < 3; i++) {
    const id = "host-" + i;
    const arm = await contextArm(root, id);
    sessions.set(arm.arm, id);
  }
  const session = sessions.get("ripgrep-bounded") as string;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "probe", version: "1" });
  clients.push(client);
  await createContextMcp(root).connect(serverTransport);
  await client.connect(clientTransport);
  const call = async (name: string, args: Record<string, unknown> = {}, id = session) =>
    await client.callTool({ name, arguments: args, _meta: { threadId: id } }) as CallToolResult;
  return { root, client, session, sessions, call };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(clients.splice(0).map(client => client.close()));
  await Promise.all(dirs.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it("exposes five tools, follows roadmap backlinks and GitHub IDs, and reports real source coverage", async () => {
  const { client, call } = await fixture();
  expect((await client.listTools()).tools.map(tool => tool.name)).toEqual([
    "search_project_context", "read_project_record", "check_context_coverage", "get_context_overview", "get_related_context",
  ]);
  expect((await call("check_context_coverage", { paths: [taskPath, "../private.md"] })).structuredContent?.paths).toEqual([
    { path: taskPath, status: "included" }, { path: "../private.md", status: "outside_inventory" },
  ]);
  expect((await call("get_context_overview")).structuredContent).toMatchObject({
    project: "fixture", architecture: { sections: expect.arrayContaining([{ title: "Context freshness", href: expect.stringContaining("#710-context-freshness") }]) },
  });
  expect((await call("get_related_context", { path: worklogPath, depth: 2 })).structuredContent?.relationships).toEqual(expect.arrayContaining([
    expect.objectContaining({ from: worklogPath, to: taskPath, sourceLine: 2, kind: "roadmap", depth: 1 }),
    expect.objectContaining({ from: taskPath, to: "https://github.com/example/fixture/pull/7", sourceLine: 3, kind: "pull_request", depth: 2 }),
    expect.objectContaining({ from: worklogPath, to: ".agent/decisions.md#release-decision", sourceLine: 4, kind: "links_to" }),
  ]));
  expect(await call("read_project_record", { path: "../private.md" })).toMatchObject({ isError: true });
  expect((await call("search_project_context", { query: "release", kinds: ["decision"] })).structuredContent?.citations)
    .toEqual([{ path: ".agent/decisions.md", from: 1, to: 3, kind: "decision" }]);
});

it("preserves arm, records MCP timing, and only credits the excerpt shown by the host", async () => {
  const { call, root, session } = await fixture();
  const prompt = await taskPrompt(JSON.stringify({
    cwd: root, session_id: session, prompt: "Verify release", hook_event_name: "UserPromptSubmit",
  }), async path => path);
  expect(prompt).toContain("search_project_context");
  const observe = async (tool: string, response: CallToolResult) => recordRead(JSON.stringify({
    cwd: root, session_id: session, turn_id: "turn-1", hook_event_name: "PostToolUse",
    tool_name: "mcp__morpheus_context__" + tool, tool_response: response,
  }));

  await observe("search_project_context", await call("search_project_context", { query: "zzzzunused" }));
  expect(await taskContextRefusal(root, session)).toContain("Load context");
  const search = await call("search_project_context", { query: secretQuery });
  expect(search.structuredContent).toMatchObject({ engine: "ripgrep", citations: expect.arrayContaining([{ path: ".agent/decisions.md", from: 1, to: 3, kind: "decision" }]) });
  expect(await taskContextRefusal(root, session)).toContain("Load context");
  await observe("search_project_context", { ...search, structuredContent: { excerpt: "No model-visible citation." } });
  expect(await taskContextRefusal(root, session)).toContain("Load context");

  const read = await call("read_project_record", { path: ".agent/decisions.md", from: 2, to: 2 });
  expect(read.structuredContent).toMatchObject({ from: 2, to: 2, excerpt: expect.stringContaining("Use the signed release authority.") });
  await observe("read_project_record", read);
  expect(await taskContextRefusal(root, session)).toBeUndefined();

  const date = new Date().toISOString().slice(0, 10);
  const log = await readFile(join(root, "local/context-search/traces", date + ".jsonl"), "utf8");
  expect(log).not.toContain(secretQuery);
  expect(log).not.toContain(session);
  expect(log.split("\n").filter(Boolean).map(line => JSON.parse(line))).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "query", transport: "mcp", arm: "ripgrep-bounded", actualEngine: "ripgrep", outcome: "ok" }),
    expect.objectContaining({ type: "visible", transport: "mcp", operation: "read" }),
  ]));
  expect((await summarizeContextTraces(root)).byArmTransport).toEqual(expect.arrayContaining([
    expect.objectContaining({ arm: "ripgrep-bounded", transport: "mcp", visibleSessions: 1 }),
  ]));
});

it("uses the session worktree and refuses to move a pinned Factory worker outside its admitted checkout", async () => {
  const { call, root, session } = await fixture();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
  const linked = await realpath(await mkdtemp(join(tmpdir(), "morpheus-mcp-bound-")));
  dirs.push(linked);
  git("worktree", "add", "-qb", "mo-001-verify", linked);
  const [freshClient, freshServer] = InMemoryTransport.createLinkedPair();
  const fresh = new Client({ name: "worker-probe", version: "1" });
  clients.push(fresh);
  await createContextMcp(linked).connect(freshServer);
  await fresh.connect(freshClient);
  const overview = await fresh.callTool({
    name: "get_context_overview", arguments: {}, _meta: { threadId: "new-worker-thread", sessionId: session },
  }) as CallToolResult;
  expect(overview.structuredContent?.task).toMatchObject({ id: "MO-001", roadmap: taskPath });
  expect(contextMcpSession({ threadId: "descendant-thread", sessionId: session }, {})).toBe(session);

  await bindTask(linked, "MO-001", session);
  await writeFile(join(linked, ".agent/decisions.md"), "Only the bound checkout has this decision.\n");
  const args = { path: ".agent/decisions.md", from: 1, to: 1 };
  expect((await call("read_project_record", args)).structuredContent?.excerpt).toContain("Only the bound checkout");
  vi.stubEnv("MORPHEUS_CONTEXT_WORKTREE_PIN", "1");
  expect(await call("read_project_record", args)).toMatchObject({
    isError: true, content: [{ type: "text", text: expect.stringContaining("admitted checkout") }],
  });
});

it("profiles visible startup citations without treating them as additional task context", async () => {
  const { root, session, call, sessions } = await fixture();
  await armMcpTaskContext(root, session);
  const read = async (path: string, id: string) => recordRead(JSON.stringify({
    cwd: root, session_id: id, turn_id: "turn", hook_event_name: "PostToolUse",
    tool_name: "mcp__morpheus_context__read_project_record",
    tool_response: await call("read_project_record", { path }, id),
  }));
  await read(".agent/context-core.md", session);
  expect(await taskContextRefusal(root, session)).toContain("Load context");
  await read(".agent/decisions.md", sessions.get("ripgrep-full"));
  expect((await summarizeContextTraces(root)).byArmTransport).toEqual(expect.arrayContaining([
    expect.objectContaining({ arm: "ripgrep-bounded", transport: "mcp", visibleSessions: 1 }),
    expect.objectContaining({ arm: "ripgrep-full", transport: "mcp", visibleSessions: 1 }),
  ]));
});

it("fits complete broad-search excerpts within the host's visible line limit", async () => {
  const { root, session, call } = await fixture();
  for (let i = 0; i < 16; i++) {
    await writeFile(join(root, ".agent/worklog", `2026-11-08-short-${i}.md`), "releasedetail\n".repeat(16));
  }
  execFileSync("git", ["add", "."], { cwd: root });
  await armMcpTaskContext(root, session);
  const response = await call("search_project_context", { query: "releasedetail", max_tokens: 2500 });
  const excerpt = response.structuredContent?.excerpt as string;
  expect(excerpt.split("\n").length).toBeLessThanOrEqual(200);
  expect(response.structuredContent?.citations).toHaveLength(11);
  await recordRead(JSON.stringify({
    cwd: root, session_id: session, turn_id: "turn", hook_event_name: "PostToolUse",
    tool_name: "mcp__morpheus_context__search_project_context", tool_response: response,
  }));
  expect(await taskContextRefusal(root, session)).toBeUndefined();
});

it("supports the MCP backstop with the existing startup and read hooks even before prompt-hook trust", async () => {
  const { root, session, call } = await fixture();
  await armMcpTaskContext(root, session);
  const observe = (response: CallToolResult) => recordRead(JSON.stringify({
    cwd: root, session_id: session, turn_id: "turn", hook_event_name: "PostToolUse",
    tool_name: "mcp__morpheus_context__search_project_context", tool_response: response,
  }));
  await observe(await call("search_project_context", { query: "zzzzunused" }));
  expect(await taskContextRefusal(root, session)).toContain("Load context");
  expect(await taskPrompt(JSON.stringify({
    cwd: root, session_id: session, prompt: "Verify release", hook_event_name: "UserPromptSubmit",
  }), async path => path)).toContain("search_project_context");
  await observe(await call("search_project_context", { query: secretQuery }));
  expect(await taskContextRefusal(root, session)).toBeUndefined();
});


it("profiles a first turn without a trusted prompt hook and excludes empty searches from first results", async () => {
  const { root } = await fixture();
  const home = join(root, "fixture-codex");
  vi.stubEnv("CODEX_HOME", home);
  const day = join(home, "sessions", "2026", "11", "09");
  await mkdir(day, { recursive: true });
  const providerId = "00000000-0000-4000-8000-000000000009";
  const rollout = "fixture-pilot";
  const session = contextTraceSession(rollout, providerId);
  const t = Date.UTC(2026, 10, 9, 12);
  const stamp = (offset: number) => new Date(t + offset);
  await writeFile(join(day, `rollout-2026-11-09T12-00-00-${providerId}.jsonl`), [
    { type: "session_meta", payload: { id: providerId } },
    { type: "event_msg", timestamp: stamp(250).toISOString(), payload: { type: "task_started" } },
  ].map(row => JSON.stringify(row)).join("\n") + "\n");
  const arm = "tantivy-bounded" as const;
  const base = { arm, engine: "tantivy", rollout, session, transport: "mcp" } as const;
  await traceContext(root, { ...base, type: "session-start" }, stamp(10));
  await traceContext(root, { ...base, type: "warm", session: undefined, mcpStartedAt: t, outcome: "ok", buildMs: 180 }, stamp(200));
  await traceContext(root, { ...base, type: "query", mcpStartedAt: t, queryStartedAt: t + 300, queryMs: 50, outcome: "empty" }, stamp(350));
  await traceContext(root, { ...base, type: "query", mcpStartedAt: t, queryStartedAt: t + 400, queryMs: 75, outcome: "ok" }, stamp(475));
  expect((await summarizeContextTraces(root, { since: "2026-11-09" })).pipeline).toMatchObject({
    sessions: 1, promptHooks: 0, codexTurnFallbacks: 1, firstSearches: 1, firstResults: 1,
    startToPrompt: { samples: 1, p50Ms: 250 }, promptToFirstSearch: { p50Ms: 50 },
    promptToFirstResult: { p50Ms: 225 }, startToFirstResult: { p50Ms: 475 },
    firstSearch: { p50Ms: 50 }, warmupBuild: { p50Ms: 180 }, warmedBeforePrompt: 1,
  });
});
