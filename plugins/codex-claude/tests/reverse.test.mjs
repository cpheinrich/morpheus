import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, chmod, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  defaults,
  route,
  claudeRemaining,
  codexSelection,
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
} from "../src/claude-usage.mjs";
import { initStore, configWrite, taskRead } from "../src/store.mjs";
import { Manager, claudeTaskId } from "../src/service.mjs";

async function isolatedHome(t) {
  const root = await mkdtemp(join(tmpdir(), "reverse-"));
  const previous = process.env.CODEX_CLAUDE_HOME;
  process.env.CODEX_CLAUDE_HOME = join(root, "home");
  t.after(async () => {
    if (previous === undefined) delete process.env.CODEX_CLAUDE_HOME;
    else process.env.CODEX_CLAUDE_HOME = previous;
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
  assert.equal(c.threshold, 50);
  assert.equal(route(c, task, 50, undefined, "claude").executor, "claude");
  assert.equal(route(c, task, 49.99, undefined, "claude").executor, "codex");
  assert.match(route(c, task, 40, undefined, "claude").reason, /^Claude 40% remaining/);
  assert.equal(route(c, task, null, undefined, "claude").executor, "unknown");
  assert.equal(route(c, task, 90, "codex", "claude").executor, "codex");
  assert.equal(route(c, { ...task, override: "claude" }, 1, undefined, "claude").executor, "claude");
  assert.equal(route({ ...c, mode: "manual" }, task, 1, undefined, "claude").executor, "claude");
  assert.equal(route({ ...c, mode: "off" }, task, 1, "codex", "claude").executor, "claude");
  assert.equal(route(c, { ...task, disabled: true }, 1, "codex", "claude").executor, "claude");
});

test("Claude permission modes never widen into Codex", () => {
  assert.deepEqual(codexPermission("bypassPermissions").args, [
    "--dangerously-bypass-approvals-and-sandbox",
  ]);
  for (const mode of ["default", "acceptEdits", "auto"]) {
    const p = codexPermission(mode);
    assert.equal(p.name, "workspace-write");
    assert.deepEqual(p.args, ["-c", 'sandbox_mode="workspace-write"', "-c", 'approval_policy="never"']);
  }
  assert.equal(codexPermission("plan").name, "read-only");
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
  assert.throws(() => codexSelection(c, {}, { model: "o3-pro" }), /approved Codex model/);
  assert.throws(() => codexSelection(c, {}, { effort: "ultra" }), /effort/);
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
    { PATH: "bin", HOME: "/h", CODEX_CLAUDE_DELEGATED: "1" },
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
  const repo = join(root, "repo");
  await mkdir(repo);
  execFileSync("git", ["init", "-q", repo]);
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
  // Manual mode advises staying in Claude, and does not start Codex unasked.
  const advice = await m.dispatch("codex.hook", {
    sessionId,
    event: "SessionStart",
    cwd: repo,
    permissionMode: "auto",
    model: "claude-opus-5-5",
    effort: "high",
  });
  assert.match(advice.additionalContext, /"executor":"claude"/);
  await assert.rejects(m.codexStart({ sessionId, prompt: "x" }), /Manual delegation only/);
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
  assert.match(await readFile(join(root, "env"), "utf8"), /^CODEX_CLAUDE_DELEGATED=1$/m);
  const task = await taskRead(claudeTaskId(sessionId));
  assert.equal(Object.values(task.codexSessions)[0], "0199aaaa-bbbb-7ccc-8ddd-eeeeffff0000");
  // The next handoff resumes the saved Codex session rather than starting fresh.
  const again = await m.codexStart({ sessionId, prompt: "Next step", operation: "codex" });
  for (let i = 0; i < 100; i++) if ((r = await m.wait(again.id, 1)).terminal) break;
  const resumed = (await readFile(join(root, "argv"), "utf8")).trim().split("\n");
  assert.deepEqual(resumed.slice(0, 2), ["exec", "resume"]);
  assert.equal(resumed.at(-2), "0199aaaa-bbbb-7ccc-8ddd-eeeeffff0000");
});

test("a needs_input result resumes only with an attributed reply", async (t) => {
  const root = await isolatedHome(t);
  const repo = join(root, "repo");
  await mkdir(repo);
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
  await recordClaudeUsage({
    rate_limits: { five_hour: { used_percentage: 51, resets_at: Date.now() / 1000 + 3600 } },
  });
  const inspected = await m.claudeInspect(sessionId);
  assert.equal(inspected.allowance, 49);
  assert.equal(inspected.route.executor, "codex");
  const first = await m.codexStart({ sessionId, prompt: "Paint it" });
  assert.equal(first.permissions, "read-only");
  let r;
  for (let i = 0; i < 100; i++) if ((r = await m.wait(first.id, 1)).terminal) break;
  assert.equal(r.state, "needs_input");
  await assert.rejects(m.codexStart({ sessionId, prompt: "Blue" }), /replySource/);
  await assert.rejects(
    m.codexStart({ sessionId, prompt: "Blue", replySource: "claude", replyReason: "default" }),
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
  });
  for (let i = 0; i < 100; i++) if ((r = await m.wait(second.id, 1)).terminal) break;
  assert.equal(r.replySource, "user");
});

test("session model comes from the latest assistant reply in the transcript", async (t) => {
  const root = await isolatedHome(t);
  const path = join(root, "session.jsonl");
  assert.equal(await transcriptModel(path), null);
  const line = (v) => JSON.stringify(v) + "\n";
  await writeFile(
    path,
    line({ type: "user", message: { role: "user", content: "hi" } }) +
      line({ type: "assistant", message: { model: "claude-haiku-4-5-20251001" } }) +
      line({ type: "assistant", message: { model: "claude-opus-5-5" } }) +
      line({ type: "assistant", message: { model: "<synthetic>" } }) +
      "{not json\n",
  );
  assert.equal(await transcriptModel(path), "claude-opus-5-5");
  assert.equal(await transcriptModel(join(root, "notes.md")), null);
  assert.equal(codexSelection(defaults(), { model: await transcriptModel(path) }).model, "gpt-5.6-sol");
});
