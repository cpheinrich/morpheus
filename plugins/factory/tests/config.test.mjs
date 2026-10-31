import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configRead, configWrite } from "../src/store.mjs";
import {
  configSchema,
  defaults,
  route,
  modelSelection,
  permissionMode,
  subscriptionEnv,
  readGatewayQuota,
  resolveKeyRef,
} from "../src/config.mjs";
const task = { project: "/repo/.git", override: "auto" };
const gw = (name, provider, usedPercent) => ({ name, provider, baseUrl: "http://gw", keyRef: "env:KEY", usedPercent });
test("off overrides automatic, project and manual choices", () => {
  const c = defaults();
  c.projects[task.project] = "automatic";
  assert.equal(route(c, task, [], "claude").executor, "codex");
  c.mode = "automatic";
  assert.equal(route(c, task, []).executor, "codex");
  assert.equal(route(c, task, [gw("claude", "claude", 5)]).executor, "claude");
  assert.equal(route(c, task, [gw("claude", "claude", null)]).executor, "codex");
  assert.equal(route(c, task, [], "codex").executor, "codex");
  assert.equal(route(c, task, [], "claude").executor, "claude");
  assert.equal(
    route(c, { ...task, disabled: true }, [gw("claude", "claude", 5)], "claude").executor,
    "codex",
  );
  c.projects[task.project] = "manual";
  assert.equal(route(c, task, [gw("claude", "claude", 5)]).executor, "codex");
  assert.equal(route(c, task, [], "claude").executor, "claude");
});
test("fresh settings default to 90 percent and preserve saved thresholds", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "claude-threshold-"));
  const previous = process.env.FACTORY_HOME;
  process.env.FACTORY_HOME = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.FACTORY_HOME;
    else process.env.FACTORY_HOME = previous;
    await rm(directory, { recursive: true, force: true });
  });
  const fresh = await configRead();
  assert.equal(fresh.threshold, 90);
  assert.equal(fresh.mode, "off");
  fresh.mode = "automatic";
  assert.equal(route(fresh, task, [gw("claude", "claude", 90)]).executor, "codex");
  assert.equal(route(fresh, task, [gw("claude", "claude", 89.99)]).executor, "claude");
  // The same threshold applies when Claude coordinates and Codex is the delegate.
  assert.equal(route(fresh, task, [gw("codex", "codex", 90)], undefined, "claude").executor, "claude");
  assert.equal(route(fresh, task, [gw("codex", "codex", 89.99)], undefined, "claude").executor, "codex");
  await configWrite({ ...fresh, threshold: 30 });
  const saved = await configRead();
  assert.equal(saved.threshold, 30);
  assert.equal(route(saved, task, [gw("claude", "claude", 30)]).executor, "codex");
  assert.equal(route(saved, task, [gw("claude", "claude", 29.99)]).executor, "claude");
});
test("model and effort are mapped independently, with provenance", () => {
  const c = defaults();
  assert.deepEqual(
    modelSelection(c, { model: "gpt-6-astra", reasoningEffort: "xhigh" }),
    { model: "opus", effort: "xhigh", source: "mapped", codexModel: "gpt-6-astra" },
  );
  assert.deepEqual(
    modelSelection(c, { model: "gpt-5.6-luna", reasoningEffort: "medium" }),
    { model: "haiku", effort: "medium", source: "mapped", codexModel: "gpt-5.6-luna" },
  );
  assert.throws(() =>
    modelSelection(c, { model: "gpt-6-astra", reasoningEffort: null }),
  );
});
test("an unmapped Codex model falls back to opus instead of blocking delegation", () => {
  const c = defaults();
  assert.equal(c.modelFallback, "opus");
  // The model that blocked a real delegation and forced a model-choice question.
  assert.deepEqual(
    modelSelection(c, { model: "gpt-6.1-sol", reasoningEffort: "high" }),
    {
      model: "opus",
      effort: "high",
      source: "fallback",
      codexModel: "gpt-6.1-sol",
      reason: 'No modelMap entry for Codex model "gpt-6.1-sol"; used modelFallback "opus".',
    },
  );
  // Any later model behaves the same, as does a snapshot that names none.
  for (const model of ["gpt-9-nova", "o7-preview", "unknown"])
    assert.equal(modelSelection(c, { model, reasoningEffort: "low" }).source, "fallback", model);
  assert.equal(modelSelection(c, { reasoningEffort: "low" }).codexModel, null);
  // The fallback never displaces a configured mapping or an explicit choice.
  assert.equal(modelSelection(c, { model: "gpt-5.6-terra", reasoningEffort: "low" }).model, "sonnet");
  assert.deepEqual(
    modelSelection(c, { model: "gpt-6.1-sol", reasoningEffort: "high" }, { model: "claude-fable-5-1" }),
    { model: "claude-fable-5-1", effort: "high", source: "override", codexModel: "gpt-6.1-sol" },
  );
  c.modelMap["gpt-6.1-sol"] = "sonnet";
  assert.equal(modelSelection(c, { model: "gpt-6.1-sol", reasoningEffort: "high" }).source, "mapped");
  // A configured fallback is any fixed model; effort mapping is unchanged by it.
  const fable = configSchema.parse({ modelFallback: "fable" });
  assert.deepEqual(
    [modelSelection(fable, { model: "gpt-7", reasoningEffort: "ultra" }).model, modelSelection(fable, { model: "gpt-7", reasoningEffort: "ultra" }).effort],
    ["fable", "max"],
  );
});
test("a disabled or unusable fallback is a clear refusal, never a guess", () => {
  const off = configSchema.parse({ modelFallback: null });
  assert.throws(
    () => modelSelection(off, { model: "gpt-6.1-sol", reasoningEffort: "high" }),
    /No Claude model mapping for Codex model "gpt-6\.1-sol" and modelFallback is disabled/,
  );
  // Mapped models still work with the fallback off.
  assert.equal(modelSelection(off, { model: "gpt-5.5", reasoningEffort: "high" }).model, "opus");
  for (const fallback of ["best", "Latest", "default", "newest", "auto"])
    assert.throws(() => configSchema.parse({ modelFallback: fallback }), /moving alias/, fallback);
  for (const fallback of ["-opus", "opus;rm", "", "a/b"])
    assert.throws(() => configSchema.parse({ modelFallback: fallback }), undefined, fallback);
  // Saved settings from before the key existed load with the default.
  assert.equal(configSchema.parse({ mode: "manual", modelMap: { "gpt-5.5": "opus" } }).modelFallback, "opus");
});
test("any explicit model id is passed to the CLI; moving aliases and unsafe ids are refused", () => {
  const c = defaults();
  assert.equal("subscriptionModels" in c, false);
  // A model released after the plugin needs no configuration change: the CLI decides
  // whether the subscription can run it.
  const chosen = (selection) => [selection.model, selection.effort];
  assert.deepEqual(
    chosen(modelSelection(c, {}, { model: "claude-fable-5-1", effort: "max" })),
    ["claude-fable-5-1", "max"],
  );
  assert.deepEqual(chosen(modelSelection(c, {}, { model: "fable", effort: "high" })), ["fable", "high"]);
  c.modelMap["gpt-7"] = "claude-opus-5-5";
  assert.deepEqual(
    chosen(modelSelection(c, { model: "gpt-7", reasoningEffort: "low" })),
    ["claude-opus-5-5", "low"],
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
  assert.deepEqual(
    chosen(modelSelection(c, {}, { model: "claude-sonnet-5-5[1m]", effort: "high" })),
    ["claude-sonnet-5-5[1m]", "high"],
  );
  // The guard, at its boundary: a leading dash is the one character that turns a
  // model value into another CLI flag.
  for (const unsafe of ["-opus", "--model", "opus;rm -rf", "claude fable", "a/b", "opus[1m", "opus[1 m]"])
    assert.throws(
      () => modelSelection(c, {}, { model: unsafe, effort: "high" }),
      /Unsupported Claude model identifier/,
      unsafe,
    );
  // An empty explicit model is malformed input, not a reason to fall back.
  assert.throws(
    () => modelSelection(c, {}, { model: "", effort: "high" }),
    /Unsupported Claude model identifier/,
  );
});
test("a saved subscriptionModels list still parses and no longer restricts the model", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "claude-allowlist-"));
  const previous = process.env.FACTORY_HOME;
  process.env.FACTORY_HOME = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.FACTORY_HOME;
    else process.env.FACTORY_HOME = previous;
    await rm(directory, { recursive: true, force: true });
  });
  const fresh = await configRead();
  await configWrite({ ...fresh, subscriptionModels: ["opus", "sonnet", "haiku"] });
  const saved = await configRead();
  assert.deepEqual(saved.subscriptionModels, ["opus", "sonnet", "haiku"]);
  const selection = modelSelection(saved, {}, { model: "claude-fable-5-1", effort: "max" });
  assert.deepEqual([selection.model, selection.effort], ["claude-fable-5-1", "max"]);
  assert.throws(() => configSchema.parse({ subscriptionModels: ["bad id"] }));
});
test("an installed configuration saved before modelFallback existed falls back to opus", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "claude-fallback-"));
  const previous = process.env.FACTORY_HOME;
  process.env.FACTORY_HOME = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.FACTORY_HOME;
    else process.env.FACTORY_HOME = previous;
    await rm(directory, { recursive: true, force: true });
  });
  // Written by an earlier release: no modelFallback key, a customized mapping.
  const legacy = { ...defaults(), mode: "manual", modelMap: { "gpt-5.5": "claude-opus-5-5" } };
  delete legacy.modelFallback;
  await writeFile(join(directory, "config.json"), JSON.stringify(legacy), { mode: 0o600 });
  const saved = await configRead();
  assert.equal(saved.mode, "manual");
  assert.equal(saved.modelFallback, "opus");
  assert.equal(modelSelection(saved, { model: "gpt-5.5", reasoningEffort: "high" }).model, "claude-opus-5-5");
  assert.equal(modelSelection(saved, { model: "gpt-6.1-sol", reasoningEffort: "high" }).source, "fallback");
  // Turning it off round-trips through the validated writer.
  await configWrite({ ...saved, modelFallback: null });
  assert.equal((await configRead()).modelFallback, null);
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
    {
      PATH: "bin",
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      FACTORY_DELEGATED: "1",
    },
  );
});

test("gateways validate and reject a raw key", () => {
  const ok = configSchema.parse({
    gateways: [{ name: "claude", provider: "claude", baseUrl: "http://gw", keyRef: "env:KEY" }],
  });
  assert.equal(ok.gateways.length, 1);
  assert.equal(ok.gateways[0].provider, "claude");
  assert.throws(
    () => configSchema.parse({ gateways: [{ name: "x", provider: "claude", baseUrl: "http://gw", keyRef: "sk-raw" }] }),
    /never a raw key/,
  );
  // secret:path is accepted.
  assert.equal(
    configSchema.parse({ gateways: [{ name: "x", provider: "codex", baseUrl: "http://gw", keyRef: "secret:/p" }] }).gateways[0].keyRef,
    "secret:/p",
  );
});

test("resolveKeyRef resolves env and secret references, never a raw key", async (t) => {
  const previous = process.env.TEST_KEY;
  process.env.TEST_KEY = "sk-value";
  t.after(() => {
    if (previous === undefined) delete process.env.TEST_KEY;
    else process.env.TEST_KEY = previous;
  });
  assert.equal(await resolveKeyRef("env:TEST_KEY"), "sk-value");
  await assert.rejects(resolveKeyRef("env:MISSING_KEY"), /not set/);
  await assert.rejects(resolveKeyRef("sk-raw"), /Invalid keyRef/);
});

test("readGatewayQuota reads the sub2api admin API and fails closed", async () => {
  const fetchImpl = async (url, opts) => {
    if (url.endsWith("/api/v1/auth/login")) {
      return { ok: true, json: async () => ({ data: { access_token: "tok" } }) };
    }
    if (url.endsWith("/api/v1/admin/accounts")) {
      return {
        ok: true,
        json: async () => ({
          data: {
            items: [
              { platform: "anthropic", extra: { session_window_utilization: 0.05 } },
              { platform: "openai", extra: { codex_7d_used_percent: 53 } },
            ],
          },
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const gateways = [
    { name: "claude", provider: "claude", baseUrl: "http://gw", keyRef: "env:KEY" },
    { name: "codex", provider: "codex", baseUrl: "http://gw", keyRef: "env:KEY" },
  ];
  const result = await readGatewayQuota(gateways, { adminEmail: "a", adminPassword: "b", fetchImpl });
  assert.equal(result[0].usedPercent, 5);
  assert.equal(result[1].usedPercent, 53);
  // No admin credentials: every gateway is unknown, never "plenty left".
  const noCreds = await readGatewayQuota(gateways, { fetchImpl });
  assert.equal(noCreds[0].usedPercent, null);
  assert.equal(noCreds[1].usedPercent, null);
  // A login failure fails closed too.
  const bad = await readGatewayQuota(gateways, {
    adminEmail: "a",
    adminPassword: "b",
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
  });
  assert.equal(bad[0].usedPercent, null);
});

test("placement picks the most-headroom gateway below the threshold", () => {
  const c = { ...defaults(), mode: "automatic" };
  const gateways = [gw("claude", "claude", 5), gw("codex", "codex", 53)];
  const r = route(c, task, gateways);
  assert.equal(r.executor, "claude");
  assert.equal(r.gateway.name, "claude");
  // At or above the threshold, or unknown, the gateway is skipped.
  assert.equal(route(c, task, [gw("claude", "claude", 90)]).executor, "codex");
  assert.equal(route(c, task, [gw("claude", "claude", null)]).executor, "codex");
  // The coordinator's own provider is never a delegate: a codex gateway with more
  // headroom than the claude gateway is skipped when Codex coordinates.
  assert.equal(
    route(c, task, [gw("claude", "claude", 80), gw("codex", "codex", 10)]).executor,
    "claude",
  );
  // An explicit model still wins over the greedy pick.
  assert.equal(route(c, task, gateways, "codex").executor, "codex");
});
