import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  claudeMcpToolNames,
  codexMcpToolNames,
  factoryMcpToolNames,
} from "../scripts/tool-contract.mjs";
test("MCP advertises tools without activating bridge or creating settings", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mcp-off-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../scripts/mcp.mjs", import.meta.url))],
    env: { PATH: process.env.PATH, FACTORY_HOME: root },
  });
  const client = new Client({ name: "test", version: "1" });
  t.after(() => client.close());
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    [...codexMcpToolNames].sort(),
  );
  assert.deepEqual(await readdir(root), []);
});

test("the installed-style Codex launcher expands PLUGIN_ROOT and handshakes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mcp-launcher-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pluginRoot = fileURLToPath(new URL("..", import.meta.url));
  const manifest = JSON.parse(
    await import("node:fs/promises").then(({ readFile }) =>
      readFile(join(pluginRoot, ".mcp.json"), "utf8")),
  );
  const spec = manifest.mcpServers.factory;
  const transport = new StdioClientTransport({
    command: spec.command,
    args: spec.args,
    env: {
      PATH: process.env.PATH,
      PLUGIN_ROOT: pluginRoot,
      CODEX_THREAD_ID: "launcher-contract-test",
      FACTORY_HOME: root,
    },
  });
  const client = new Client({ name: "launcher-test", version: "1" });
  t.after(() => client.close());
  await client.connect(transport);
  assert.deepEqual(
    (await client.listTools()).tools.map(({ name }) => name).sort(),
    [...codexMcpToolNames].sort(),
  );
  assert.deepEqual(await readdir(root), []);
});

test("the Codex launcher accepts the compatibility root used by the live host", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mcp-compat-launcher-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pluginRoot = fileURLToPath(new URL("..", import.meta.url));
  const manifest = JSON.parse(
    await import("node:fs/promises").then(({ readFile }) =>
      readFile(join(pluginRoot, ".mcp.json"), "utf8")),
  );
  const spec = manifest.mcpServers.factory;
  const transport = new StdioClientTransport({
    command: spec.command,
    args: spec.args,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      CODEX_THREAD_ID: "compat-launcher-test",
      FACTORY_HOME: root,
    },
  });
  const client = new Client({ name: "compat-launcher-test", version: "1" });
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.some(({ name }) => name === "factory_delegate"), true);
  assert.deepEqual(await readdir(root), []);
});

test("Codex and Claude discover the exact same provider-neutral Factory contract", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mcp-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const connect = async (script, env) => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL(script, import.meta.url))],
      env: { PATH: process.env.PATH, FACTORY_HOME: root, ...env },
    });
    const client = new Client({ name: "contract-test", version: "1" });
    await client.connect(transport);
    t.after(() => client.close());
    return client;
  };
  const codex = await connect("../scripts/mcp.mjs", {
    CODEX_THREAD_ID: "root-contract-test",
  });
  const claude = await connect("../scripts/claude-mcp.mjs", {
    CLAUDE_CODE_SESSION_ID: "00000000-0000-4000-8000-000000000123",
  });
  const codexTools = (await codex.listTools()).tools;
  const claudeTools = (await claude.listTools()).tools;
  assert.deepEqual(codexTools.map(({ name }) => name).sort(), [...codexMcpToolNames].sort());
  assert.deepEqual(claudeTools.map(({ name }) => name).sort(), [...claudeMcpToolNames].sort());
  const contract = (tools) =>
    Object.fromEntries(
      tools
        .filter(({ name }) => factoryMcpToolNames.includes(name))
        .map(({ name, description, inputSchema }) => [name, { description, inputSchema }]),
    );
  assert.deepEqual(contract(codexTools), contract(claudeTools));
});

test("Factory tools fail closed when the host cannot inject a verified root id", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mcp-rootless-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const script of ["../scripts/mcp.mjs", "../scripts/claude-mcp.mjs"]) {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL(script, import.meta.url))],
      env: { PATH: process.env.PATH, FACTORY_HOME: root },
    });
    const client = new Client({ name: "rootless-test", version: "1" });
    await client.connect(transport);
    const result = await client.callTool({ name: "factory_inspect", arguments: {} });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /could not verify this (Codex root task|Claude root session) id/);
    await client.close();
  }
  assert.deepEqual(await readdir(root), []);
});
test("a delegated worker's MCP pool mutations refuse without contacting the bridge", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mcp-delegated-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../scripts/mcp.mjs", import.meta.url))],
    env: { PATH: process.env.PATH, FACTORY_HOME: root, FACTORY_DELEGATED: "1" },
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
