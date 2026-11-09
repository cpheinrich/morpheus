import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { parse as parseToml } from "smol-toml";
import { CONTEXT_GUIDANCE, CONTEXT_MCP_COMMAND, installContextClients } from "../src/context-search/install.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "context-clients-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const read = (path: string) => readFile(join(root, path), "utf8");

it("installs portable configs for all three clients and is byte-idempotent", async () => {
  const result = await installContextClients(root, true);
  expect(result.map(row => [row.target, row.outcome])).toEqual([
    [".mcp.json", "created"], [".cursor/mcp.json", "created"], [".codex/config.toml", "created"], ["AGENTS.md", "created"],
  ]);
  for (const file of [".mcp.json", ".cursor/mcp.json"]) {
    expect(JSON.parse(await read(file)).mcpServers).toEqual({ morpheus_context: CONTEXT_MCP_COMMAND });
  }
  expect(parseToml(await read(".codex/config.toml"))).toEqual({ mcp_servers: { morpheus_context: CONTEXT_MCP_COMMAND } });
  expect(await read("AGENTS.md")).toBe(CONTEXT_GUIDANCE);
  const before = await Promise.all(result.map(row => read(row.target)));
  expect((await installContextClients(root, true)).map(row => row.outcome)).toEqual(["present", "present", "present", "present"]);
  expect(await Promise.all(result.map(row => read(row.target)))).toEqual(before);
});

it("preserves unrelated JSON settings, TOML comments and authored instructions", async () => {
  await mkdir(join(root, ".codex"));
  const toml = '# Operator comment\nmodel = "chosen-model"\n[mcp_servers.other]\ncommand = "other"\n';
  await writeFile(join(root, ".codex/config.toml"), toml);
  await writeFile(join(root, ".mcp.json"), JSON.stringify({ custom: 7, mcpServers: { other: { command: "other" } } }));
  await writeFile(join(root, "AGENTS.md"), "# Existing rules\n");
  await installContextClients(root, true);
  expect(await read(".codex/config.toml")).toMatch(new RegExp('^' + toml.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  expect(JSON.parse(await read(".mcp.json"))).toMatchObject({ custom: 7, mcpServers: { other: { command: "other" } } });
  expect(await read("AGENTS.md")).toBe("# Existing rules\n\n" + CONTEXT_GUIDANCE);
});

it("reports drift without writing in check mode", async () => {
  expect((await installContextClients(root, false)).map(row => row.outcome)).toEqual(["created", "created", "created", "created"]);
  await expect(read(".mcp.json")).rejects.toHaveProperty("code", "ENOENT");
  await expect(read(".codex/config.toml")).rejects.toHaveProperty("code", "ENOENT");
  await expect(read("AGENTS.md")).rejects.toHaveProperty("code", "ENOENT");
});

it("preserves malformed configs and explicit disabled/conflicting servers", async () => {
  await mkdir(join(root, ".codex"));
  await mkdir(join(root, ".cursor"));
  const malformed = '{"mcpServers":';
  const disabled = JSON.stringify({ mcpServers: { morpheus_context: { ...CONTEXT_MCP_COMMAND, disabled: true } } });
  const toml = '[mcp_servers.morpheus_context]\ncommand = "custom"\nenabled = false\n';
  await writeFile(join(root, ".mcp.json"), malformed);
  await writeFile(join(root, ".cursor/mcp.json"), disabled);
  await writeFile(join(root, ".codex/config.toml"), toml);
  expect((await installContextClients(root, true)).map(row => row.outcome)).toEqual(["blocked", "blocked", "blocked", "created"]);
  expect(await read(".mcp.json")).toBe(malformed);
  expect(await read(".cursor/mcp.json")).toBe(disabled);
  expect(await read(".codex/config.toml")).toBe(toml);
});

it("does not follow config symlinks or change their external targets", async () => {
  await writeFile(join(root, "external.json"), "{}\n");
  await symlink(join(root, "external.json"), join(root, ".mcp.json"));
  expect((await installContextClients(root, true))[0]?.outcome).toBe("blocked");
  expect(await read("external.json")).toBe("{}\n");
});

it("does not write through a parent directory symlink", async () => {
  await mkdir(join(root, "external"));
  await symlink(join(root, "external"), join(root, ".codex"));
  const result = await installContextClients(root, true);
  expect(result.find(row => row.target === ".codex/config.toml")?.outcome).toBe("blocked");
  await expect(read("external/config.toml")).rejects.toHaveProperty("code", "ENOENT");
});
