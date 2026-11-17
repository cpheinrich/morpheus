import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, expect, it, vi } from "vitest";
import { runContextSearch } from "../src/cli/context-search.js";
import { contextMcpSession } from "../src/context-search/mcp-scope.js";
import { createContextMcp } from "../src/context-search/mcp.js";
import { contextArm, contextTraceSession, traceContext } from "../src/context-search/rollout.js";
import { tantivyPython } from "../src/context-search/runtime.js";
import { summarizeContextTraces } from "../src/context-search/trace-summary.js";
import { armMcpTaskContext, taskContextRefusal, taskPrompt } from "../src/context-search/task-start.js";
import { warmTrunkContext } from "../src/context-search/warm.js";
import { sessionTag } from "../src/session/evidence.js";
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
      search: { transport: "mcp", include: ["research/{.draft,release}/**/*.md"], exclude: ["docs/private/**"], rollout: { id: "fixture-pilot", coreInputs: [".agent/context-core.md"] } },
    } }),
    ".gitignore": "local/\n",
    ".agent/context-core.md": "Use the core release rules.\n",
    ".agent/decisions.md": "# Release decision\nUse the signed release authority.\nCheck the rollout window.\n",
    [taskPath]: "---\nid: MO-001\nprs: [7]\nissues: [8]\n---\n# Verify release\n",
    "research/.draft/safety.md": "# Zircon checklist\nConfirm the release checksum.\n",
    "docs/private/safety.md": "# Zircon checklist\nPrivate material.\n",
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
  const session = "fresh-reviewer";
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "probe", version: "1" });
  clients.push(client);
  await createContextMcp(root).connect(serverTransport);
  await client.connect(clientTransport);
  const call = async (name: string, args: Record<string, unknown> = {}, id = session) =>
    await client.callTool({ name, arguments: args, _meta: { threadId: id } }) as CallToolResult;
  return { root, client, session, call };
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

it("serves current citations from the last ready index until edited, added and deleted records are rebuilt", async () => {
  const { root, call } = await fixture();
  const stable = ".agent/decisions.md";
  const added = "research/.draft/new.md";
  const gate = join(root, "release-build");
  const log = join(root, "build-attempts");
  const wrapper = join(root, "paused-python");
  const search = (query: string) => call("search_project_context", { query });
  await writeFile(join(root, taskPath), "Release oldphrase.\n");
  await writeFile(join(root, worklogPath), "Release gonephrase.\n");
  const initial = await search("release");
  expect(initial.structuredContent?.citations).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: taskPath }), expect.objectContaining({ path: worklogPath }),
  ]));
  await writeFile(wrapper, `#!/bin/sh
if [ "$3" = build ]; then
  attempt=$(wc -l < "$PROBE_BUILD_LOG")
  echo build >> "$PROBE_BUILD_LOG"
  while [ ! -f "$PROBE_BUILD_GATE.$((attempt + 0))" ]; do sleep 0.02; done
fi
exec "$PROBE_PYTHON" "$@"
`, { mode: 0o700 });
  vi.stubEnv("PROBE_PYTHON", tantivyPython());
  vi.stubEnv("PROBE_BUILD_GATE", gate);
  vi.stubEnv("PROBE_BUILD_LOG", log);
  vi.stubEnv("MORPHEUS_TANTIVY_PYTHON", wrapper);
  const cache = join(root, "local/context-search/cache");
  await writeFile(log, "");
  const release = (attempt: number) => writeFile(`${gate}.${attempt}`, "");
  const published = async () => (await readdir(cache)).filter(name => name.startsWith("index-")).length;
  try {
    await writeFile(join(root, taskPath), "Release newphrase.\nExtra lines change the chunk mapping.\n\nAnother line.\n");
    await rm(join(root, worklogPath));
    await writeFile(join(root, added), "Release addedphrase.\n");
    execFileSync("git", ["add", "--", added], { cwd: root });

    const partial = await search("release");
    expect(partial.structuredContent).toMatchObject({
      partial: true, excerpt: expect.stringContaining("Index updating"),
      citations: [
        { path: stable, from: 1, to: 3, kind: "decision" },
        { path: ".agent/context-core.md", from: 1, to: 1, kind: "other" },
        { path: "research/.draft/safety.md", from: 1, to: 2, kind: "other" },
      ],
    });
    expect((await search("oldphrase gonephrase newphrase addedphrase")).structuredContent)
      .toMatchObject({ partial: true, outcome: "empty", citations: [] });
    expect((await call("read_project_record", { path: taskPath })).structuredContent?.excerpt).toContain("Release newphrase.");
    await vi.waitFor(async () => expect(await readFile(log, "utf8")).toBe("build\n"));
    expect(await published()).toBe(1);

    await release(0);
    await vi.waitFor(async () => expect(await published()).toBe(2));
    const fresh = await search("newphrase addedphrase");
    expect(fresh.structuredContent?.partial).toBeUndefined();
    expect(fresh.structuredContent?.citations).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: taskPath, from: 1, to: 4 }),
      expect.objectContaining({ path: added, from: 1, to: 1 }),
    ]));
    expect(fresh.structuredContent?.citations).toHaveLength(2);
    expect((await search("oldphrase gonephrase")).structuredContent).toMatchObject({ outcome: "empty", citations: [] });

    await writeFile(join(root, added), "Release secondphrase.\n");
    expect((await search("addedphrase")).structuredContent).toMatchObject({ partial: true, citations: [] });
    await vi.waitFor(async () => expect(await readFile(log, "utf8")).toBe("build\nbuild\n"));
    await writeFile(join(root, taskPath), "Release thirdphrase.\n");
    expect((await search("newphrase thirdphrase")).structuredContent).toMatchObject({ partial: true, citations: [] });
    expect(await readFile(log, "utf8")).toBe("build\nbuild\n");
    await release(1);
    await vi.waitFor(async () => expect(await readFile(log, "utf8")).toBe("build\nbuild\nbuild\n"));
    expect(await published()).toBe(3);
    expect((await search("secondphrase")).structuredContent).toMatchObject({
      partial: true, citations: [{ path: added, from: 1, to: 1, kind: "other" }],
    });
    await release(2);
    await vi.waitFor(async () => expect(await published()).toBe(4));
    const second = await search("secondphrase");
    expect(second.structuredContent?.partial).toBeUndefined();
    expect(second.structuredContent?.citations).toEqual([{ path: added, from: 1, to: 1, kind: "other" }]);
    expect((await search("thirdphrase")).structuredContent?.citations)
      .toEqual([{ path: taskPath, from: 1, to: 1, kind: "roadmap" }]);
    // Five of the ten searches above answered from the previous index, and the profile says so.
    expect((await summarizeContextTraces(root)).byArmTransport).toEqual([expect.objectContaining({
      transport: "mcp", operations: expect.objectContaining({ search: expect.objectContaining({ calls: 10, empty: 4, partial: 5 }) }),
    })]);
  } finally {
    await Promise.all([0, 1, 2].map(release));
  }
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
  expect(search.structuredContent).toMatchObject({ engine: "tantivy", citations: expect.arrayContaining([{ path: ".agent/decisions.md", from: 1, to: 3, kind: "decision" }]) });
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
    expect.objectContaining({ type: "query", transport: "mcp", arm: "tantivy-compact", actualEngine: "tantivy", outcome: "ok" }),
    expect.objectContaining({ type: "visible", transport: "mcp", operation: "read" }),
  ]));
  expect((await summarizeContextTraces(root)).byArmTransport).toEqual(expect.arrayContaining([
    expect.objectContaining({ arm: "tantivy-compact", transport: "mcp", visibleSessions: 1 }),
  ]));
});

it("opens a local architecture section from the overview and continues a long read without skipping a line", async () => {
  const { call, root } = await fixture();
  type Section = { title: string; href: string; read?: { path: string; from: number; to: number }; sectionEnd?: number };
  const sections = async () => ((await call("get_context_overview")).structuredContent!.architecture as { sections: Section[] }).sections;
  // Another project's overview links the pinned specification for people and offers nothing to read locally.
  expect(await sections()).toContainEqual({ title: "The work loop", href: expect.stringMatching(/^https:\/\/github\.com\/cpheinrich\/morpheus\/blob\/[^/]+\/architecture\.md#73-the-work-loop$/) });

  const loop = Array.from({ length: 120 }, (_, i) => `Loop step ${i + 1} keeps its own line.`);
  const source = [
    "# Specification", "",
    "## 4. The project manifest", "Manifest rule.", "```sh", "# 7.3 The work loop", "```", "### 4.1 Detail", "Detail rule.",
    "## 7. Agents", "### 7.3 The work loop", ...loop, "### 7.10 Context freshness", "Freshness rule.",
  ];
  await writeFile(join(root, "architecture.md"), source.join("\n") + "\n");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "morpheus-kit" }));
  await writeFile(join(root, "morpheus.json"), JSON.stringify({ name: "morpheus", prefix: "MO" }));
  execFileSync("git", ["add", "architecture.md"], { cwd: root });
  const local = await sections();
  expect(local.filter(section => section.read)).toEqual([
    // A section ends before the next heading of its level; the fenced `#` comment is not one.
    { title: "Project manifest", href: "architecture.md#4-the-project-manifest", read: { path: "architecture.md", from: 3, to: 9 }, sectionEnd: 9 },
    // 121 lines with the heading: `read` stops at the 100 one read accepts, `sectionEnd` at the last.
    { title: "The work loop", href: "architecture.md#73-the-work-loop", read: { path: "architecture.md", from: 11, to: 110 }, sectionEnd: 131 },
    { title: "Context freshness", href: "architecture.md#710-context-freshness", read: { path: "architecture.md", from: 132, to: 133 }, sectionEnd: 133 },
  ]);
  expect(local).toHaveLength(7);

  const read = async (input: Record<string, unknown>) => (await call("read_project_record", input)).structuredContent!;
  const body = (excerpt: unknown) => (excerpt as string).split("\n").slice(2);
  const manifest = await read(local[0]!.read!);
  expect(manifest).toMatchObject({ outcome: "ok", from: 3, to: 9, truncated: false });
  expect(manifest.next).toBeUndefined();
  expect(body(manifest.excerpt)).toEqual(source.slice(2, 9));

  // The listed parameters, on a budget too small for the section: each page names the next.
  const pages: Record<string, unknown>[] = [];
  expect(local[2]).toMatchObject({ title: "The work loop" });
  for (let input: Record<string, unknown> | undefined = { ...local[2]!.read!, max_tokens: 150 }; input; ) {
    const page = await read(input);
    pages.push(page);
    input = page.next ? { ...page.next as object, max_tokens: 150 } : undefined;
  }
  expect(pages.length).toBeGreaterThan(3);
  expect(pages[0]).toMatchObject({ from: 11, truncated: true, next: { path: "architecture.md", from: (pages[0]!.to as number) + 1, to: 110 } });
  expect(pages.at(-1)).toMatchObject({ to: 110, truncated: false });
  expect(pages.at(-1)!.next).toBeUndefined();
  for (const page of pages) expect(page.returnedTokens as number).toBeLessThanOrEqual(150);
  expect(pages.flatMap(page => body(page.excerpt))).toEqual(source.slice(10, 110));

  // 100 lines is the most one read takes; 101 is refused with the range to use instead.
  expect(await read({ path: "architecture.md", from: 11, to: 110, max_tokens: 2500 })).toMatchObject({ from: 11, to: 110, truncated: false });
  const refusal = (text: string) => ({ isError: true, content: [{ type: "text", text }] });
  const tooLong = refusal("Choose an inclusive range of 1–100 lines: read from 11 to 110, then continue from 111.");
  expect(await call("read_project_record", { path: "architecture.md", from: 11, to: 111 })).toEqual(tooLong);
  expect(await call("read_project_record", { path: "architecture.md", from: 11, to: 10 })).toEqual(tooLong);
  // The refusal's continuation line, read through to the section's stated end.
  const rest = await read({ path: "architecture.md", from: 111, to: local[2]!.sectionEnd, max_tokens: 2500 });
  expect(rest).toMatchObject({ from: 111, to: 131, truncated: false });
  expect(body(rest.excerpt)).toEqual(source.slice(110, 131));
  expect(await read({ path: "architecture.md", from: 111 })).toMatchObject({ from: 111, to: 126, truncated: false });
  // The end of the record is not a truncation, and there is nothing after it to continue with.
  const tail = await read({ path: "architecture.md", from: 132 });
  expect(tail).toMatchObject({ from: 132, to: 133, truncated: false });
  expect(tail.next).toBeUndefined();
  expect(await read({ path: "architecture.md", from: 134 })).toEqual({ outcome: "empty" });
  // The human link is not a path: the refusal says how to read the record it names.
  expect(await call("read_project_record", { path: "architecture.md#73-the-work-loop" }))
    .toEqual(refusal("Read architecture.md by line range; a heading anchor is not part of the path."));
  expect(await call("read_project_record", { path: "https://github.com/cpheinrich/morpheus/blob/main/architecture.md#73-the-work-loop" }))
    .toEqual(refusal("The path is outside the project context corpus. Check context coverage."));
});

it("traces why a read was refused as a fixed category, and reads older rows without one", async () => {
  const { call, root, session } = await fixture();
  const read = (input: Record<string, unknown>) => call("read_project_record", input);
  expect((await read({ path: worklogPath, from: 1, to: 101 })).isError).toBe(true);
  expect((await read({ path: "docs/private/safety.md" })).isError).toBe(true);
  await rm(join(root, worklogPath));
  expect(await read({ path: worklogPath })).toMatchObject({ isError: true, content: [{ text: "The record is unavailable in this worktree." }] });
  // A record whose directory became a file fails in the filesystem, not in a rule of ours.
  await rm(join(root, "research/.draft"), { recursive: true });
  await writeFile(join(root, "research/.draft"), "not a directory");
  expect((await read({ path: "research/.draft/safety.md" })).isError).toBe(true);
  expect((await read({ path: ".agent/decisions.md" })).structuredContent).toMatchObject({ outcome: "ok" });

  const arm = await contextArm(root, session);
  const base = { type: "tool", arm: arm.arm, engine: arm.engine, session: arm.session, rollout: arm.id, transport: "mcp", operation: "read" } as const;
  // Only the fixed vocabulary is written, and only on an error.
  await traceContext(root, { ...base, outcome: "error", reason: "docs/private/safety.md is private" as "other" });
  await traceContext(root, { ...base, outcome: "ok", reason: "coverage" });
  const date = new Date().toISOString().slice(0, 10);
  const file = join(root, "local/context-search/traces", date + ".jsonl");
  const rows = (await readFile(file, "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line));
  expect(rows.filter(row => row.operation === "read").map(row => [row.outcome, row.reason])).toEqual([
    ["error", "range"], ["error", "coverage"], ["error", "unavailable"], ["error", "other"], ["ok", undefined],
    ["error", undefined], ["ok", undefined],
  ]);
  const log = await readFile(file, "utf8");
  for (const text of ["private", "safety", "worklog", "unavailable in this worktree", session]) expect(log).not.toContain(text);
  // A row from before reasons existed, and one carrying a reason this build does not know.
  const older = { version: 1, at: new Date().toISOString(), type: "tool", arm: arm.arm, engine: "tantivy", rollout: arm.id, transport: "mcp", operation: "read", outcome: "error" };
  await writeFile(file, [older, { ...older, queryMs: 1, reason: "quota" }].map(row => JSON.stringify(row) + "\n").join(""), { flag: "a" });
  const summary = await summarizeContextTraces(root);
  expect(summary.invalidRows).toBe(0);
  expect(summary.byArmTransport).toEqual([expect.objectContaining({
    transport: "mcp", operations: { read: expect.objectContaining({
      calls: 9, errors: 7, empty: 0, partial: 0, errorReasons: { coverage: 1, other: 1, range: 1, unavailable: 1 },
    }) },
  })]);
});

/**
 * Claude Code's PostToolUse input for an MCP tool, in the shape captured live from Claude Code
 * 2.1.322 on 2026-11-17: no `turn_id`, and `tool_response` is the structured content serialized
 * to one string. Identifiers and host paths are placeholders; the keys and types are the capture's.
 */
function claudeToolUse(root: string, session: string, tool: string, structured: unknown, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    session_id: session, transcript_path: join(root, "transcript.jsonl"), cwd: root, prompt_id: "prompt-fixture",
    permission_mode: "bypassPermissions", effort: { level: "high" }, hook_event_name: "PostToolUse",
    tool_name: "mcp__morpheus_context__" + tool, tool_input: {}, tool_response: JSON.stringify(structured),
    tool_use_id: "toolu_fixture", duration_ms: 65, mcp_server: { name: "morpheus_context", source: "dynamic" }, ...overrides,
  });
}

it("credits the excerpt Claude Code serializes into its hook payload, and nothing it cannot verify", async () => {
  const { call, root, session } = await fixture();
  const seen = (id: string) => readFile(join(root, "local/context-search/startup", sessionTag(id) + ".seen"), "utf8").catch(() => null);
  const pending = async (id = session) => {
    expect(await seen(id)).toBeNull();
    expect(await taskContextRefusal(root, id)).toContain("Load context");
  };
  const search = "search_project_context";
  await armMcpTaskContext(root, session);
  // Liveness alone: the hook ran for this session and has seen no task excerpt yet.
  await recordRead(claudeToolUse(root, session, search, (await call(search, { query: "zzzzunused" })).structuredContent));
  await pending();

  const found = (await call(search, { query: secretQuery })).structuredContent!;
  expect(found).toMatchObject({ outcome: "ok", citations: expect.arrayContaining([{ path: ".agent/decisions.md", from: 1, to: 3, kind: "decision" }]) });
  // One citation, so that altering it leaves nothing else in the result to verify.
  const read = "read_project_record";
  const exact = (await call(read, { path: ".agent/decisions.md", from: 1, to: 3 })).structuredContent!;
  expect(exact).toMatchObject({ outcome: "ok", from: 1, to: 3, truncated: false });

  // A refused call shows the model an error, whatever text rides along with it.
  const refused = await call(read, { path: "../private.md" });
  expect(refused.isError).toBe(true);
  await recordRead(claudeToolUse(root, session, read, (refused.content[0] as { text: string }).text));
  await recordRead(claudeToolUse(root, session, read, exact, { hook_event_name: "PostToolUseFailure", tool_response: undefined, error: JSON.stringify(exact) }));
  await pending();
  // Text that does not match the cited source: altered in the result, then changed on disk.
  await recordRead(claudeToolUse(root, session, read, { ...exact, excerpt: (exact.excerpt as string).replace("signed release authority", "unsigned release authority") }));
  await pending();
  const decisions = await readFile(join(root, ".agent/decisions.md"), "utf8");
  await writeFile(join(root, ".agent/decisions.md"), decisions.replace("signed", "countersigned"));
  await recordRead(claudeToolUse(root, session, read, exact));
  await pending();
  await writeFile(join(root, ".agent/decisions.md"), decisions);
  // Outside this checkout's corpus, from another server, and past the size the model is shown in full.
  const excluded = `Morpheus context search excerpts\ndocs/private/safety.md:1-2\n# Zircon checklist\nPrivate material.`;
  await recordRead(claudeToolUse(root, session, read, { ...exact, excerpt: excluded }));
  await recordRead(claudeToolUse(root, session, read, exact, { tool_name: "mcp__other_server__read_project_record" }));
  const padded = (bytes: number) => {
    const pad = bytes - Buffer.byteLength(JSON.stringify({ ...exact, pad: "" }));
    return { ...exact, pad: "x".repeat(pad) };
  };
  expect(Buffer.byteLength(JSON.stringify(padded(20_001)))).toBe(20_001);
  await recordRead(claudeToolUse(root, session, read, padded(20_001)));
  await pending();
  // A result this session never saw credits only the session that did.
  await armMcpTaskContext(root, "other-claude-session");
  await recordRead(claudeToolUse(root, "other-claude-session", read, padded(20_000)));
  expect(await seen("other-claude-session")).toBe("1\n");
  expect(await taskContextRefusal(root, "other-claude-session")).toBeUndefined();
  await pending();

  // The positive control: the unmodified result, byte-verified against the tracked record.
  await recordRead(claudeToolUse(root, session, search, found));
  expect(await seen(session)).toBe("1\n");
  expect(await taskContextRefusal(root, session)).toBeUndefined();

  const date = new Date().toISOString().slice(0, 10);
  const log = await readFile(join(root, "local/context-search/traces", date + ".jsonl"), "utf8");
  for (const text of [secretQuery, session, "release authority", "decisions.md"]) expect(log).not.toContain(text);
  const visible = log.split("\n").filter(Boolean).map(line => JSON.parse(line)).filter(row => row.type === "visible");
  expect(visible.map(row => [row.transport, row.operation, row.session])).toEqual([
    ["mcp", "read", contextTraceSession("fixture-pilot", "other-claude-session")],
    ["mcp", "search", contextTraceSession("fixture-pilot", session)],
  ]);
});

it("keeps crediting a literal excerpt from a host that passes the text block through", async () => {
  const { call, root, session } = await fixture();
  await armMcpTaskContext(root, session);
  const found = await call("search_project_context", { query: secretQuery });
  await recordRead(claudeToolUse(root, session, "search_project_context", null, { tool_response: found.structuredContent!.excerpt }));
  expect(await taskContextRefusal(root, session)).toBeUndefined();
  await armMcpTaskContext(root, "block-session");
  await recordRead(claudeToolUse(root, "block-session", "search_project_context", null, { tool_response: found.content }));
  expect(await taskContextRefusal(root, "block-session")).toBeUndefined();
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
  const { root, session, call } = await fixture();
  await armMcpTaskContext(root, session);
  const read = async (path: string, id: string) => recordRead(JSON.stringify({
    cwd: root, session_id: id, turn_id: "turn", hook_event_name: "PostToolUse",
    tool_name: "mcp__morpheus_context__read_project_record",
    tool_response: await call("read_project_record", { path }, id),
  }));
  await read(".agent/context-core.md", session);
  expect(await taskContextRefusal(root, session)).toContain("Load context");
  await writeFile(join(root, "morpheus.json"), JSON.stringify({ name: "fixture" }));
  await read(".agent/decisions.md", "full-reviewer");
  expect((await summarizeContextTraces(root)).byArmTransport).toEqual(expect.arrayContaining([
    expect.objectContaining({ arm: "tantivy-compact", transport: "mcp", visibleSessions: 1 }),
    expect.objectContaining({ arm: "tantivy-full", transport: "mcp", visibleSessions: 1 }),
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


it("profiles Tantivy for an unconfigured project and fails explicitly without the runtime", async () => {
  const { root, call, session } = await fixture();
  await writeFile(join(root, "morpheus.json"), JSON.stringify({
    name: "explicit", context: { search: { mode: "ripgrep" } },
  }));
  const arm = await contextArm(root, session);
  expect(arm).toMatchObject({ arm: "tantivy-full", engine: "tantivy", session: contextTraceSession("", session) });
  const prompt = JSON.stringify({ cwd: root, session_id: session, prompt: "Verify release", hook_event_name: "UserPromptSubmit" });
  expect(await taskPrompt(prompt, async path => path)).toBeUndefined();
  vi.stubEnv("MORPHEUS_TANTIVY_PYTHON", "/nonexistent/tantivy-python");
  expect(await call("search_project_context", { query: secretQuery })).toMatchObject({
    isError: true, content: [{ text: expect.stringContaining("morpheus context runtime install") }],
  });
  vi.unstubAllEnvs();
  expect((await call("search_project_context", { query: secretQuery })).structuredContent)
    .toMatchObject({ engine: "tantivy", fallback: false, outcome: "ok" });
  expect((await summarizeContextTraces(root)).pipeline).toMatchObject({
    sessions: 1, promptHooks: 1, firstSearches: 1, firstResults: 1, promptToFirstResult: { samples: 1 },
  });
});

it("allows a fresh delegated host without session metadata to search its launch checkout", async () => {
  const { client } = await fixture();
  vi.stubEnv("MORPHEUS_CONTEXT_SESSION_ID", "");
  vi.stubEnv("CLAUDE_CODE_SESSION_ID", "");
  vi.stubEnv("CODEX_THREAD_ID", "");
  expect((await client.callTool({ name: "search_project_context", arguments: { query: secretQuery } })).structuredContent)
    .toMatchObject({ engine: "tantivy", outcome: "ok", citations: expect.arrayContaining([
      expect.objectContaining({ path: ".agent/decisions.md" }),
    ]) });
});


it("reports a resumed session separately from its historical Tantivy cohort", async () => {
  const { root, session, call } = await fixture();
  const current = await contextArm(root, session);
  const now = new Date();
  await traceContext(root, {
    type: "query", arm: "tantivy-bounded", engine: "tantivy", rollout: current.id, session: current.session,
    transport: "mcp", operation: "search", outcome: "ok", queryStartedAt: now.valueOf() - 600, queryMs: 500,
  }, new Date(now.valueOf() - 100));
  expect((await call("search_project_context", { query: secretQuery })).structuredContent?.engine).toBe("tantivy");
  const report = await summarizeContextTraces(root);
  expect(report.byArmTransport.map(row => row.arm)).toEqual(["tantivy-bounded", "tantivy-compact"]);
  expect(report.pipeline).toMatchObject({ sessions: 2, firstSearches: 2, firstResults: 2 });
});


it("searches an older checkout with no safe persistent cache without writing project state", async () => {
  const { root, call } = await fixture();
  await rm(join(root, ".gitignore"));
  expect((await call("search_project_context", { query: secretQuery })).structuredContent)
    .toMatchObject({ engine: "tantivy", outcome: "ok", citations: expect.arrayContaining([
      expect.objectContaining({ path: ".agent/decisions.md", from: 1, to: 3 }),
    ]) });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    expect(await runContextSearch(root, secretQuery, { json: true })).toBe(0);
    expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({ engine: "tantivy", output: expect.stringContaining(".agent/decisions.md:1-3") });
  } finally {
    log.mockRestore();
  }
  await expect(access(join(root, "local"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("warms main and adopts only a fingerprint that matches the linked checkout's records", async () => {
  const { root, call } = await fixture();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture");

  // Prime main without a search or a running MCP warmup.
  await warmTrunkContext(root);
  const cache = "local/context-search/cache";
  const mainIndexes = await readdir(join(root, cache));
  expect(mainIndexes).toHaveLength(1);

  const linked = await realpath(await mkdtemp(join(tmpdir(), "morpheus-mcp-share-")));
  dirs.push(linked);
  git("worktree", "add", "-qb", "mo-001-cache", linked);
  await writeFile(join(linked, "unindexed.txt"), "This should have no effect on the index.\n");
  execFileSync("git", ["add", "unindexed.txt"], { cwd: linked });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "linked-probe", version: "1" });
  clients.push(client);
  await createContextMcp(linked).connect(serverTransport);
  await client.connect(clientTransport);

  const search = async (query: string) =>
    await client.callTool({ name: "search_project_context", arguments: { query } }) as CallToolResult;
  const mainResult = (await call("search_project_context", { query: "zircon" })).structuredContent;
  expect(mainResult?.citations).toEqual([{ path: "research/.draft/safety.md", from: 1, to: 2, kind: "other" }]);
  expect((await search("zircon")).structuredContent).toEqual(mainResult);
  expect(await readdir(join(linked, cache))).toEqual(mainIndexes);

  const tracePath = join(linked, "local/context-search/traces", new Date().toISOString().slice(0, 10) + ".jsonl");
  const queries = async () => (await readFile(tracePath, "utf8")).trim().split("\n").map(line => JSON.parse(line))
    .filter(row => row.type === "query");
  expect(await queries()).toEqual([expect.objectContaining({ cacheHit: true, buildMs: 0 })]);

  await writeFile(join(linked, "research/.draft/safety.md"), "# Quartz checklist\nCheck the task checksum.\n");
  expect((await search("zircon")).structuredContent).toMatchObject({ partial: true, citations: [] });
  await vi.waitFor(async () => {
    expect((await readdir(join(linked, cache))).filter(name => name.startsWith("index-"))).toHaveLength(2);
  });
  expect((await search("quartz")).structuredContent?.citations).toEqual(mainResult?.citations);
  expect(await queries()).toEqual([
    expect.objectContaining({ cacheHit: true, outcome: "ok" }),
    expect.objectContaining({ cacheHit: true, partial: true, buildMs: 0, outcome: "empty" }),
    expect.objectContaining({ cacheHit: true, outcome: "ok" }),
  ]);
  expect(await readdir(join(root, cache))).toEqual(mainIndexes);
  expect((await call("search_project_context", { query: "zircon" })).structuredContent).toEqual(mainResult);
});

it("rebuilds locally when the matching primary index cannot be opened", async () => {
  const { root } = await fixture();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
  await warmTrunkContext(root);
  const cache = "local/context-search/cache";
  const [key] = await readdir(join(root, cache));
  const primary = join(root, cache, key!);
  const store = (await readdir(primary)).find(name => name.endsWith(".store"));
  await rm(join(primary, store!));

  const linked = await realpath(await mkdtemp(join(tmpdir(), "morpheus-mcp-corrupt-")));
  dirs.push(linked);
  git("worktree", "add", "--detach", linked);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "corrupt-index-probe", version: "1" });
  clients.push(client);
  await createContextMcp(linked).connect(serverTransport);
  await client.connect(clientTransport);

  const request = { name: "search_project_context", arguments: { query: "zircon" } };
  const expected = {
    structuredContent: { citations: [{ path: "research/.draft/safety.md", from: 1, to: 2, kind: "other" }] },
  };
  expect(await client.callTool(request)).toMatchObject(expected);
  expect(await client.callTool(request)).toMatchObject(expected);
  expect(await readdir(join(linked, cache))).toEqual([key]);
  const traceDir = join(linked, "local/context-search/traces");
  const traces = await Promise.all((await readdir(traceDir)).map(name => readFile(join(traceDir, name), "utf8")));
  expect(traces.join("").trim().split("\n").map(line => JSON.parse(line)).filter(row => row.type === "query")).toEqual([
    expect.objectContaining({ cacheHit: false, outcome: "ok" }),
    expect.objectContaining({ cacheHit: true, buildMs: 0, outcome: "ok" }),
  ]);
  await expect(access(join(primary, store!))).rejects.toMatchObject({ code: "ENOENT" });
});
