// A coordinator may delegate to its own provider when that provider sits behind a gateway:
// the gateway is a separate subscription reached as an API. These run the real guardian with
// fake CLIs and a stubbed sub2api admin API, and check what each worker was launched with.
import { test } from "node:test";
import { linkedCheckout } from "./git-fixtures.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, chmod, readFile, mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { defaults } from "../src/config.mjs";
import { initStore, configWrite, taskRead, atomic, runDir } from "../src/store.mjs";
import { Manager, claudeTaskId } from "../src/service.mjs";

const BASE = "http://gw.test:8080";

async function harness(t, binaries) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "gateway-workers-")));
  const saved = {
    FACTORY_HOME: process.env.FACTORY_HOME,
    PATH: process.env.PATH,
    GW_KEY: process.env.GW_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GW_ADMIN_EMAIL: process.env.GW_ADMIN_EMAIL,
    GW_ADMIN_PASSWORD: process.env.GW_ADMIN_PASSWORD,
    fetch: globalThis.fetch,
  };
  t.after(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (key === "fetch") globalThis.fetch = value;
      else if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });
  process.env.FACTORY_HOME = join(root, "home");
  process.env.GW_KEY = "sk-gateway-test";
  process.env.GW_ADMIN_EMAIL = "admin@gw.test";
  process.env.GW_ADMIN_PASSWORD = "pw";
  const bin = join(root, "bin");
  await mkdir(bin);
  for (const [name, body] of Object.entries(binaries)) {
    await writeFile(join(bin, name), body);
    await chmod(join(bin, name), 0o755);
  }
  process.env.PATH = `${bin}:${saved.PATH}`;
  // sub2api: both accounts fresh, so each coordinator's own-provider gateway is eligible.
  globalThis.fetch = async (url) => {
    if (url === `${BASE}/api/v1/auth/login`)
      return { ok: true, json: async () => ({ data: { access_token: "admin-token" } }) };
    if (url === `${BASE}/api/v1/admin/accounts?page=1`)
      return {
        ok: true,
        json: async () => ({
          data: {
            items: [
              { id: 1, platform: "anthropic", type: "oauth", status: "active", schedulable: true },
              { id: 2, platform: "openai", credentials: { plan_type: "pro" }, type: "oauth", status: "active", schedulable: true, extra: { codex_7d_used_percent: 4 } },
            ],
          },
        }),
      };
    if (url === `${BASE}/api/v1/admin/accounts/1/usage?source=active&force=true`)
      return {
        ok: true,
        json: async () => ({
          data: {
            updated_at: new Date().toISOString(),
            five_hour: { utilization: 2, resets_at: null },
            seven_day: { utilization: 2, resets_at: null },
          },
        }),
      };
    throw new Error(`unexpected fetch ${url}`);
  };
  await initStore();
  return { root, repo: await linkedCheckout(root, "repo") };
}

async function gatewayConfig(provider, keyRef = "env:GW_KEY") {
  await configWrite({
    ...defaults(),
    mode: "automatic",
    // Only the coordinator's own provider has a gateway, so routing must pick it.
    gateways: [{ name: "pool", provider, baseUrl: BASE, keyRef }],
    admin: { emailRef: "env:GW_ADMIN_EMAIL", passwordRef: "env:GW_ADMIN_PASSWORD" },
  });
}

async function settle(m, id, until = (r) => r.terminal) {
  let r;
  for (let i = 0; i < 150; i++) {
    r = await m.wait(id, 1);
    if (until(r)) return r;
  }
  return r;
}

test("a Claude session delegates to Claude behind a gateway and answers its live question", async (t) => {
  const { root, repo } = await harness(t, {
    // Fake Claude: records argv and environment, asks one question, then completes.
    claude: `#!/bin/sh
printf '%s\\n' "$@" > "$ROOT/argv"
env > "$ROOT/env"
IFS= read -r first; printf '%s' "$first" > "$ROOT/stdin1"
echo '{"type":"system","subtype":"init","session_id":"sess-gateway-1"}'
echo '{"type":"control_request","request_id":"q1","request":{"subtype":"can_use_tool","tool_name":"AskUserQuestion","input":{"questions":[{"question":"Color?"}]}}}'
IFS= read -r reply; printf '%s' "$reply" > "$ROOT/stdin2"
echo '{"type":"result","subtype":"success","is_error":false,"result":"done","structured_output":{"outcome":"completed","summary":"done","evidence":["ok"]},"session_id":"sess-gateway-1"}'
`.replaceAll("$ROOT", "__ROOT__"),
  });
  await writeFile(
    join(root, "bin", "claude"),
    (await readFile(join(root, "bin", "claude"), "utf8")).replaceAll("__ROOT__", root),
  );
  await gatewayConfig("claude");
  const sessionId = "aa11bb22-cc33-4dd4-8ee5-ff6677889900";
  const m = new Manager();
  t.after(() => m.viewer.close());
  await m.dispatch("codex.hook", {
    sessionId,
    event: "SessionStart",
    cwd: repo,
    permissionMode: "acceptEdits",
    model: "claude-sonnet-5-5",
    effort: "high",
  });
  const inspected = await m.factoryInspect({ rootKind: "claude", rootId: sessionId });
  assert.equal(inspected.route.executor, "claude");
  assert.equal(inspected.route.gateway.name, "pool");
  assert.deepEqual(inspected.selection, { model: "claude-opus-5-5", effort: "high", speed: "standard" });
  const started = await m.factoryDelegate({ rootKind: "claude", rootId: sessionId, prompt: "Paint the fence" });
  assert.equal(started.executor, "claude");
  assert.equal(started.gateway, "pool");
  assert.deepEqual(started.selection, inspected.selection);
  assert.equal(started.permissions, "acceptEdits");
  const asking = await settle(m, started.id, (r) => r.question || r.terminal);
  assert.equal(asking.question?.id, "q1");
  // A Claude coordinator answers through codex.answer; tool permission would still need a user.
  await m.dispatch("codex.answer", {
    sessionId,
    runId: started.id,
    questionId: "q1",
    source: "claude",
    reason: "Reversible fixture choice",
    answers: { "Color?": "Blue" },
  });
  const done = await settle(m, started.id);
  assert.equal(done.state, "completed");
  const argv = (await readFile(join(root, "argv"), "utf8")).trim().split("\n");
  assert.equal(argv[argv.indexOf("--permission-mode") + 1], "acceptEdits");
  assert.equal(argv[argv.indexOf("--model") + 1], "claude-opus-5-5");
  assert.deepEqual(JSON.parse(argv[argv.indexOf("--settings") + 1]), {
    env: { CLAUDE_CODE_DISABLE_FAST_MODE: "1" },
  });
  const env = await readFile(join(root, "env"), "utf8");
  assert.match(env, new RegExp(`^ANTHROPIC_BASE_URL=${BASE}$`, "m"));
  assert.match(env, /^ANTHROPIC_AUTH_TOKEN=sk-gateway-test$/m);
  assert.match(env, /^FACTORY_DELEGATED=1$/m);
  // No variable a configured reference names reaches the worker: admin login or key source.
  assert.doesNotMatch(env, /^(GW_ADMIN_PASSWORD|GW_ADMIN_EMAIL|GW_KEY|FACTORY_ADMIN_\w*)=/m);
  assert.match(await readFile(join(root, "stdin1"), "utf8"), /delegated by Claude Code\./);
  const reply = JSON.parse(await readFile(join(root, "stdin2"), "utf8"));
  assert.equal(reply.response.request_id, "q1");
  assert.deepEqual(reply.response.response.updatedInput.answers, { "Color?": "Blue" });
  // The sticky primary conversation is keyed by the root checkout; its route is stored
  // separately so gateway reorder cannot change worker identity.
  const task = await taskRead(claudeTaskId(sessionId));
  assert.deepEqual(task.sessions, { [`primary:${repo}`]: "sess-gateway-1" });
  assert.deepEqual(task.workerBinding, { executor: "claude", gateway: "pool" });
  assert.equal(task.primaryCwd, repo);
  // Another Claude session cannot answer this run.
  await assert.rejects(
    m.dispatch("codex.answer", {
      sessionId: "00000000-1111-4222-8333-444455556666",
      runId: started.id,
      questionId: "q1",
      source: "claude",
      reason: "x",
    }),
    /another Claude session/,
  );
});

test("a Codex task delegates to Codex behind a gateway with its own model and sandbox", async (t) => {
  const { root, repo } = await harness(t, {
    codex: `#!/bin/sh
printf '%s\\n' "$@" > "__ROOT__/argv"
env > "__ROOT__/env"
cat > "__ROOT__/stdin"
echo '{"type":"thread.started","thread_id":"0199bbbb-cccc-7ddd-8eee-ffff00001111"}'
echo '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"outcome\\":\\"completed\\",\\"summary\\":\\"done\\",\\"evidence\\":[\\"ok\\"],\\"question\\":\\"\\"}"}}'
echo '{"type":"turn.completed","usage":{}}'
`,
  });
  await writeFile(
    join(root, "bin", "codex"),
    (await readFile(join(root, "bin", "codex"), "utf8")).replaceAll("__ROOT__", root),
  );
  // The key reference names the provider's own variable: the worker must still receive it.
  process.env.OPENAI_API_KEY = "sk-gateway-test";
  await gatewayConfig("codex", "env:OPENAI_API_KEY");
  const m = new Manager();
  t.after(() => m.viewer.close());
  const threadId = "0199cccc-dddd-7eee-8fff-000011112222";
  // The coordinating Codex task: never-approve full access, so the worker gets full access.
  m.snapshot = async () => ({
    cwd: repo,
    model: "gpt-6-luna",
    reasoningEffort: "none",
    sandbox: { type: "dangerFullAccess" },
    approvalPolicy: "never",
  });
  const started = await m.factoryDelegate({ rootKind: "codex", rootId: threadId, prompt: "Generate the image" });
  assert.equal(started.executor, "codex");
  assert.equal(started.gateway, "pool");
  assert.deepEqual(started.selection, { model: "gpt-6.1-sol", effort: "low", speed: "standard" });
  const done = await settle(m, started.id);
  assert.equal(done.state, "completed");
  const argv = (await readFile(join(root, "argv"), "utf8")).trim().split("\n");
  const overrides = argv.filter((_, i) => argv[i - 1] === "-c");
  assert.deepEqual(overrides.filter((arg) => arg.startsWith("model_provider")), [
    'model_provider="factory-gateway"',
    'model_providers.factory-gateway.name="Factory gateway"',
    `model_providers.factory-gateway.base_url="${BASE}/v1"`,
    'model_providers.factory-gateway.wire_api="responses"',
    'model_providers.factory-gateway.env_key="OPENAI_API_KEY"',
    'model_providers.factory-gateway.requires_openai_auth=false',
  ]);
  assert.ok(overrides.includes('service_tier="default"'));
  assert.equal(argv[argv.indexOf("-m") + 1], "gpt-6.1-sol");
  assert.ok(argv.includes("--dangerously-bypass-approvals-and-sandbox"));
  const env = await readFile(join(root, "env"), "utf8");
  assert.match(env, /^OPENAI_API_KEY=sk-gateway-test$/m);
  assert.match(env, /^FACTORY_DELEGATED=1$/m);
  assert.doesNotMatch(env, /^CODEX_THREAD_ID=/m);
  // The admin login this config references is removed; the route's own key is not.
  assert.doesNotMatch(env, /^(GW_ADMIN_PASSWORD|GW_ADMIN_EMAIL)=/m);
  assert.match(await readFile(join(root, "stdin"), "utf8"), /delegated by Codex\./);
  const task = await taskRead(threadId);
  assert.deepEqual(task.codexSessions, {
    [`primary:${repo}`]: "0199bbbb-cccc-7ddd-8eee-ffff00001111",
  });
  assert.deepEqual(task.workerBinding, { executor: "codex", gateway: "pool" });
  assert.equal(task.primaryCwd, repo);
  // An on-request task maps to a read-only sandbox: delegation never widens permissions.
  m.snapshot = async () => ({
    cwd: repo,
    model: "gpt-6-astra",
    reasoningEffort: "medium",
    sandbox: { type: "dangerFullAccess" },
    approvalPolicy: "on-request",
  });
  await assert.rejects(
    m.factoryDelegate({ rootKind: "codex", rootId: threadId, prompt: "Look only", model: "opus" }),
    /already pinned to codex/,
  );
  await assert.rejects(
    m.factoryDelegate({ rootKind: "codex", rootId: threadId, prompt: "Look only", model: "opus", provider: "codex" }),
    /belongs to a different worker provider/,
  );
  const second = await m.factoryDelegate({
    rootKind: "codex", rootId: threadId, prompt: "Look only", model: "gpt-6.1-terra", speed: "fast",
  });
  assert.equal(second.permissions, "read-only");
  await settle(m, second.id);
  const resumed = (await readFile(join(root, "argv"), "utf8")).trim().split("\n");
  // It resumes the gateway conversation saved by the first run.
  assert.deepEqual(resumed.slice(0, 2), ["exec", "resume"]);
  assert.ok(resumed.includes("0199bbbb-cccc-7ddd-8eee-ffff00001111"));
  assert.ok(resumed.includes('service_tier="fast"'));
  assert.equal(resumed[resumed.indexOf("-m") + 1], "gpt-6.1-terra");
  // A question asked on another route cannot be answered on this one: a native Claude
  // worker's needs_input stays with native Claude even though the Codex gateway is chosen.
  const asked = "0199dddd-eeee-7fff-8000-111122223333";
  await mkdir(runDir(asked), { recursive: true });
  await atomic(join(runDir(asked), "run.json"), {
    id: asked,
    executor: "claude",
    threadId,
    cwd: repo,
    gateway: null,
    state: "needs_input",
    terminal: true,
    question: null,
  });
  await m.mutateTask(threadId, (current) => {
    current.runId = asked;
  });
  await assert.rejects(
    m.start({ threadId, prompt: "Blue", replySource: "codex", replyReason: "routine default" }),
    /asked its question on native claude, but routing now chooses: Pinned primary worker: codex through gateway "pool"/,
  );
  // A pinned gateway is identity, not a fresh placement recommendation. Removing it fails
  // closed instead of switching this root to native Claude or another gateway.
  await configWrite({ ...defaults(), mode: "automatic", gateways: [] });
  const unavailable = await m.inspect(threadId);
  assert.equal(unavailable.route.unavailable, true);
  assert.match(unavailable.route.reason, /Pinned gateway "pool" is missing/);
  await assert.rejects(
    m.start({ threadId, prompt: "do not reroute" }),
    /Pinned gateway "pool" is missing/,
  );
});

test("an explicit GPT model selects Codex on the first run when Claude has more quota", async (t) => {
  const { repo } = await harness(t, {
    codex: `#!/bin/sh
cat >/dev/null
echo '{"type":"thread.started","thread_id":"0199bbbb-cccc-7ddd-8eee-ffff00001111"}'
echo '{"type":"turn.completed","usage":{}}'
`,
  });
  await configWrite({
    ...defaults(),
    mode: "manual",
    gateways: [
      { name: "claude", provider: "claude", baseUrl: BASE, keyRef: "env:GW_KEY" },
      { name: "codex", provider: "codex", baseUrl: BASE, keyRef: "env:GW_KEY" },
    ],
    admin: { emailRef: "env:GW_ADMIN_EMAIL", passwordRef: "env:GW_ADMIN_PASSWORD" },
  });
  const m = new Manager();
  t.after(() => m.viewer.close());
  const threadId = "0199cccc-dddd-7eee-8fff-000011112223";
  m.snapshot = async () => ({
    cwd: repo,
    reasoningEffort: "medium",
    sandbox: { type: "dangerFullAccess" },
    approvalPolicy: "never",
  });
  const before = await m.inspect(threadId);
  assert.equal(before.binding, null);
  assert.equal(before.route.executor, "claude");
  const started = await m.factoryDelegate({
    rootKind: "codex", rootId: threadId, prompt: "Use the requested model", model: "gpt-6.1-terra",
  });
  assert.equal(started.executor, "codex");
  assert.equal(started.gateway, "codex");
  assert.equal(started.selection.model, "gpt-6.1-terra");
  assert.deepEqual((await taskRead(threadId)).workerBinding, { executor: "codex", gateway: "codex" });
  await settle(m, started.id);
});
