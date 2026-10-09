import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configRead, configWrite } from "../src/store.mjs";
import {
  configSchema,
  defaults,
  route,
  remaining,
  modelSelection,
  permissionMode,
  subscriptionEnv,
} from "../src/config.mjs";
const task = { project: "/repo/.git", override: "auto" };
test("off overrides automatic, project and manual choices", () => {
  const c = defaults();
  c.projects[task.project] = "automatic";
  assert.equal(route(c, task, 1, "claude").executor, "codex");
  c.mode = "automatic";
  assert.equal(route(c, task, 30).executor, "codex");
  assert.equal(route(c, task, 29.99).executor, "claude");
  assert.equal(route(c, task, null).executor, "unknown");
  assert.equal(route(c, task, 0, "codex").executor, "codex");
  assert.equal(route(c, task, 90, "claude").executor, "claude");
  assert.equal(
    route(c, { ...task, disabled: true }, 0, "claude").executor,
    "codex",
  );
  c.projects[task.project] = "manual";
  assert.equal(route(c, task, 0).executor, "codex");
  assert.equal(route(c, task, 90, "claude").executor, "claude");
});
test("fresh settings default to 30 percent and preserve saved thresholds", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "claude-threshold-"));
  const previous = process.env.CODEX_CLAUDE_HOME;
  process.env.CODEX_CLAUDE_HOME = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.CODEX_CLAUDE_HOME;
    else process.env.CODEX_CLAUDE_HOME = previous;
    await rm(directory, { recursive: true, force: true });
  });
  const fresh = await configRead();
  assert.equal(fresh.threshold, 30);
  assert.equal(fresh.mode, "off");
  fresh.mode = "automatic";
  assert.equal(route(fresh, task, 30.01).executor, "codex");
  assert.equal(route(fresh, task, 30).executor, "codex");
  assert.equal(route(fresh, task, 29.99).executor, "claude");
  await configWrite({ ...fresh, threshold: 20 });
  const saved = await configRead();
  assert.equal(saved.threshold, 20);
  assert.equal(route(saved, task, 29.99).executor, "codex");
  assert.equal(route(saved, task, 20).executor, "codex");
  assert.equal(route(saved, task, 19.99).executor, "claude");
});
test("allowance uses most depleted fresh known window and fails closed", () => {
  const window = (usedPercent) => ({
    usedPercent,
    resetsAt: Date.now() / 1000 + 60,
  });
  assert.equal(
    remaining({
      rateLimitsByLimitId: {
        codex: { primary: window(12), secondary: window(93) },
      },
    }),
    7,
  );
  assert.equal(remaining({ rateLimits: { primary: window(100) } }), 0);
  for (const primary of [
    window(-1),
    window(101),
    window(NaN),
    { usedPercent: 20, resetsAt: 0 },
  ])
    assert.equal(remaining({ rateLimits: { primary } }), null);
  assert.equal(
    remaining({ rateLimits: { limitId: "other", primary: window(0) } }),
    null,
  );
  assert.equal(remaining({}), null);
});
test("model and effort independent, unknown mappings rejected", () => {
  const c = defaults();
  assert.deepEqual(
    modelSelection(c, { model: "gpt-6-astra", reasoningEffort: "xhigh" }),
    { model: "opus", effort: "xhigh" },
  );
  assert.deepEqual(
    modelSelection(c, { model: "gpt-5.6-luna", reasoningEffort: "medium" }),
    { model: "haiku", effort: "medium" },
  );
  assert.throws(
    () => modelSelection(c, { model: "unknown", reasoningEffort: "medium" }),
    /No Claude model mapping for Codex model "unknown"/,
  );
  assert.throws(() =>
    modelSelection(c, { model: "gpt-6-astra", reasoningEffort: null }),
  );
});
test("any explicit model id is passed to the CLI; moving aliases and unsafe ids are refused", () => {
  const c = defaults();
  assert.equal("subscriptionModels" in c, false);
  // A model released after the plugin needs no configuration change: the CLI decides
  // whether the subscription can run it.
  assert.deepEqual(
    modelSelection(c, {}, { model: "claude-fable-5-1", effort: "max" }),
    { model: "claude-fable-5-1", effort: "max" },
  );
  assert.deepEqual(
    modelSelection(c, {}, { model: "fable", effort: "high" }),
    { model: "fable", effort: "high" },
  );
  c.modelMap["gpt-7"] = "claude-opus-5-5";
  assert.deepEqual(
    modelSelection(c, { model: "gpt-7", reasoningEffort: "low" }),
    { model: "claude-opus-5-5", effort: "low" },
  );
  for (const alias of ["best", "Latest", "default", "newest", "auto"])
    assert.throws(
      () => modelSelection(c, {}, { model: alias, effort: "high" }),
      /moves with releases/,
    );
  c.modelMap["gpt-7"] = "best";
  assert.throws(
    () => modelSelection(c, { model: "gpt-7", reasoningEffort: "low" }),
    /moves with releases/,
  );
  for (const unsafe of ["opus;rm -rf", "--model", "claude fable", "a/b", ""])
    assert.throws(() =>
      modelSelection(c, {}, { model: unsafe, effort: "high" }),
    );
});
test("a saved subscriptionModels list still parses and no longer restricts the model", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "claude-allowlist-"));
  const previous = process.env.CODEX_CLAUDE_HOME;
  process.env.CODEX_CLAUDE_HOME = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.CODEX_CLAUDE_HOME;
    else process.env.CODEX_CLAUDE_HOME = previous;
    await rm(directory, { recursive: true, force: true });
  });
  const fresh = await configRead();
  await configWrite({ ...fresh, subscriptionModels: ["opus", "sonnet", "haiku"] });
  const saved = await configRead();
  assert.deepEqual(saved.subscriptionModels, ["opus", "sonnet", "haiku"]);
  assert.deepEqual(
    modelSelection(saved, {}, { model: "claude-fable-5-1", effort: "max" }),
    { model: "claude-fable-5-1", effort: "max" },
  );
  assert.throws(() => configSchema.parse({ subscriptionModels: ["bad id"] }));
});
test("permissions never widened and credential overrides removed without changing memory setting", () => {
  assert.equal(
    permissionMode({
      sandbox: { type: "dangerFullAccess" },
      approvalPolicy: "never",
    }),
    "bypassPermissions",
  );
  assert.equal(
    permissionMode({
      sandbox: { type: "dangerFullAccess" },
      approvalPolicy: "on-request",
    }),
    "default",
  );
  for (const sandbox of [
    null,
    { type: "workspaceWrite" },
    { type: "readOnly" },
  ])
    assert.throws(() => permissionMode({ sandbox, approvalPolicy: "never" }));
  assert.throws(() =>
    permissionMode({
      sandbox: { type: "dangerFullAccess" },
      approvalPolicy: "untrusted",
    }),
  );
  assert.deepEqual(
    subscriptionEnv({
      PATH: "bin",
      ANTHROPIC_API_KEY: "secret",
      CLAUDE_CODE_USE_BEDROCK: "1",
      CLAUDECODE: "1",
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    }),
    { PATH: "bin", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" },
  );
});
