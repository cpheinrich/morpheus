import { test } from "node:test";
import assert from "node:assert/strict";
import {
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
  assert.equal(route(c, task, 20).executor, "codex");
  assert.equal(route(c, task, 19.99).executor, "claude");
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
  assert.throws(() =>
    modelSelection(c, { model: "unknown", reasoningEffort: "medium" }),
  );
  assert.throws(() =>
    modelSelection(c, { model: "gpt-6-astra", reasoningEffort: null }),
  );
  assert.throws(() => modelSelection(c, {}, { model: "best", effort: "high" }));
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
