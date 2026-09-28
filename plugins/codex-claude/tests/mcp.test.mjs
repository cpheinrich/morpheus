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
      .sort(),
  );
  assert.deepEqual(await readdir(root), []);
});
