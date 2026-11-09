import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { editTargets, readiness } from "../src/dispatch.mjs";
import { defaults } from "../src/config.mjs";
import { initStore, configWrite, taskRead, taskWrite } from "../src/store.mjs";
import { Manager, claudeTaskId } from "../src/service.mjs";

async function isolated(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "factory-dispatch-")));
  const previous = process.env.FACTORY_HOME;
  process.env.FACTORY_HOME = join(root, "home");
  t.after(async () => {
    if (previous === undefined) delete process.env.FACTORY_HOME;
    else process.env.FACTORY_HOME = previous;
    await rm(root, { recursive: true, force: true });
  });
  await initStore();
  await configWrite({ ...defaults(), mode: "automatic" });
  const repo = join(root, "repo");
  await mkdir(repo);
  execFileSync("git", ["init", "-q", repo]);
  return repo;
}

test("hooks never dispatch prompts and retain provider-native edit guards", async () => {
  const codex = JSON.parse(
    await readFile(new URL("../hooks/hooks.json", import.meta.url), "utf8"),
  );
  const claude = JSON.parse(
    await readFile(new URL("../claude-plugin/hooks/hooks.json", import.meta.url), "utf8"),
  );
  assert.equal(codex.hooks.UserPromptSubmit, undefined);
  assert.ok(claude.hooks.UserPromptSubmit);
  for (const manifest of [codex, claude]) {
    assert.ok(manifest.hooks.SessionStart);
    assert.ok(manifest.hooks.PreToolUse);
    assert.ok(manifest.hooks.SessionEnd);
  }
  assert.equal(codex.hooks.PreToolUse[0].matcher, "apply_patch");
  assert.equal(claude.hooks.PreToolUse[0].matcher, "Edit|Write|MultiEdit|NotebookEdit");
  assert.match(JSON.stringify(codex), /\$\{PLUGIN_ROOT\}/);
  assert.doesNotMatch(JSON.stringify(codex), /CLAUDE_PLUGIN_ROOT/);
});

test("Codex expands its documented plugin root when launching the bundled MCP server", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../.mcp.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.mcpServers.factory.command, "/bin/sh");
  assert.equal(manifest.mcpServers.factory.default_tools_approval_mode, "approve");
  assert.deepEqual(manifest.mcpServers.factory.env_vars, ["CODEX_THREAD_ID"]);
  assert.deepEqual(manifest.mcpServers.factory.args, [
    "-c",
    'root=${PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-$HOME/plugins/factory}}; exec node "$root/scripts/mcp.mjs"',
  ]);
});

test("SessionStart advertises model-directed tools without launching work", async (t) => {
  const repo = await isolated(t);
  const manager = new Manager();
  manager.snapshot = async () => ({
    cwd: repo,
    model: "gpt-5.6-sol",
    reasoningEffort: "medium",
    sandbox: { type: "dangerFullAccess" },
    approvalPolicy: "never",
  });
  const result = await manager.dispatch("hook", {
    threadId: "codex-root",
    event: "SessionStart",
  });
  assert.match(result.systemMessage, /model-directed mode/);
  assert.match(result.additionalContext, /factory_inspect and factory_delegate/);
  assert.equal(manager.runs.size, 0);

  const sessionId = "11b6dd27-13a6-4c5e-8d5c-1b9a4bb261f3";
  const reverse = await manager.dispatch("codex.hook", {
    sessionId,
    event: "SessionStart",
    cwd: repo,
    permissionMode: "plan",
    model: "claude-opus-5-5",
    effort: "high",
  });
  assert.match(reverse.systemMessage, /model-directed mode/);
  assert.match(reverse.additionalContext, /factory_inspect and factory_delegate/);
  assert.equal(manager.runs.size, 0);

  const refreshed = await manager.dispatch("codex.hook", {
    sessionId,
    event: "UserPromptSubmit",
    cwd: repo,
    permissionMode: "bypassPermissions",
    model: "claude-opus-5-5",
  });
  assert.deepEqual(refreshed, {});
  assert.equal((await taskRead(claudeTaskId(sessionId))).session.permissionMode, "bypassPermissions");
  assert.equal(manager.runs.size, 0);
});

test("edit target parsing covers each provider's native edit tools", () => {
  assert.deepEqual(editTargets("Edit", { file_path: "a.txt" }, "/repo"), [
    "/repo/a.txt",
  ]);
  assert.deepEqual(
    editTargets(
      "apply_patch",
      "*** Begin Patch\n*** Update File: /repo/a.txt\n*** Add File: /repo/b.txt\n*** End Patch",
      "/elsewhere",
    ),
    ["/repo/a.txt", "/repo/b.txt"],
  );
  assert.equal(editTargets("Bash", { command: "printf x > a" }, "/repo"), null);
});

test("edit guard scopes active workers to their verified root session", async (t) => {
  const repo = await isolated(t);
  const manager = new Manager();
  const task = await taskRead("codex-root");
  task.runIds = ["00000000-0000-4000-8000-000000000001"];
  await taskWrite(task);
  manager.runs.set(task.runIds[0], {
    id: task.runIds[0],
    threadId: task.id,
    cwd: repo,
    executor: "claude",
    state: "running",
    terminal: false,
    createdAt: Date.now(),
  });
  const denied = await manager.guard(task.id, {
    tool: "apply_patch",
    toolInput: "*** Begin Patch\n*** Update File: file.txt\n*** End Patch",
    cwd: repo,
  });
  assert.match(denied.deny, /is writing/);
  const other = await manager.guard(claudeTaskId("22b6dd27-13a6-4c5e-8d5c-1b9a4bb261f3"), {
    tool: "Edit",
    toolInput: { file_path: join(repo, "file.txt") },
    cwd: repo,
  });
  assert.deepEqual(other, {});
});

test("readiness never promises prompt dispatch", () => {
  const text = readiness("automatic", { reason: "candidate" }, "codex");
  assert.match(text, /handles user turns locally unless it calls factory_delegate/);
  assert.doesNotMatch(text, /new turns go|automatic dispatch/i);
});
