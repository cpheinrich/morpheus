import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
test("MCP advertises tools without activating bridge or creating settings", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mcp-off-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../scripts/mcp.mjs", import.meta.url))],
    env: { PATH: process.env.PATH, CODEX_CLAUDE_HOME: root },
  });
  const client = new Client({ name: "test", version: "1" });
  t.after(() => client.close());
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    [
      "answer",
      "inspect",
      "memories",
      "override",
      "start",
      "status",
      "stop",
      "view",
      "wait",
    ]
      .map((n) => "claude_" + n)
      .concat(
        ["answer", "followup", "logs", "profiles", "reattach", "reconcile", "recover", "start", "status", "stop", "wait"].map((n) => "pool_" + n),
      )
      .sort(),
  );
  assert.deepEqual(await readdir(root), []);
});
test("a delegated worker's MCP pool mutations refuse without contacting the bridge", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mcp-delegated-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../scripts/mcp.mjs", import.meta.url))],
    env: { PATH: process.env.PATH, CODEX_CLAUDE_HOME: root, CODEX_CLAUDE_DELEGATED: "1" },
  });
  const client = new Client({ name: "test", version: "1" });
  t.after(() => client.close());
  await client.connect(transport);
  const conversationId = "00000000-0000-4000-8000-000000000001";
  for (const [name, args] of [
    ["pool_start", { threadId: "t", profile: "p", prompt: "x" }],
    ["pool_followup", { threadId: "t", conversationId, prompt: "x" }],
    ["pool_answer", { threadId: "t", conversationId, questionId: "q", source: "codex", reason: "r" }],
    ["pool_reattach", { threadId: "t", conversationId, retry: true }],
    ["pool_recover", { threadId: "t", conversationId }],
  ]) {
    const result = await client.callTool({ name, arguments: args });
    assert.deepEqual([result.isError, result.content[0].text], [true, "Delegated workers cannot delegate again."]);
  }
  assert.deepEqual(await readdir(root), []);
});
