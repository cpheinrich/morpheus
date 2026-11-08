import { test } from "node:test";
import { linkedCheckout } from "./git-fixtures.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, chmod, readFile, mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  defaults,
  route,
  claudeRemaining,
  codexSelection,
  codexRootEffort,
  codexPermission,
  codexEnv,
} from "../src/config.mjs";
import {
  codexArgs,
  applyCodexEvent,
  parseCodexResult,
  subscriptionFromLoginStatus,
  resultSchemaPath,
} from "../src/codex-exec.mjs";
import {
  recordClaudeUsage,
  readClaudeUsage,
  statusText,
  transcriptModel,
  transcriptPermissionMode,
} from "../src/claude-usage.mjs";
import {
  atomic,
  initStore,
  configWrite,
  taskRead,
  taskWrite,
  runDir,
} from "../src/store.mjs";
import { Manager, claudeTaskId } from "../src/service.mjs";
const gw = (name, provider, usedPercent) => ({ name, provider, baseUrl: "http://gw", keyRef: "env:KEY", usedPercent });

async function isolatedHome(t) {
  const root = await mkdtemp(join(tmpdir(), "reverse-"));
  const previous = process.env.FACTORY_HOME;
  process.env.FACTORY_HOME = join(root, "home");
  t.after(async () => {
    if (previous === undefined) delete process.env.FACTORY_HOME;
    else process.env.FACTORY_HOME = previous;
    await rm(root, { recursive: true, force: true });
  });
  await initStore();
  return root;
}

test("Claude allowance uses the most depleted fresh window and fails closed", () => {
  const now = 1_800_000_000_000;
  const future = now / 1000 + 3600;
  const snap = (five, seven, recordedAt = now) => ({
    recordedAt,
    rateLimits: {
      five_hour: { used_percentage: five, resets_at: future },
      ...(seven == null ? {} : { seven_day: { used_percentage: seven, resets_at: future } }),
    },
  });
  assert.equal(claudeRemaining(snap(20, 62), now), 38);
  assert.equal(claudeRemaining(snap(51, null), now), 49);
  // Stale, expired, out-of-range or missing data is unknown, never "plenty left".
  assert.equal(claudeRemaining(snap(20, 62, now - 20 * 60000 - 1), now), null);
  assert.equal(claudeRemaining(snap(20, 62, now - 20 * 60000), now), 38);
  assert.equal(claudeRemaining(snap(101, 1), now), null);
  assert.equal(
    claudeRemaining(
      { recordedAt: now, rateLimits: { five_hour: { used_percentage: 10, resets_at: now / 1000 } } },
      now,
    ),
    null,
  );
  assert.equal(claudeRemaining({ recordedAt: now, rateLimits: {} }, now), null);
  assert.equal(claudeRemaining(null, now), null);
});

test("Claude-coordinated routing delegates to Codex strictly below the threshold", () => {
  const c = { ...defaults(), mode: "automatic" };
  const task = { project: "/repo/.git", override: "auto" };
  assert.equal(c.threshold, 90);
  assert.equal(route(c, task, [gw("codex", "codex", 90)], undefined, "claude").executor, "codex");
  assert.equal(route(c, task, [gw("codex", "codex", 89.99)], undefined, "claude").executor, "codex");
  assert.match(route(c, task, [gw("codex", "codex", 10)], undefined, "claude").reason, /most headroom/);
  assert.equal(route(c, task, [], undefined, "claude").executor, "codex");
  assert.equal(route(c, task, [gw("codex", "codex", 5)], "codex", "claude").executor, "codex");
  assert.equal(route(c, { ...task, override: "claude" }, [gw("codex", "codex", 5)], undefined, "claude").executor, "claude");
  assert.equal(route({ ...c, mode: "manual" }, task, [gw("codex", "codex", 5)], undefined, "claude").executor, "codex");
  assert.equal(route({ ...c, mode: "off" }, task, [gw("codex", "codex", 5)], "codex", "claude").executor, "claude");
  assert.equal(route(c, { ...task, disabled: true }, [gw("codex", "codex", 5)], "codex", "claude").executor, "claude");
});

test("Claude permission modes never widen into Codex", () => {
  assert.deepEqual(codexPermission("bypassPermissions").args, [
    "--dangerously-bypass-approvals-and-sandbox",
  ]);
  for (const mode of ["acceptEdits", "auto"]) {
    const p = codexPermission(mode);
    assert.equal(p.name, "workspace-write");
    assert.deepEqual(p.args, ["-c", 'sandbox_mode="workspace-write"', "-c", 'approval_policy="never"']);
  }
  assert.equal(codexPermission("plan").name, "read-only");
  // Default mode asks before each edit; approval-free Codex writes would widen it.
  assert.deepEqual(codexPermission("default").args, ["-c", 'sandbox_mode="read-only"', "-c", 'approval_policy="never"']);
  assert.deepEqual(codexPermission("plan", ["/repo/.git"]).args.length, 4);
  assert.deepEqual(codexPermission("auto", ["/repo/.git"]).args.slice(4), [
    "-c",
    'sandbox_workspace_write.writable_roots=["/repo/.git"]',
  ]);
  assert.throws(() => codexPermission("dontAsk"), /refused/);
  assert.throws(() => codexPermission(undefined), /refused/);
});

test("Claude model and effort map to approved Codex selections only", () => {
  const c = defaults();
  assert.deepEqual(codexSelection(c, { model: "claude-opus-5-5", effort: "high" }), {
    model: "gpt-5.6-sol",
    effort: "high",
  });
  assert.deepEqual(codexSelection(c, { model: "claude-fable-5-1" }), {
    model: "gpt-6-astra",
    effort: null,
  });
  assert.deepEqual(codexSelection(c, { model: "claude-haiku-4-5-20251001" }).model, "gpt-5.6-luna");
  assert.deepEqual(codexSelection(c, {}), { model: null, effort: null });
  assert.deepEqual(codexSelection(c, {}, { model: "gpt-5.5", effort: "low" }), {
    model: "gpt-5.5",
    effort: "low",
  });
  assert.equal(codexSelection(c, {}, { effort: "minimal" }).effort, "low");
  assert.equal(codexSelection(c, {}, { effort: "ultra" }).effort, "max");
  c.codexEffortMap.high = "medium";
  assert.equal(codexSelection(c, { effort: "high" }).effort, "medium");
  assert.equal(codexRootEffort("high"), "high");
  assert.equal(codexRootEffort("minimal"), "low");
  assert.equal(codexRootEffort("ultra"), "max");
  assert.throws(() => codexSelection(c, {}, { model: "o3-pro" }), /approved Codex model/);
  assert.throws(() => codexSelection(c, {}, { effort: "unknown" }), /effort/);
});

test("Codex worker environment drops API credentials and marks delegation", () => {
  assert.deepEqual(
    codexEnv({
      PATH: "bin",
      OPENAI_API_KEY: "secret",
      OPENAI_BASE_URL: "https://proxy",
      CODEX_API_KEY: "secret",
      CODEX_THREAD_ID: "t",
      CLAUDE_CODE_SESSION_ID: "s",
      CLAUDECODE: "1",
      HOME: "/h",
    }),
    { PATH: "bin", HOME: "/h", FACTORY_DELEGATED: "1" },
  );
});

test("Codex login must be the ChatGPT subscription", () => {
  assert.equal(subscriptionFromLoginStatus("Logged in using ChatGPT\n"), "chatgpt");
  assert.throws(() => subscriptionFromLoginStatus("Logged in using an API key - sk-…"), /ChatGPT/);
  assert.throws(() => subscriptionFromLoginStatus("Not logged in"), /ChatGPT/);
});

test("Codex argv resumes by session id and keeps the prompt out of argv", () => {
  const permission = codexPermission("auto");
  const fresh = codexArgs(null, { model: "gpt-5.6-sol", effort: "high" }, permission);
  assert.deepEqual(fresh.slice(0, 4), ["codex", "exec", "--json", "--skip-git-repo-check"]);
  assert.equal(fresh.at(-1), "-");
  assert.ok(fresh.includes("gpt-5.6-sol"));
  assert.ok(fresh.includes('model_reasoning_effort="high"'));
  assert.equal(fresh[fresh.indexOf("--output-schema") + 1], resultSchemaPath);
  const resumed = codexArgs("01a10fb9", { model: null, effort: null }, permission);
  assert.deepEqual(resumed.slice(0, 3), ["codex", "exec", "resume"]);
  assert.deepEqual(resumed.slice(-2), ["01a10fb9", "-"]);
  assert.ok(!resumed.includes("-m"));
  const schema = JSON.parse(readFileSync(resultSchemaPath, "utf8"));
  // Codex structured output requires every property to be listed as required.
  assert.deepEqual(schema.required.sort(), Object.keys(schema.properties).sort());
});

test("Factory registers context MCP for an admitted Morpheus checkout on both providers", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "factory-context-mcp-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { claudeArgs } = await import("../src/claude.mjs");
  const selection = { model: "test-model", effort: "high" };
  const codex = () => codexArgs(null, selection, codexPermission("auto"), null, root);
  const claude = () => claudeArgs(null, selection, "default", [], root);
  assert.equal(codex().some(arg => arg.startsWith("mcp_servers.morpheus_context.")), false);
  assert.equal(claude().includes("--mcp-config"), false);

  await writeFile(join(root, "morpheus.json"), "{}");
  assert.deepEqual(codex().filter(arg => arg.startsWith("mcp_servers.morpheus_context.")), [
    'mcp_servers.morpheus_context.command="morpheus"',
    'mcp_servers.morpheus_context.args=["context","mcp"]',
    'mcp_servers.morpheus_context.env.MORPHEUS_CONTEXT_WORKTREE_PIN="1"',
    `mcp_servers.morpheus_context.cwd=${JSON.stringify(root)}`,
  ]);
  const argv = claude();
  assert.deepEqual(JSON.parse(argv[argv.indexOf("--mcp-config") + 1]), {
    mcpServers: { morpheus_context: { command: "morpheus", args: ["context", "mcp"], env: { MORPHEUS_CONTEXT_WORKTREE_PIN: "1" } } },
  });
  assert.equal(argv.includes("--strict-mcp-config"), false);
});

test("recorded codex exec events fold into a structured result", () => {
  const run = { sequence: 0, progress: "", state: "starting" };
  const events = [
    { type: "thread.started", thread_id: "01a10fb9-9e89-77b2-a38b-529c52ded01d" },
    { type: "item.completed", item: { id: "item_0", type: "error", message: "clamping hook timeout" } },
    { type: "turn.started" },
    { type: "item.started", item: { type: "command_execution", command: "/bin/zsh -lc 'echo hi'" } },
    { type: "error", message: "Reconnecting... 1/5" },
    {
      type: "item.completed",
      item: {
        type: "agent_message",
        text: '{"outcome":"completed","summary":"Ran echo.","evidence":["Output: hi"],"question":""}',
      },
    },
  ];
  for (const e of events) assert.equal(applyCodexEvent(run, e), false);
  assert.equal(run.newSession, "01a10fb9-9e89-77b2-a38b-529c52ded01d");
  assert.equal(run.result, undefined, "a transient stream error is not an outcome");
  assert.equal(applyCodexEvent(run, { type: "turn.completed", usage: {} }), true);
  assert.equal(run.state, "completed");
  assert.deepEqual(run.result.evidence, ["Output: hi"]);
  assert.match(run.progress, /\$ \/bin\/zsh -lc 'echo hi'/);
  const failed = { sequence: 0 };
  assert.equal(applyCodexEvent(failed, { type: "turn.failed", error: { message: "usage limit" } }), true);
  assert.equal(failed.state, "failed");
  assert.equal(parseCodexResult("plain prose question?").outcome, "needs_input");
  assert.equal(parseCodexResult('{"outcome":"done","summary":"x","evidence":[]}').outcome, "needs_input");
});

test("status line records only subscription windows", async (t) => {
  await isolatedHome(t);
  assert.equal(await recordClaudeUsage({ model: { id: "x" } }), null);
  const snapshot = await recordClaudeUsage(
    {
      session_id: "s",
      rate_limits: {
        five_hour: { used_percentage: 61.4, resets_at: 1 },
        seven_day: { used_percentage: 12, resets_at: 2 },
        spend_limit: { used_percentage: 5, resets_at: 3 },
      },
    },
    42,
  );
  assert.deepEqual(await readClaudeUsage(), snapshot);
  assert.deepEqual(snapshot, {
    recordedAt: 42,
    rateLimits: {
      five_hour: { used_percentage: 61.4, resets_at: 1 },
      seven_day: { used_percentage: 12, resets_at: 2 },
    },
  });
  assert.equal(statusText(snapshot), "5h 61% · 7d 12%");
});

test("Claude session ids are validated before naming a record", () => {
  assert.equal(claudeTaskId("11b6dd27-13a6-4c5e-8d5c-1b9a4bb261f3"), "claude_11b6dd27-13a6-4c5e-8d5c-1b9a4bb261f3");
  assert.throws(() => claudeTaskId("../x"), /Invalid/);
  assert.throws(() => claudeTaskId(undefined), /Invalid/);
});

async function fakeCodex(root, body) {
  const bin = join(root, "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, "codex"), body);
  await chmod(join(bin, "codex"), 0o755);
  const previous = process.env.PATH;
  process.env.PATH = `${bin}:${previous}`;
  return () => (process.env.PATH = previous);
}

test("a Claude session delegates to Codex end to end through the guardian", async (t) => {
  const root = await isolatedHome(t);
  const repo = await linkedCheckout(root, "repo");
  // Fake codex: records argv, stdin and environment, then streams real event shapes.
  const restore = await fakeCodex(
    root,
    `#!/bin/sh
if [ "$1" = login ]; then echo "Logged in using ChatGPT"; exit 0; fi
printf '%s\\n' "$@" > "${root}/argv"
cat > "${root}/stdin"
env > "${root}/env"
echo '{"type":"thread.started","thread_id":"0199aaaa-bbbb-7ccc-8ddd-eeeeffff0000"}'
echo '{"type":"turn.started"}'
echo '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"outcome\\":\\"completed\\",\\"summary\\":\\"done\\",\\"evidence\\":[\\"ok\\"],\\"question\\":\\"\\"}"}}'
echo '{"type":"turn.completed","usage":{}}'
`,
  );
  t.after(restore);
  const sessionId = "11b6dd27-13a6-4c5e-8d5c-1b9a4bb261f3";
  await configWrite({ ...defaults(), mode: "manual" });
  const m = new Manager();
  t.after(() => m.viewer.close());
  // Before the hooks have reported the session, nothing is launched.
  await assert.rejects(
    m.codexStart({ sessionId, prompt: "x", operation: "codex" }),
    /No verified Claude session settings/,
  );
  // Session start advertises the model-directed contract but launches nothing.
  const advice = await m.dispatch("codex.hook", {
    sessionId,
    event: "SessionStart",
    cwd: repo,
    permissionMode: "auto",
    model: "claude-opus-5-5",
    effort: "high",
  });
  assert.match(advice.additionalContext, /"executor":"codex"/);
  const started = await m.codexStart({
    sessionId,
    prompt: "Implement the thing",
    operation: "codex",
  });
  assert.equal(started.executor, "codex");
  assert.equal(started.permissions, "workspace-write");
  assert.deepEqual(started.selection, { model: "gpt-5.6-sol", effort: "high" });
  let r;
  for (let i = 0; i < 100; i++) {
    r = await m.wait(started.id, 1);
    if (r.terminal) break;
  }
  assert.equal(r.state, "completed");
  assert.deepEqual(r.result.evidence, ["ok"]);
  assert.equal(r.codexSession, "0199aaaa-bbbb-7ccc-8ddd-eeeeffff0000");
  const argv = (await readFile(join(root, "argv"), "utf8")).trim().split("\n");
  assert.deepEqual(argv.slice(0, 3), ["exec", "--json", "--skip-git-repo-check"]);
  assert.equal(argv.at(-1), "-");
  assert.match(await readFile(join(root, "stdin"), "utf8"), /Implement the thing$/);
  assert.match(await readFile(join(root, "env"), "utf8"), /^FACTORY_DELEGATED=1$/m);
  const task = await taskRead(claudeTaskId(sessionId));
  assert.equal(Object.values(task.codexSessions)[0], "0199aaaa-bbbb-7ccc-8ddd-eeeeffff0000");
  // The next handoff resumes the saved Codex session rather than starting fresh.
  const again = await m.codexStart({ sessionId, prompt: "Next step", operation: "codex" });
  for (let i = 0; i < 100; i++) if ((r = await m.wait(again.id, 1)).terminal) break;
  const resumed = (await readFile(join(root, "argv"), "utf8")).trim().split("\n");
  assert.deepEqual(resumed.slice(0, 2), ["exec", "resume"]);
  assert.equal(resumed.at(-2), "0199aaaa-bbbb-7ccc-8ddd-eeeeffff0000");
});

test("one Claude session runs Codex concurrently only in different worktrees", async (t) => {
  const root = await isolatedHome(t);
  const repo = await linkedCheckout(root, "repo");
  const other = join(root, "other");
  const third = join(root, "third");
  execFileSync("git", ["-C", repo, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", repo, "config", "user.name", "Test"]);
  await writeFile(join(repo, "README.md"), "test\n");
  execFileSync("git", ["-C", repo, "add", "README.md"]);
  execFileSync("git", ["-C", repo, "commit", "-qm", "fixture"]);
  execFileSync("git", ["-C", repo, "worktree", "add", "-q", "-b", "other", other]);
  execFileSync("git", ["-C", repo, "worktree", "add", "-q", "-b", "third", third]);
  const restore = await fakeCodex(
    root,
    '#!/bin/sh\necho "Logged in using ChatGPT"\n',
  );
  t.after(restore);
  await configWrite({ ...defaults(), mode: "manual", maxConcurrent: 2 });
  const sessionId = "33b6dd27-13a6-4c5e-8d5c-1b9a4bb261f3";
  const m = new Manager();
  m.launch = async (record) => {
    m.runs.set(record.id, {
      ...record,
      lastLease: 0,
      progress: "",
      sequence: 0,
    });
  };
  m.begin = (id) => m.public(m.runs.get(id));
  await m.dispatch("codex.hook", {
    sessionId,
    event: "UserPromptSubmit",
    cwd: repo,
    permissionMode: "auto",
  });

  const first = await m.codexStart({
    sessionId,
    prompt: "first",
    operation: "codex",
  });
  assert.equal((await m.dispatch("codex.status", { sessionId })).id, first.id);
  await assert.rejects(
    m.codexStart({ sessionId, cwd: repo, prompt: "collision", operation: "codex" }),
    new RegExp(`Run ${first.id} already owns this working directory`),
  );

  const second = await m.codexStart({
    sessionId,
    cwd: other,
    prompt: "second",
    operation: "codex",
    fresh: true,
  });
  assert.equal((await taskRead(claudeTaskId(sessionId))).primaryCwd, await realpath(repo));
  const inspected = await m.claudeInspect(sessionId);
  assert.deepEqual(
    new Set(inspected.runs.active.map((run) => run.id)),
    new Set([first.id, second.id]),
  );
  await assert.rejects(
    m.dispatch("codex.status", { sessionId }),
    (error) =>
      /runId is required/.test(error.message) &&
      error.message.includes(first.id) &&
      error.message.includes(second.id),
  );
  await m.dispatch("codex.wait", {
    sessionId,
    runId: first.id,
    seconds: 0,
  });
  assert.ok(m.runs.get(first.id).lastLease > 0);
  assert.equal(m.runs.get(second.id).lastLease, 0);
  await assert.rejects(
    m.codexStart({ sessionId, cwd: third, prompt: "third", operation: "codex", fresh: true }),
    /Delegation concurrency limit reached/,
  );

  Object.assign(m.runs.get(second.id), {
    terminal: true,
    state: "needs_input",
    codexSession: "0199aaaa-bbbb-7ccc-8ddd-eeeeffff0002",
  });
  const after = await m.claudeInspect(sessionId);
  assert.deepEqual(after.runs.active.map((run) => run.id), [first.id]);
  assert.deepEqual(after.runs.recent.map((run) => run.id), [second.id]);
  const resumed = await m.codexStart({
    sessionId,
    prompt: "answer",
    replySource: "user",
    replyReason: "User answered",
    operation: "codex",
  });
  assert.equal(resumed.cwd, await realpath(other));
  assert.equal(resumed.codexSession, "0199aaaa-bbbb-7ccc-8ddd-eeeeffff0002");
  assert.equal(resumed.taskId, second.taskId);
  assert.notEqual(resumed.id, second.id);
  assert.equal(resumed.fresh, true);
  assert.equal((await taskRead(claudeTaskId(sessionId))).primaryCwd, await realpath(repo));

  Object.assign(m.runs.get(first.id), {
    terminal: true,
    state: "needs_input",
  });
  Object.assign(m.runs.get(second.id), { state: "completed" });
  Object.assign(m.runs.get(resumed.id), {
    terminal: true,
    state: "needs_input",
  });
  await assert.rejects(
    m.codexStart({
      sessionId,
      prompt: "ambiguous",
      replySource: "user",
      replyReason: "User answered",
      operation: "codex",
    }),
    (error) =>
      /multiple runs are awaiting input/.test(error.message) &&
      error.message.includes(first.id) &&
      error.message.includes(resumed.id),
  );
  Object.assign(m.runs.get(first.id), { state: "completed" });
  Object.assign(m.runs.get(resumed.id), { state: "completed" });
  await assert.rejects(
    m.codexStart({
      sessionId,
      prompt: "late answer",
      replySource: "user",
      replyReason: "User answered",
      operation: "codex",
    }),
    /no run is awaiting input/,
  );
});

test("concurrent Codex session discoveries both persist", async (t) => {
  await isolatedHome(t);
  const taskId = claudeTaskId("44b6dd27-13a6-4c5e-8d5c-1b9a4bb261f3");
  const task = await taskRead(taskId);
  task.codexSessions = {};
  await taskWrite(task);
  const m = new Manager();
  const ids = [
    "10000000-0000-0000-0000-000000000001",
    "10000000-0000-0000-0000-000000000002",
  ];
  const runs = ids.map((id, index) => ({
    id,
    executor: "codex",
    codexSession: null,
    threadId: taskId,
    cwd: `/worktree-${index + 1}`,
    createdAt: index,
    state: "starting",
    terminal: false,
    sequence: 0,
    progress: "",
  }));
  await Promise.all(ids.map((id) => mkdir(runDir(id))));
  await Promise.all(
    runs.map((run, index) =>
      m.codexEvent(run, {
        type: "thread.started",
        thread_id: `20000000-0000-0000-0000-00000000000${index + 1}`,
      }),
    ),
  );
  assert.deepEqual((await taskRead(taskId)).codexSessions, {
    "primary:/worktree-1": "20000000-0000-0000-0000-000000000001",
    "primary:/worktree-2": "20000000-0000-0000-0000-000000000002",
  });
});

test("a worker binding is committed only after launch and then rejects provider changes", async (t) => {
  const root = await isolatedHome(t);
  const repo = await linkedCheckout(root, "repo");
  const bin = join(root, "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(
    join(bin, "claude"),
    '#!/bin/sh\nprintf \'%s\\n\' \'{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"max"}\'\n',
  );
  await chmod(join(bin, "claude"), 0o755);
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}:${oldPath}`;
  t.after(() => { process.env.PATH = oldPath; });
  await configWrite({ ...defaults(), mode: "manual" });

  const snapshot = {
    cwd: repo,
    model: "gpt-6-astra",
    reasoningEffort: "high",
    sandbox: { type: "dangerFullAccess" },
    approvalPolicy: "never",
  };
  const failedRoot = "binding-preflight-failure";
  const failed = new Manager();
  t.after(() => failed.viewer.close());
  failed.snapshot = async () => snapshot;
  failed.launch = async () => { throw new Error("fixture launch failed"); };
  await assert.rejects(
    failed.start({ threadId: failedRoot, prompt: "fail before commit" }),
    /fixture launch failed/,
  );
  assert.equal((await taskRead(failedRoot)).workerBinding, undefined);

  const rootId = "binding-success";
  const m = new Manager();
  t.after(() => m.viewer.close());
  m.snapshot = async () => snapshot;
  m.launch = async (record) => {
    m.runs.set(record.id, { ...record, lastLease: 0, sequence: 0, progress: "" });
  };
  m.begin = (id) => m.public(m.runs.get(id));
  const started = await m.start({ threadId: rootId, prompt: "commit binding" });
  assert.equal(started.executor, "claude");
  assert.deepEqual((await taskRead(rootId)).workerBinding, {
    executor: "claude",
    gateway: null,
  });
  await assert.rejects(
    m.start({ threadId: rootId, prompt: "switch", operation: "codex" }),
    /already pinned to native claude/,
  );
});

test("Codex-root fresh runs require a binding, persist together, and resume their own question", async (t) => {
  const root = await isolatedHome(t);
  const repo = await linkedCheckout(root, "repo");
  const other = join(root, "other");
  execFileSync("git", ["-C", repo, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", repo, "config", "user.name", "Test"]);
  await writeFile(join(repo, "README.md"), "test\n");
  execFileSync("git", ["-C", repo, "add", "README.md"]);
  execFileSync("git", ["-C", repo, "commit", "-qm", "fixture"]);
  execFileSync("git", ["-C", repo, "worktree", "add", "-q", "-b", "other", other]);
  const bin = join(root, "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(
    join(bin, "claude"),
    '#!/bin/sh\nprintf \'%s\\n\' \'{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"max"}\'\n',
  );
  await chmod(join(bin, "claude"), 0o755);
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}:${oldPath}`;
  t.after(() => { process.env.PATH = oldPath; });
  await configWrite({ ...defaults(), mode: "manual", maxConcurrent: 2 });
  const threadId = "codex-fresh-root";
  const m = new Manager();
  t.after(() => m.viewer.close());
  m.snapshot = async () => ({
    cwd: repo,
    model: "gpt-6-astra",
    reasoningEffort: "high",
    sandbox: { type: "dangerFullAccess" },
    approvalPolicy: "never",
  });
  m.launch = async (record) => {
    const live = { ...record, state: "running", lastLease: 0, sequence: 0, progress: "" };
    m.runs.set(record.id, live);
    await mkdir(runDir(record.id), { recursive: true });
    await atomic(join(runDir(record.id), "run.json"), m.public(live));
  };
  m.begin = (id) => m.public(m.runs.get(id));

  await assert.rejects(
    m.start({ threadId, cwd: other, prompt: "too early", fresh: true }),
    /fresh worker requires an established primary worker binding/i,
  );
  const primary = await m.start({ threadId, prompt: "primary" });
  const fresh = await m.start({ threadId, cwd: other, prompt: "isolated", fresh: true });
  const stored = await taskRead(threadId);
  assert.deepEqual(new Set(stored.runIds), new Set([primary.id, fresh.id]));

  // A restarted bridge discovers and guards both writers from persisted task/run records.
  const restarted = new Manager();
  t.after(() => restarted.viewer.close());
  const active = await restarted.taskRuns(await taskRead(threadId));
  assert.deepEqual(new Set(active.active.map((run) => run.id)), new Set([primary.id, fresh.id]));
  for (const [cwd, file] of [[repo, "README.md"], [other, "README.md"]]) {
    const guarded = await restarted.guard(threadId, {
      cwd,
      tool: "apply_patch",
      toolInput: `*** Begin Patch\n*** Update File: ${join(cwd, file)}\n*** End Patch`,
    });
    assert.match(guarded.deny, /Factory run/);
  }

  Object.assign(m.runs.get(primary.id), { terminal: true, state: "completed" });
  await atomic(join(runDir(primary.id), "run.json"), m.public(m.runs.get(primary.id)));
  Object.assign(m.runs.get(fresh.id), {
    terminal: true,
    state: "needs_input",
    claudeSession: "fresh-claude-session",
  });
  await atomic(join(runDir(fresh.id), "run.json"), m.public(m.runs.get(fresh.id)));
  const resumed = await m.start({
    threadId,
    runId: fresh.id,
    prompt: "answer",
    replySource: "user",
    replyReason: "User answered",
  });
  assert.equal(resumed.fresh, true);
  assert.equal(resumed.cwd, await realpath(other));
  assert.equal(resumed.claudeSession, "fresh-claude-session");
  assert.equal(resumed.taskId, fresh.taskId);
  assert.notEqual(resumed.id, fresh.id);
  assert.equal((await taskRead(threadId)).primaryCwd, await realpath(repo));

  Object.assign(m.runs.get(resumed.id), { terminal: true, state: "completed" });
  await atomic(join(runDir(resumed.id), "run.json"), m.public(m.runs.get(resumed.id)));
  const historical = await m.factoryRun({ rootKind: "codex", rootId: threadId, runId: fresh.id });
  assert.equal(historical.state, "needs_input");
  assert.equal(historical.task.status.state, "TASK_STATE_COMPLETED");
  await assert.rejects(m.start({
    threadId, runId: fresh.id, prompt: "late duplicate answer",
    replySource: "user", replyReason: "Previously answered",
  }), /superseded Factory attempt/);
  const withPrimarySession = await taskRead(threadId);
  withPrimarySession.sessions = { [`primary:${await realpath(repo)}`]: "primary-claude-session" };
  await taskWrite(withPrimarySession);
  const backToPrimary = await m.start({ threadId, prompt: "ordinary next step" });
  assert.equal(backToPrimary.fresh, false);
  assert.equal(backToPrimary.cwd, await realpath(repo));
  assert.equal(backToPrimary.claudeSession, "primary-claude-session");
});

test("provider-neutral run controls reject a run owned by another root", async (t) => {
  await isolatedHome(t);
  const runId = "50000000-0000-4000-8000-000000000001";
  await mkdir(runDir(runId), { recursive: true });
  await atomic(join(runDir(runId), "run.json"), {
    id: runId,
    threadId: "root-a",
    cwd: "/repo",
    state: "completed",
    terminal: true,
    createdAt: 1,
  });
  const m = new Manager();
  t.after(() => m.viewer.close());
  for (const method of ["factoryRun", "factoryWait", "factoryStop"]) {
    await assert.rejects(
      m[method]({ rootKind: "codex", rootId: "root-b", runId, seconds: 0 }),
      /belongs to another root session/,
    );
  }
});

test("Claude task history retains active, recent terminal and recent missing runs", async (t) => {
  const root = await isolatedHome(t);
  const repo = join(root, "repo");
  await mkdir(repo);
  const sessionId = "55b6dd27-13a6-4c5e-8d5c-1b9a4bb261f3";
  const m = new Manager();
  await m.codexHook({
    sessionId,
    event: "UserPromptSubmit",
    cwd: repo,
    permissionMode: "plan",
  });
  const taskId = claudeTaskId(sessionId);
  const terminalIds = Array.from(
    { length: 7 },
    (_, index) => `30000000-0000-0000-0000-00000000000${index + 1}`,
  );
  for (const [index, id] of terminalIds.entries()) {
    await mkdir(runDir(id));
    await atomic(join(runDir(id), "run.json"), {
      id,
      threadId: taskId,
      cwd: repo,
      createdAt: index + 1,
      state: "completed",
      terminal: true,
    });
  }
  const activeId = "30000000-0000-0000-0000-000000000100";
  m.runs.set(activeId, {
    id: activeId,
    executor: "codex",
    threadId: taskId,
    cwd: repo,
    createdAt: 100,
    state: "running",
    terminal: false,
    sequence: 0,
    progress: "",
  });
  const task = await taskRead(taskId);
  const missingId = "30000000-0000-0000-0000-000000000999";
  task.runId = missingId;
  task.runIds = [...terminalIds, missingId];
  await taskWrite(task);

  const inspected = await m.claudeInspect(sessionId);
  const recent = terminalIds.slice(-5).reverse();
  assert.deepEqual(inspected.runs.active.map((run) => run.id), [activeId]);
  assert.deepEqual(inspected.runs.recent.map((run) => run.id), recent);
  const stored = await taskRead(taskId);
  assert.deepEqual(stored.runIds, [activeId, ...recent, missingId]);
  assert.equal(stored.runId, activeId);
});

test("inspection pruning cannot overwrite a concurrently persisted active run", async (t) => {
  const root = await isolatedHome(t);
  const repo = join(root, "repo");
  await mkdir(repo);
  const sessionId = "66b6dd27-13a6-4c5e-8d5c-1b9a4bb261f3";
  const taskId = claudeTaskId(sessionId);
  const m = new Manager();
  await m.codexHook({
    sessionId,
    event: "UserPromptSubmit",
    cwd: repo,
    permissionMode: "plan",
  });
  const terminalId = "40000000-0000-0000-0000-000000000001";
  await mkdir(runDir(terminalId));
  await atomic(join(runDir(terminalId), "run.json"), {
    id: terminalId,
    threadId: taskId,
    cwd: repo,
    createdAt: 1,
    state: "completed",
    terminal: true,
  });
  const task = await taskRead(taskId);
  task.runId = terminalId;
  task.runIds = [terminalId];
  await taskWrite(task);

  let snapshotTaken;
  const snapshot = new Promise((resolve) => {
    snapshotTaken = resolve;
  });
  let releaseSnapshot;
  const release = new Promise((resolve) => {
    releaseSnapshot = resolve;
  });
  const taskRuns = m.taskRuns.bind(m);
  let pause = true;
  m.taskRuns = async (...args) => {
    const value = await taskRuns(...args);
    if (pause) {
      pause = false;
      snapshotTaken();
      await release;
    }
    return value;
  };

  const inspecting = m.claudeInspect(sessionId);
  await snapshot;
  const activeId = "40000000-0000-0000-0000-000000000002";
  m.runs.set(activeId, {
    id: activeId,
    executor: "codex",
    threadId: taskId,
    cwd: repo,
    createdAt: 2,
    state: "running",
    terminal: false,
    sequence: 0,
    progress: "",
  });
  // codexStart uses this same queued mutation after launching the new run.
  const starting = m.mutateTask(taskId, (current) => {
    current.runId = activeId;
    current.runIds = [...new Set([...(current.runIds ?? []), activeId])];
  });
  releaseSnapshot();
  await Promise.all([inspecting, starting]);

  const stored = await taskRead(taskId);
  assert.deepEqual(stored.runIds, [terminalId, activeId]);
  assert.equal(stored.runId, activeId);
});

test("a needs_input result resumes only with an attributed reply", async (t) => {
  const root = await isolatedHome(t);
  const repo = await linkedCheckout(root, "repo");
  const restore = await fakeCodex(
    root,
    `#!/bin/sh
if [ "$1" = login ]; then echo "Logged in using ChatGPT"; exit 0; fi
cat > /dev/null
echo '{"type":"thread.started","thread_id":"0199aaaa-bbbb-7ccc-8ddd-eeeeffff0001"}'
echo '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"outcome\\":\\"needs_input\\",\\"summary\\":\\"which?\\",\\"evidence\\":[],\\"question\\":\\"Blue or red?\\"}"}}'
echo '{"type":"turn.completed","usage":{}}'
`,
  );
  t.after(restore);
  const sessionId = "22b6dd27-13a6-4c5e-8d5c-1b9a4bb261f3";
  await configWrite({ ...defaults(), mode: "automatic", maxSupervisionReplies: 0 });
  const m = new Manager();
  await m.dispatch("codex.hook", { sessionId, event: "UserPromptSubmit", cwd: repo, permissionMode: "plan" });
  const first = await m.codexStart({ sessionId, prompt: "Paint it", operation: "codex" });
  assert.equal(first.permissions, "read-only");
  let r;
  for (let i = 0; i < 100; i++) if ((r = await m.wait(first.id, 1)).terminal) break;
  assert.equal(r.state, "needs_input");
  await assert.rejects(m.codexStart({ sessionId, prompt: "Blue", operation: "codex" }), /replySource/);
  await assert.rejects(
    m.codexStart({ sessionId, prompt: "Blue", replySource: "claude", replyReason: "default", operation: "codex" }),
    /Supervision limit/,
  );
  await assert.rejects(
    m.answer({ runId: first.id, questionId: "q", source: "user", reason: "x" }),
    /No live question/,
  );
  const second = await m.codexStart({
    sessionId,
    prompt: "Blue",
    replySource: "user",
    replyReason: "User chose blue",
    operation: "codex",
  });
  for (let i = 0; i < 100; i++) if ((r = await m.wait(second.id, 1)).terminal) break;
  assert.equal(r.replySource, "user");
});

test("session model and permission mode come from validated transcript fields", async (t) => {
  const root = await isolatedHome(t);
  const path = join(root, "session.jsonl");
  assert.equal(await transcriptModel(path), null);
  const line = (v) => JSON.stringify(v) + "\n";
  await writeFile(
    path,
    line({ type: "user", message: { role: "user", content: "hi" } }) +
      line({ type: "permissionMode", permissionMode: "plan" }) +
      line({ type: "assistant", message: { model: "claude-haiku-4-5-20251001" } }) +
      line({ type: "user", message: { content: "permissionMode: bypassPermissions" } }) +
      line({ type: "permissionMode", permissionMode: "bypassPermissions" }) +
      line({ type: "assistant", message: { model: "claude-opus-5-5" } }) +
      line({ type: "assistant", message: { model: "<synthetic>" } }) +
      "{not json\n",
  );
  assert.equal(await transcriptModel(path), "claude-opus-5-5");
  assert.equal(await transcriptPermissionMode(path), "bypassPermissions");
  assert.equal(await transcriptModel(join(root, "notes.md")), null);
  assert.equal(await transcriptPermissionMode(join(root, "notes.md")), null);
  assert.equal(codexSelection(defaults(), { model: await transcriptModel(path) }).model, "gpt-5.6-sol");
});
