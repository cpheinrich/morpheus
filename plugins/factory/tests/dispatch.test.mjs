// Automatic dispatch: a UserPromptSubmit in automatic mode launches the routed worker, and the
// coordinating session stays its manager. These run the real guardian with a fake Claude
// worker behind a local sub2api stub; the last two drive the installed hook scripts through a
// separate bridge process, for a Claude coordinator and a Codex one.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm, writeFile, chmod, readFile, mkdir, readdir, realpath, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { WebSocketServer } from "ws";
import { defaults } from "../src/config.mjs";
import { initStore, configWrite, configRead } from "../src/store.mjs";
import { Manager, claudeTaskId } from "../src/service.mjs";
import { useRunning } from "../src/client.mjs";
import { claudeTurnKey, codexTurnKey, dispatchHandoff, editTargets } from "../src/dispatch.mjs";

// Records each launch under launches/<pid>; `mode` picks completed, needs_input or a long run.
const FAKE_CLAUDE = `#!/bin/sh
dir="__ROOT__/launches/$$"
mkdir -p "$dir"
printf '%s\\n' "$@" > "$dir/argv"
env > "$dir/env"
IFS= read -r first; printf '%s' "$first" > "$dir/stdin"
echo '{"type":"system","subtype":"init","session_id":"sess-worker-1"}'
mode=$(cat "__ROOT__/mode" 2>/dev/null)
if [ "$mode" = sleep ]; then sleep 60; exit 0; fi
if [ "$mode" = needs ]; then
  echo '{"type":"result","subtype":"success","is_error":false,"result":"q","structured_output":{"outcome":"needs_input","summary":"Which colour should the fence be?","evidence":[],"question":"Which colour should the fence be?"},"session_id":"sess-worker-1"}'
  exit 0
fi
echo '{"type":"result","subtype":"success","is_error":false,"result":"done","structured_output":{"outcome":"completed","summary":"Painted the fence","evidence":["ok"]},"session_id":"sess-worker-1"}'
`;

async function harness(t, { usage = 0.02 } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "fx-")));
  const quota = { usage };
  // sub2api's admin API, as the bridge reads it, from this process or a spawned service.
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (quota.fail) {
      res.statusCode = 500;
      return res.end("{}");
    }
    if (req.url === "/api/v1/auth/login") return res.end(JSON.stringify({ data: { access_token: "t" } }));
    if (req.url === "/api/v1/admin/accounts")
      return res.end(
        JSON.stringify({
          data: { items: [{ platform: "anthropic", extra: { session_window_utilization: quota.usage } }] },
        }),
      );
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const saved = {};
  for (const key of ["FACTORY_HOME", "PATH", "GW_KEY", "GW_ADMIN_EMAIL", "GW_ADMIN_PASSWORD", "FACTORY_DELEGATED"])
    saved[key] = process.env[key];
  // Cleanup that needs the home and environment (a spawned bridge) runs first.
  const first = [];
  t.after(async () => {
    for (const step of first) await step();
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    server.close();
    await rm(root, { recursive: true, force: true });
  });
  process.env.FACTORY_HOME = join(root, "home");
  process.env.GW_KEY = "sk-gateway-test";
  process.env.GW_ADMIN_EMAIL = "admin@gw.test";
  process.env.GW_ADMIN_PASSWORD = "pw";
  delete process.env.FACTORY_DELEGATED;
  const bin = join(root, "bin");
  await mkdir(bin);
  await mkdir(join(root, "launches"));
  await writeFile(join(bin, "claude"), FAKE_CLAUDE.replaceAll("__ROOT__", root));
  await chmod(join(bin, "claude"), 0o755);
  process.env.PATH = `${bin}:${saved.PATH}`;
  await initStore();
  const repo = async (name) => {
    const dir = join(root, name);
    await mkdir(dir);
    execFileSync("git", ["init", "-q", dir]);
    return realpath(dir);
  };
  await configWrite({
    ...defaults(),
    mode: "automatic",
    gateways: [{ name: "pool", provider: "claude", baseUrl: base, keyRef: "env:GW_KEY" }],
    admin: { emailRef: "env:GW_ADMIN_EMAIL", passwordRef: "env:GW_ADMIN_PASSWORD" },
  });
  const mode = (value) => writeFile(join(root, "mode"), value);
  const launches = async () => {
    const ids = await readdir(join(root, "launches"));
    return Promise.all(
      ids.map(async (id) => ({
        stdin: await readFile(join(root, "launches", id, "stdin"), "utf8").catch(() => ""),
        argv: (await readFile(join(root, "launches", id, "argv"), "utf8").catch(() => "")).split("\n"),
        env: await readFile(join(root, "launches", id, "env"), "utf8").catch(() => ""),
      })),
    );
  };
  return { root, base, quota, repo, mode, launches, first };
}

function manager(t) {
  const m = new Manager();
  t.after(async () => {
    for (const run of m.runs.values()) if (!run.terminal) await m.cancel(run.id);
    for (const run of [...m.runs.values()]) await settle(m, run.id);
    m.viewer.close();
  });
  return m;
}

async function settle(m, id, until = (r) => r.terminal) {
  let r;
  for (let i = 0; i < 150; i++) {
    r = await m.wait(id, 1);
    if (until(r)) return r;
  }
  return r;
}

const SESSION = "aa11bb22-cc33-4dd4-8ee5-ff6677889900";
const claudePrompt = (m, cwd, prompt, turnKey, sessionId = SESSION) =>
  m.dispatch("codex.hook", {
    sessionId,
    event: "UserPromptSubmit",
    cwd,
    permissionMode: "acceptEdits",
    model: "claude-opus-5-5",
    effort: "high",
    prompt,
    turnKey,
  });
const runIdOf = (result) => result.systemMessage.match(/run ([0-9a-f-]{36})/)?.[1];

test("a Claude session's turn is dispatched once, with only the prompt and the last result", async (t) => {
  const h = await harness(t);
  const repo = await h.repo("repo");
  const m = manager(t);
  const start = await m.dispatch("codex.hook", { sessionId: SESSION, event: "SessionStart", cwd: repo, permissionMode: "acceptEdits" });
  assert.match(start.systemMessage, /^Factory automatic dispatch is on \(experimental\): new turns go to a claude worker session through the "pool" gateway credential/);
  // A retried or duplicated hook of one turn, even concurrently, launches one worker.
  const [first, again] = await Promise.all([
    claudePrompt(m, repo, "Paint the fence", "claude:turn-1"),
    claudePrompt(m, repo, "Paint the fence", "claude:turn-1"),
  ]);
  const id = runIdOf(first);
  assert.ok(id, first.systemMessage);
  assert.equal(
    first.systemMessage,
    `Using Factory to delegate this turn to a claude worker session (run ${id}) through the "pool" gateway credential; this session manages it.`,
  );
  assert.deepEqual(again, first);
  // The first reply of the session announces it, and the manager is told how to supervise.
  assert.match(first.additionalContext, /first reply in a session where Factory automatic dispatch is on: open it with one short sentence telling the user this: Using Factory to delegate/);
  assert.match(first.additionalContext, new RegExp(`Call codex_wait with runId ${id}`));
  assert.match(first.additionalContext, /permission, approval, spending, sending or material product question goes to the user/);
  const done = await settle(m, id);
  assert.equal(done.state, "completed");
  assert.equal(done.gateway, "pool");
  assert.equal(done.permissions, "acceptEdits");
  const retried = await claudePrompt(m, repo, "Paint the fence", "claude:turn-1");
  assert.equal(runIdOf(retried), id);
  let launched = await h.launches();
  assert.equal(launched.length, 1);
  const handoff = launched[0].stdin;
  assert.match(handoff, /Automatic Factory dispatch of one user turn/);
  assert.match(handoff, /User prompt \(verbatim\):\\nPaint the fence/);
  // Nothing from the coordinator's own context: no routing advice, no previous result yet.
  assert.doesNotMatch(handoff, /Factory delegation routing|Previous Factory result/);
  assert.match(launched[0].env, /^FACTORY_DELEGATED=1$/m);
  // The same words on a later turn are a new turn: a new run, no repeated notice, the last
  // result in the handoff and the worker's saved session for this checkout and route resumed.
  const later = await claudePrompt(m, repo, "Paint the fence", "claude:turn-2");
  const second = runIdOf(later);
  assert.ok(second && second !== id);
  assert.doesNotMatch(later.additionalContext, /first reply/);
  await settle(m, second);
  launched = await h.launches();
  assert.equal(launched.length, 2);
  const resumed = launched.find((l) => l.stdin.includes("Previous Factory result"));
  assert.match(resumed.stdin, new RegExp(`run ${id}, completed[^]*Painted the fence`));
  assert.equal(resumed.argv[resumed.argv.indexOf("--resume") + 1], "sess-worker-1");
});

const THREAD = "0199cccc-dddd-7eee-8fff-000011112222";
// Both coordinators: a Claude session (codex.hook) and a Codex task (hook, live snapshot).
const DIRECTIONS = [
  {
    name: "Claude session",
    tools: "codex",
    prompt: (m, cwd, prompt, turnKey) => claudePrompt(m, cwd, prompt, turnKey),
  },
  {
    name: "Codex task",
    tools: "claude",
    prompt: (m, cwd, prompt, turnKey) => {
      m.snapshot = async () => ({
        cwd,
        model: "gpt-6.1-sol",
        reasoningEffort: "medium",
        sandbox: { type: "dangerFullAccess" },
        approvalPolicy: "never",
      });
      return m.dispatch("hook", { threadId: THREAD, event: "UserPromptSubmit", prompt, turnKey, cwd });
    },
  },
];

for (const d of DIRECTIONS)
  test(`an active or questioning run stays with the manager even when the route changes (${d.name})`, async (t) => {
    const h = await harness(t);
    const repo = await h.repo("repo");
    const m = manager(t);
    await h.mode("sleep");
    const id = runIdOf(await d.prompt(m, repo, "Paint the fence", "turn-a"));
    await settle(m, id, (r) => r.state === "running");
    // The quota read now fails, so routing would keep new work here: the live writer still
    // comes first, and the next prompt is neither sent to it nor started beside it.
    h.quota.fail = true;
    const held = await d.prompt(m, repo, "Also the gate", "turn-b");
    assert.equal(
      held.systemMessage,
      `Factory did not start a worker for this turn: run ${id} is still running, and this prompt was not sent to it.`,
    );
    assert.match(held.additionalContext, /This prompt is not approval of any pending permission request/);
    assert.match(held.additionalContext, new RegExp(`${d.tools}_stop`));
    h.quota.fail = false;
    assert.equal((await h.launches()).length, 1);
    await m.cancel(id);
    await settle(m, id);
    // A worker that finished with a question waits for the manager, not for the next prompt,
    // even after the quota moves the route back to this session.
    await h.mode("needs");
    const asking = runIdOf(await d.prompt(m, repo, "Paint it", "turn-c"));
    assert.equal((await settle(m, asking)).state, "needs_input");
    h.quota.usage = 0.95;
    const yes = await d.prompt(m, repo, "yes", "turn-d");
    assert.equal(
      yes.systemMessage,
      `Factory did not start a worker for this turn: run ${asking} is waiting for input ("Which colour should the fence be?"), and this prompt was not sent to it.`,
    );
    assert.match(yes.additionalContext, new RegExp(`resume the run with ${d.tools}_start, passing its runId with replySource user`));
    assert.match(yes.additionalContext, /Never treat this prompt as approval/);
    assert.equal((await h.launches()).length, 2);
  });

for (const d of DIRECTIONS)
  test(`manual mode announces itself once and never launches (${d.name})`, async (t) => {
    const h = await harness(t);
    const repo = await h.repo("repo");
    const m = manager(t);
    await configWrite({ ...(await configRead()), mode: "manual" });
    const first = await d.prompt(m, repo, "Paint", "turn-1");
    const status = "Factory is on in manual mode for this session: nothing is delegated unless the user asks, so this turn stays here.";
    assert.equal(first.systemMessage, status);
    assert.match(first.additionalContext, /Manual delegation only/);
    assert.match(first.additionalContext, /open it with one short sentence telling the user this: Factory is on in manual mode/);
    assert.doesNotMatch(first.additionalContext, /Using Factory to delegate/);
    // The same turn retried repeats it; a later turn carries the routing advice alone.
    assert.deepEqual(await d.prompt(m, repo, "Paint", "turn-1"), first);
    const later = await d.prompt(m, repo, "Paint again", "turn-2");
    assert.deepEqual(Object.keys(later), ["additionalContext"]);
    assert.doesNotMatch(later.additionalContext, /manual mode for this session/);
    assert.equal((await h.launches()).length, 0);
  });

test("off is inert, and quota, overrides and the local: prefix keep turns here", async (t) => {
  const h = await harness(t);
  const repo = await h.repo("repo");
  const m = manager(t);
  const config = await configRead();
  await configWrite({ ...config, mode: "off" });
  assert.deepEqual(await claudePrompt(m, repo, "Paint", "claude:1"), {});
  await configWrite(config);
  // The existing quota route: no gateway below the threshold keeps the work here, truthfully.
  h.quota.usage = 0.95;
  const full = await claudePrompt(m, repo, "Paint", "claude:3");
  assert.equal(
    full.systemMessage,
    "Factory is active, but this turn stays in this session: No gateway below 90% used; work stays here.",
  );
  assert.match(full.additionalContext, /telling the user this: Factory is active, but this turn stays/);
  assert.doesNotMatch(full.additionalContext, /Using Factory to delegate/);
  h.quota.usage = 0.02;
  const local = await claudePrompt(m, repo, "  LOCAL: just answer here", "claude:4");
  assert.match(local.systemMessage, /stays in this session: the prompt starts with "local:"/);
  await m.dispatch("codex.override", { sessionId: SESSION, executor: "off" });
  const disabled = await claudePrompt(m, repo, "Paint", "claude:5");
  assert.match(disabled.systemMessage, /stays in this session: Delegation disabled\./);
  await m.dispatch("codex.override", { sessionId: SESSION, executor: "auto" });
  // A turn that cannot be identified is not dispatched, and is not a local fallback either.
  const unidentified = await claudePrompt(m, repo, "Paint", null);
  assert.equal(
    unidentified.systemMessage,
    "Factory did not start a worker for this turn: this turn has no readable identity, so it could not be dispatched without risking a duplicate worker.",
  );
  assert.match(unidentified.additionalContext, /do not do the work in this session instead/);
  assert.doesNotMatch(unidentified.additionalContext, /stays in this session|handle the turn in this session/);
  assert.equal((await h.launches()).length, 0);
});

test("a restart between launch and recording finds the run again and never launches twice", async (t) => {
  const h = await harness(t);
  const repo = await h.repo("repo");
  const crashed = manager(t);
  // The service dies after the worker launched and before the outcome was written.
  crashed.recordDispatch = async () => {
    throw new Error("service stopped");
  };
  await assert.rejects(claudePrompt(crashed, repo, "Paint the fence", "claude:r1"), /service stopped/);
  const [launchedRun] = [...crashed.runs.values()];
  assert.equal((await settle(crashed, launchedRun.id)).state, "completed");
  assert.equal((await h.launches()).length, 1);
  // The retried hook reaches a fresh service: it finds the completed run by its turn.
  const restarted = manager(t);
  const retried = await claudePrompt(restarted, repo, "Paint the fence", "claude:r1");
  assert.equal(runIdOf(retried), launchedRun.id);
  assert.match(retried.systemMessage, /^Using Factory to delegate this turn/);
  assert.equal((await h.launches()).length, 1);
  // Now recorded, a further retry answers from the record.
  assert.deepEqual(await claudePrompt(restarted, repo, "Paint the fence", "claude:r1"), retried);
  // A reservation the service never got past (it stopped before launching) is reported as
  // unknown, every time, and still launches nothing.
  await restarted.mutateTask(claudeTaskId(SESSION), (task) => {
    task.dispatches = { ...task.dispatches, "claude:r2": { at: Date.now() } };
  });
  for (let i = 0; i < 2; i++) {
    const unknown = await claudePrompt(restarted, repo, "Paint the gate", "claude:r2");
    assert.equal(
      unknown.systemMessage,
      "Factory did not start a worker for this turn: an earlier attempt to dispatch this turn stopped before recording its result, and no worker for it was found.",
    );
    assert.match(unknown.additionalContext, /Check codex_inspect for a worker already running this turn/);
  }
  assert.equal((await h.launches()).length, 1);
});

test("launch failures are explicit, and one credential serves several sessions up to host capacity", async (t) => {
  const h = await harness(t);
  const [a, b, c] = [await h.repo("a"), await h.repo("b"), await h.repo("c")];
  const m = manager(t);
  await h.mode("sleep");
  const sessions = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
  // Two independent sessions dispatch at once through the same gateway credential.
  const both = await Promise.all([
    claudePrompt(m, a, "Paint A", "claude:a", sessions[0]),
    claudePrompt(m, b, "Paint B", "claude:b", sessions[1]),
  ]);
  const ids = both.map(runIdOf);
  assert.ok(ids.every(Boolean), JSON.stringify(both));
  for (const id of ids) assert.equal((await settle(m, id, (r) => r.state === "running")).gateway, "pool");
  // Host capacity (maxConcurrent, default 2) is a separate limit, reported, not worked around.
  const third = await claudePrompt(m, c, "Paint C", "claude:c", sessions[2]);
  assert.equal(third.systemMessage, "Factory could not delegate this turn: Delegation concurrency limit reached.");
  assert.match(third.additionalContext, /do not quietly do the work here instead/);
  assert.match(third.additionalContext, /ask the user whether to fix the cause or handle the turn in this session/);
  // A checkout keeps one writer, whichever session asks.
  const same = await claudePrompt(m, a, "Paint A again", "claude:a2", sessions[2]);
  assert.match(same.systemMessage, new RegExp(`could not delegate this turn: Run ${ids[0]} already owns this working directory`));
  for (const id of ids) {
    await m.cancel(id);
    await settle(m, id);
  }
  // A preflight error is reported as a failure, never as a turn quietly kept here.
  delete process.env.GW_KEY;
  const failed = await claudePrompt(m, c, "Paint C", "claude:c2", sessions[2]);
  assert.match(failed.systemMessage, /^Factory could not delegate this turn: .*GW_KEY/);
  assert.equal((await h.launches()).length, 2);
});

test("a Codex task's turn is dispatched by turn id and managed by the Codex task", async (t) => {
  const h = await harness(t);
  const repo = await h.repo("repo");
  const m = manager(t);
  m.snapshot = async () => ({
    cwd: repo,
    model: "gpt-6.1-sol",
    reasoningEffort: "medium",
    sandbox: { type: "dangerFullAccess" },
    approvalPolicy: "never",
  });
  const threadId = "0199cccc-dddd-7eee-8fff-000011112222";
  const prompt = (turnKey) =>
    m.dispatch("hook", { threadId, event: "UserPromptSubmit", prompt: "Draw it", turnKey, cwd: repo });
  const first = await prompt(codexTurnKey("turn-1"));
  const id = runIdOf(first);
  assert.match(first.systemMessage, /^Using Factory to delegate this turn to a claude worker session .* through the "pool" gateway credential/);
  assert.match(first.additionalContext, new RegExp(`Call claude_wait with runId ${id}`));
  assert.match(first.additionalContext, /^Claude delegation routing:/);
  await settle(m, id);
  assert.equal(runIdOf(await prompt(codexTurnKey("turn-1"))), id);
  const next = runIdOf(await prompt(codexTurnKey("turn-2")));
  assert.ok(next && next !== id);
  await settle(m, next);
  assert.equal((await h.launches()).length, 2);
  // Interrupting the Codex turn stops the run it is managing.
  await h.mode("sleep");
  const third = runIdOf(await prompt(codexTurnKey("turn-3")));
  await m.dispatch("hook", { threadId, event: "Interrupt" });
  assert.equal((await settle(m, third)).state, "interrupted");
});

test("native edits racing the session's own worker are refused, other edits are not", async (t) => {
  const h = await harness(t);
  const repo = await h.repo("repo");
  const other = await h.repo("other");
  const m = manager(t);
  await h.mode("sleep");
  const id = runIdOf(await claudePrompt(m, repo, "Paint", "claude:g"));
  await settle(m, id, (r) => r.state === "running");
  const guard = (tool, toolInput, sessionId = SESSION) =>
    m.dispatch("codex.hook", { sessionId, event: "PreToolUse", cwd: repo, tool, toolInput });
  assert.match((await guard("Write", { file_path: join(repo, "new", "file.txt") })).deny, new RegExp(`Factory run ${id} \\(claude\\) is writing in`));
  assert.deepEqual(await guard("Edit", { file_path: join(other, "x.txt") }), {});
  assert.deepEqual(await guard("Bash", { command: "echo hi > x.txt" }), {});
  // Another session has no worker here.
  assert.deepEqual(await guard("Edit", { file_path: join(repo, "x.txt") }, "44444444-4444-4444-8444-444444444444"), {});
  assert.deepEqual(
    editTargets("apply_patch", { command: "*** Begin Patch\n*** Update File: src/a.js\n@@\n*** End Patch" }, repo),
    [join(repo, "src/a.js")],
  );
  await m.cancel(id);
  await settle(m, id);
  assert.deepEqual(await guard("Write", { file_path: join(repo, "x.txt") }), {});
});

test("an unsupervised dispatched run is stopped when its owner lease lapses", async (t) => {
  const h = await harness(t);
  const repo = await h.repo("repo");
  await configWrite({ ...(await configRead()), disconnectGraceSeconds: 5 });
  const m = manager(t);
  await h.mode("sleep");
  const id = runIdOf(await claudePrompt(m, repo, "Paint", "claude:l"));
  // No manager wait: only status reads, which do not renew the lease.
  let run;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    run = await m.status(id);
    if (run.terminal) break;
  }
  assert.equal(run.terminal, true);
  assert.equal(run.state, "interrupted");
});

test("turn identity and the handoff are bounded and conservative", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "fx-key-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const transcript = join(root, "t.jsonl");
  await writeFile(transcript, '{"type":"user"}\n');
  const one = await claudeTurnKey("same words", transcript);
  assert.equal(await claudeTurnKey("same words", transcript), one);
  await appendFile(transcript, '{"type":"assistant"}\n');
  assert.notEqual(await claudeTurnKey("same words", transcript), one);
  assert.equal(await claudeTurnKey("same words", join(root, "missing.jsonl")), null);
  assert.equal(await claudeTurnKey("same words", undefined), null);
  assert.equal(codexTurnKey(""), null);
  const long = dispatchHandoff("x".repeat(40000), { id: "r", state: "completed", result: { summary: "y".repeat(5000) } });
  assert.match(long, /truncated at 32000 characters/);
  assert.match(long, /truncated at 2000 characters/);
});

// ---- Installed hook scripts, through a separate bridge process ----

function hook(script, input, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL(`../scripts/${script}`, import.meta.url).pathname, input.hook_event_name], {
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b));
    child.stderr.on("data", (b) => (stderr += b));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}
function bridgeShutdown(h, runIds) {
  h.first.push(async () => {
    for (const runId of runIds()) {
      await useRunning("stop", { runId }).catch(() => {});
      for (let i = 0; i < 100; i++) {
        const r = await useRunning("status", { runId }).catch(() => null);
        if (!r?.found || r.result.terminal) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    await useRunning("shutdown", {}).catch(() => {});
  });
}

test("Claude Code hooks dispatch through the bridge service and guard the worker's checkout", async (t) => {
  const h = await harness(t);
  const repo = await h.repo("repo");
  const started = [];
  bridgeShutdown(h, () => started);
  const transcript = join(h.root, "transcript.jsonl");
  await writeFile(transcript, '{"type":"user"}\n');
  const base = { session_id: SESSION, cwd: repo, permission_mode: "acceptEdits", model: "claude-opus-5-5", transcript_path: transcript };
  const session = await hook("claude-hook.mjs", { ...base, hook_event_name: "SessionStart" });
  assert.equal(session.code, 0, session.stderr);
  assert.match(JSON.parse(session.stdout).systemMessage, /^Factory automatic dispatch is on \(experimental\)/);
  const input = { ...base, hook_event_name: "UserPromptSubmit", prompt: "Paint the fence" };
  const first = await hook("claude-hook.mjs", input);
  assert.equal(first.code, 0, first.stderr);
  const output = JSON.parse(first.stdout);
  const id = runIdOf(output);
  started.push(id);
  assert.match(output.systemMessage, /^Using Factory to delegate this turn to a claude worker session/);
  assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(output.hookSpecificOutput.additionalContext, /open it with one short sentence/);
  // The hook retried for the same turn: same run, no second launch.
  assert.equal(runIdOf(JSON.parse((await hook("claude-hook.mjs", input)).stdout)), id);
  for (let i = 0; i < 100 && (await h.launches()).length < 1; i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal((await h.launches()).length, 1);
  assert.match((await h.launches())[0].stdin, /Paint the fence/);
  // While a later turn's worker runs, the coordinator's own edits there are refused.
  await h.mode("sleep");
  await appendFile(transcript, '{"type":"assistant"}\n');
  for (let i = 0; i < 100; i++) {
    const r = await useRunning("status", { runId: id });
    if (r.result.terminal) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const busy = JSON.parse((await hook("claude-hook.mjs", input)).stdout);
  const second = runIdOf(busy);
  started.push(second);
  assert.ok(second && second !== id, busy.systemMessage);
  const edit = await hook("claude-hook.mjs", {
    ...base,
    hook_event_name: "PreToolUse",
    tool_name: "Edit",
    tool_input: { file_path: join(repo, "fence.txt") },
  });
  assert.equal(edit.code, 2);
  assert.match(edit.stderr, new RegExp(`Factory run ${second} \\(claude\\) is writing in`));
  // A worker session's own hooks never dispatch: no recursion.
  const nested = await hook("claude-hook.mjs", { ...input, prompt: "nested" }, { FACTORY_DELEGATED: "1" });
  assert.deepEqual(nested, { code: 0, stdout: "", stderr: "" });
});

test("Codex hooks dispatch through the bridge service using the app server's turn settings", async (t) => {
  const h = await harness(t);
  const repo = await h.repo("repo");
  const started = [];
  bridgeShutdown(h, () => started);
  // A minimal Codex app server: the bridge reads the live thread's settings from it.
  const socketPath = join(h.root, "app.sock");
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) =>
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id == null) return;
      const result =
        msg.method === "thread/read"
          ? { thread: { id: msg.params.threadId, status: { type: "idle" } } }
          : msg.method === "thread/resume"
            ? { model: "gpt-6.1-sol", reasoningEffort: "medium", cwd: repo, sandbox: { type: "dangerFullAccess" }, approvalPolicy: "never" }
            : {};
      ws.send(JSON.stringify({ id: msg.id, result }));
    }),
  );
  await new Promise((r) => server.listen(socketPath, r));
  t.after(() => {
    wss.close();
    server.close();
  });
  await writeFile(
    join(h.root, "bin", "codex"),
    `#!/bin/sh\nif [ "$1 $2 $3" = "app-server daemon version" ]; then echo '{"status":"running","socketPath":"${socketPath}"}'; exit 0; fi\nexit 1\n`,
  );
  await chmod(join(h.root, "bin", "codex"), 0o755);
  const threadId = "0199cccc-dddd-7eee-8fff-000011112222";
  await h.mode("sleep");
  const input = { session_id: threadId, turn_id: "turn-1", cwd: repo, hook_event_name: "UserPromptSubmit", prompt: "Draw it" };
  const first = await hook("hook.mjs", input);
  assert.equal(first.code, 0, first.stderr);
  const output = JSON.parse(first.stdout);
  const id = runIdOf(output);
  started.push(id);
  assert.match(output.systemMessage, /^Using Factory to delegate this turn to a claude worker session .* "pool" gateway credential/);
  assert.match(output.hookSpecificOutput.additionalContext, /Call claude_wait with runId/);
  assert.equal(runIdOf(JSON.parse((await hook("hook.mjs", input)).stdout)), id);
  for (let i = 0; i < 100 && (await h.launches()).length < 1; i++) await new Promise((r) => setTimeout(r, 100));
  const launched = await h.launches();
  assert.equal(launched.length, 1);
  assert.equal(launched[0].argv[launched[0].argv.indexOf("--permission-mode") + 1], "bypassPermissions");
  const patch = await hook("hook.mjs", {
    session_id: threadId,
    turn_id: "turn-1",
    cwd: repo,
    hook_event_name: "PreToolUse",
    tool_name: "apply_patch",
    tool_input: { command: "*** Begin Patch\n*** Add File: drawing.txt\n+x\n*** End Patch" },
  });
  assert.equal(patch.code, 2);
  assert.match(patch.stderr, new RegExp(`Factory run ${id} \\(claude\\) is writing in`));
});

