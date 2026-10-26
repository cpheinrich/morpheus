import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { probe, probeClaude } from "../scripts/probe.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("installer probes accept both current MCP server contracts", async () => {
  await probe(root);
  await probeClaude(root);
});

test("installer probe rejects a server missing a contracted tool and reports what it saw", async (t) => {
  const fixture = await mkdtemp(join(root, ".probe-test-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const scripts = join(fixture, "scripts");
  await mkdir(scripts);
  await writeFile(
    join(scripts, "tool-contract.mjs"),
    'export const codexMcpToolNames = ["claude_inspect", "claude_start"];\n',
  );
  await writeFile(
    join(scripts, "mcp.mjs"),
    `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const server = new McpServer({ name: "missing-tool-fixture", version: "1" });
server.registerTool("claude_inspect", { description: "fixture" }, async () => ({ content: [] }));
server.registerTool("claude_extra", { description: "fixture" }, async () => ({ content: [] }));
await server.connect(new StdioServerTransport());
`,
  );

  await assert.rejects(
    probe(fixture),
    (error) => {
      assert.match(error.message, /Installed plugin tool contract is incomplete/);
      assert.match(error.message, /missing: \["claude_start"\]/);
      assert.match(error.message, /unexpected: \["claude_extra"\]/);
      assert.match(error.message, /saw: \["claude_extra","claude_inspect"\]/);
      return true;
    },
  );
});
