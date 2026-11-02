import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requestId } from "../src/pool-store.mjs";
import { poolFixture, until } from "./pool-fixtures.mjs";

test("remote Claude over SSH streams through Paperclip, answers a live question and resumes on follow-up", async (t) => {
  const fx = await poolFixture(t, { provider: "claude", transport: "ssh" });
  const pool = fx.coordinator();
  const started = await pool.start({ threadId: "thread-1", profile: fx.name, prompt: "ASK for a color" });
  assert.equal(started.submission, "submitted");
  assert.equal(started.state, "queued");
  assert.equal(started.terminal, false);
  const issue = fx.paperclip.issues.get(started.issueId);
  assert.equal(issue.assigneeAgentId, fx.profile.agentId);
  assert.equal(issue.idempotencyKey, `factory-pool-${started.conversationId}-1`);
  assert.match(issue.description, /<!-- factory-pool \{"conversationId":"[0-9a-f-]{36}","turn":1,/);

  const runId = fx.paperclip.startRun(started.issueId);
  const running = fx.run(runId);
  const asked = await until(async () => {
    const s = await pool.wait({ conversationId: started.conversationId, seconds: 1 });
    return s.question ? s : null;
  });
  assert.equal(asked.state, "needs_input");
  assert.deepEqual(asked.question, { id: "q1", toolName: "AskUserQuestion", input: { questions: [{ question: "Color?" }] } });
  assert.equal(asked.paperclipRunId, runId);
  assert.equal(asked.host, "mini");
  await assert.rejects(pool.answer({ conversationId: started.conversationId, threadId: started.threadId, questionId: "q0", source: "codex", reason: "routine" }), /Stale question id/);
  await pool.answer({ conversationId: started.conversationId, threadId: started.threadId, questionId: "q1", source: "codex", reason: "Reversible fixture choice", answers: { "Color?": "Blue" } });
  await assert.rejects(pool.answer({ conversationId: started.conversationId, threadId: started.threadId, questionId: "q1", source: "codex", reason: "again" }), /already answered/);
  assert.equal(await running, 0);
  const done = await pool.wait({ conversationId: started.conversationId, seconds: 5 });
  assert.equal(done.state, "completed");
  assert.equal(done.terminal, true);
  assert.equal(done.termination, "verified");
  assert.equal(done.result.summary, "answered Blue");
  assert.equal(done.nativeSession, "sess-1");
  assert.match(done.progress, /working: answered Blue/);
  assert.equal(done.supervisionReplies, 1);
  assert.deepEqual(done.requested, { model: "opus", effort: "medium" });
  assert.deepEqual(done.observed, { model: "claude-opus-5-5", effort: "unknown", basis: "Claude init event" });
  assert.deepEqual(done.usage, { source: "provider-reported", tokens: { input_tokens: 10, output_tokens: 5 } });

  const ssh = await fx.lines("ssh-calls.jsonl");
  assert.deepEqual(ssh[0].args.slice(0, 10), ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=3"]);
  assert.equal(ssh[0].args[10], "zoe@mini.test");
  assert.ok(!JSON.stringify(ssh).includes("paperclip-run-secret"));
  assert.deepEqual(ssh[0].env.filter((k) => k.startsWith("PAPERCLIP")), []);
  const calls = await fx.lines("claude-calls.jsonl");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].env.filter((k) => /^(PAPERCLIP|ANTHROPIC)/.test(k)), []);
  assert.ok(calls[0].env.includes("FACTORY_DELEGATED"));
  assert.equal(calls[0].cwd, fx.profile.workspace);
  for (const flag of [["--model", "opus"], ["--effort", "medium"], ["--permission-mode", "default"], ["--permission-prompt-tool", "stdio"]])
    assert.equal(calls[0].args[calls[0].args.indexOf(flag[0]) + 1], flag[1]);
  assert.equal(calls[0].args.includes("--resume"), false);

  const next = await pool.followup({ conversationId: started.conversationId, threadId: started.threadId, prompt: "WRITE note.txt nonce-2" });
  assert.equal(next.turn, 2);
  assert.equal(next.state, "queued");
  const comment = fx.paperclip.comments.get(started.issueId).at(-1);
  assert.equal(comment.clientRequestId, requestId(started.conversationId, 2));
  assert.notEqual(comment.clientRequestId, requestId(started.conversationId, 2, "disposition"));
  assert.deepEqual([comment.resume, comment.reopen, comment.authorType], [true, undefined, "user"]);
  assert.match(comment.body, /"turn":2/);
  assert.equal(await fx.run(fx.paperclip.startRun(started.issueId)), 0);
  const second = await pool.wait({ conversationId: started.conversationId, seconds: 5 });
  assert.equal(second.state, "completed");
  assert.equal(second.nativeSession, "sess-1");
  assert.equal(second.sessionDrift, false);
  const resumed = (await fx.lines("claude-calls.jsonl"))[1];
  assert.equal(resumed.args[resumed.args.indexOf("--resume") + 1], "sess-1");
  assert.equal(await readFile(join(fx.profile.workspace, "note.txt"), "utf8"), "nonce-2\n");
});

test("remote Codex reports needs_input at the turn boundary and the follow-up resumes the same thread", async (t) => {
  const fx = await poolFixture(t, { provider: "codex", transport: "local", maxSupervisionReplies: 1 });
  const pool = fx.coordinator();
  const profiles = await pool.profiles();
  assert.deepEqual(profiles.map((p) => [p.name, p.provider, p.host, p.capabilities.liveQuestions, p.capabilities.followups]), [["mini-codex", "codex", "local", false, "turn-boundary"]]);
  const s = await pool.start({ threadId: "thread-c", profile: fx.name, prompt: "QUESTION about colors" });
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 0);
  const asked = await pool.wait({ conversationId: s.conversationId, seconds: 5 });
  assert.equal(asked.state, "needs_input");
  assert.equal(asked.terminal, true);
  assert.equal(asked.question, null);
  assert.deepEqual(asked.result, { outcome: "needs_input", summary: "need a color", evidence: [], question: "Which color?" });
  assert.equal(asked.nativeSession, "thread-1");
  await assert.rejects(pool.answer({ conversationId: s.conversationId, threadId: s.threadId, questionId: "x", source: "codex", reason: "r" }), /No live question/);
  await assert.rejects(pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "Blue" }), /replySource and replyReason/);
  await pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "QUESTION again: Blue", replySource: "codex", replyReason: "Routine fixture choice" });
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 0);
  const again = await pool.wait({ conversationId: s.conversationId, seconds: 5 });
  assert.equal(again.supervisionReplies, 1);
  await assert.rejects(pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "Blue", replySource: "codex", replyReason: "again" }), /Supervision limit reached/);
  const byUser = await pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "WRITE color.txt blue", replySource: "user", replyReason: "User chose blue" });
  assert.equal(byUser.supervisionReplies, 0);
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 0);
  const done = await pool.wait({ conversationId: s.conversationId, seconds: 5 });
  assert.equal(done.state, "completed");
  assert.equal(done.result.summary, "wrote color.txt");
  assert.deepEqual(done.requested, { model: "gpt-5.6-sol", effort: "medium" });
  assert.deepEqual([done.observed.model, done.observed.effort], ["unknown", "unknown"]);
  assert.deepEqual(done.usage.tokens, { input_tokens: 7, cached_input_tokens: 2, output_tokens: 3 });
  const calls = await fx.lines("codex-calls.jsonl");
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].args.slice(0, 2), ["exec", "--json"]);
  for (const call of calls.slice(1)) {
    assert.deepEqual(call.args.slice(0, 2), ["exec", "resume"]);
    assert.equal(call.args.at(-2), "thread-1");
  }
  assert.ok(calls[0].args.includes('sandbox_mode="workspace-write"'));
  assert.equal(calls[0].args[calls[0].args.indexOf("-m") + 1], "gpt-5.6-sol");
  assert.equal(await readFile(join(fx.profile.workspace, "color.txt"), "utf8"), "blue\n");
});

test("an uncertain issue creation is observed by marker and duplicate runs never launch a second provider", async (t) => {
  const fx = await poolFixture(t, { provider: "claude", transport: "local" });
  const pool = fx.coordinator();
  fx.paperclip.fail = (method, path) => (method === "POST" && /\/issues$/.test(path) ? "throw-after" : null);
  const s = await pool.start({ threadId: "thread-u", profile: fx.name, prompt: "WRITE once.txt one" });
  fx.paperclip.fail = null;
  assert.equal(s.submission, "unknown");
  assert.equal(s.state, "submission_unknown");
  assert.equal(s.issueId, null);
  assert.equal(s.terminal, false);
  const [issueId] = [...fx.paperclip.issues.keys()];
  const runs = [fx.paperclip.startRun(issueId), fx.paperclip.startRun(issueId), fx.paperclip.startRun(issueId)];
  const codes = await Promise.all(runs.map((runId) => fx.run(runId)));
  assert.deepEqual(codes.sort(), [0, 0, 0]);
  assert.equal((await fx.lines("claude-calls.jsonl")).length, 1);
  const noops = runs.filter((runId) => fx.paperclip.logs.get(runId).includes('\\"kind\\":\\"noop\\"'));
  assert.equal(noops.length, 2);
  const after = await pool.reattach({ conversationId: s.conversationId, threadId: s.threadId, retry: true });
  assert.equal(after.issueId, issueId);
  assert.equal(after.state, "completed");
  assert.equal(fx.paperclip.count("POST", /^\/companies\/[^/]+\/issues$/), 1);
  const stray = fx.paperclip.startRun(issueId);
  assert.equal(await fx.run(stray), 0);
  assert.match(fx.paperclip.logs.get(stray), /turn already claimed/);
  assert.equal((await fx.lines("claude-calls.jsonl")).length, 1);
  fx.paperclip.issues.set("00000000-0000-4000-8000-000000000000", { id: "00000000-0000-4000-8000-000000000000", assigneeAgentId: fx.profile.agentId, description: "someone else's task" });
  const foreign = fx.paperclip.startRun("00000000-0000-4000-8000-000000000000");
  assert.equal(await fx.run(foreign), 0);
  assert.match(fx.paperclip.logs.get(foreign), /no pool turn is linked/);
});

test("an unknown submission is never reposted without an explicit retry, which reuses the same key", async (t) => {
  const fx = await poolFixture(t, { provider: "codex", transport: "local" });
  const pool = fx.coordinator();
  fx.paperclip.fail = (method, path) => (method === "POST" && /\/issues$/.test(path) ? "throw" : null);
  const s = await pool.start({ threadId: "thread-r", profile: fx.name, prompt: "WRITE r.txt r" });
  assert.equal(s.submission, "unknown");
  fx.paperclip.fail = null;
  const observed = await pool.reattach({ conversationId: s.conversationId });
  assert.equal(observed.observed, null);
  assert.equal(observed.submission, "unknown");
  assert.equal(fx.paperclip.count("POST", /\/issues$/), 1);
  const retried = await pool.reattach({ conversationId: s.conversationId, threadId: s.threadId, retry: true });
  assert.equal(retried.submission, "submitted");
  const keys = fx.paperclip.calls.filter((c) => c.method === "POST" && /\/issues$/.test(c.path)).map((c) => c.body.idempotencyKey);
  assert.deepEqual(keys, [`factory-pool-${s.conversationId}-1`, `factory-pool-${s.conversationId}-1`]);
  fx.paperclip.fail = (method, path) => (method === "POST" && /\/issues$/.test(path) ? 422 : null);
  const other = await pool.start({ threadId: "thread-r", profile: fx.name, prompt: "never" }).catch((e) => e);
  assert.match(other.message, /already has an active turn/);
});

test("refusals happen before any provider process: auth, quota, host binding and tool permission", async (t) => {
  const fx = await poolFixture(t, { provider: "claude", transport: "local" });
  const pool = fx.coordinator();
  const turn = async (prompt) => {
    const s = await pool.start({ threadId: "thread-f", profile: fx.name, prompt });
    const code = await fx.run(fx.paperclip.startRun(s.issueId));
    return { code, status: await pool.wait({ conversationId: s.conversationId, seconds: 2 }) };
  };
  const { writeFile, rm } = await import("node:fs/promises");
  await writeFile(join(fx.state, "claude-logged-out"), "");
  let r = await turn("WRITE a.txt a");
  assert.equal(r.code, 75);
  assert.deepEqual([r.status.state, r.status.category, r.status.termination], ["refused", "native_auth_unavailable", "not-started"]);
  await rm(join(fx.state, "claude-logged-out"));
  await writeFile(join(fx.state, "quota.json"), JSON.stringify({ usedPercent: 70 }));
  r = await turn("WRITE a.txt a");
  assert.deepEqual([r.code, r.status.category], [75, "quota_exhausted"]);
  assert.match(r.status.stopReason, /window weekly at 70% reaches stopAt 70%/);
  await writeFile(join(fx.state, "quota.json"), JSON.stringify({ usedPercent: 69.9 }));
  await writeFile(join(fx.state, "quota.json"), JSON.stringify({ fail: true }));
  r = await turn("WRITE a.txt a");
  assert.deepEqual([r.code, r.status.category], [75, "quota_unknown"]);
  await writeFile(join(fx.state, "quota.json"), JSON.stringify({ stale: true }));
  r = await turn("WRITE a.txt a");
  assert.deepEqual([r.code, r.status.category], [75, "quota_unknown"]);
  await rm(join(fx.state, "quota.json"));
  await fx.writeHost({ ...fx.host, quota: {} });
  r = await turn("WRITE a.txt a");
  assert.deepEqual([r.code, r.status.category], [75, "quota_unavailable"]);
  await fx.writeHost({ ...fx.host, profiles: { [fx.name]: { ...fx.host.profiles[fx.name], bindingSha256: "0".repeat(64) } } });
  r = await turn("WRITE a.txt a");
  assert.deepEqual([r.code, r.status.state, r.status.category], [78, "refused", "binding"]);
  assert.equal((await fx.lines("claude-calls.jsonl")).length, 0);
  await fx.writeHost(fx.host);
  const s = await pool.start({ threadId: "thread-f", profile: fx.name, prompt: "TOOL please" });
  const running = fx.run(fx.paperclip.startRun(s.issueId));
  const asked = await until(async () => (await pool.status({ conversationId: s.conversationId })).question);
  assert.equal(asked.toolName, "Bash");
  await assert.rejects(pool.answer({ conversationId: s.conversationId, threadId: s.threadId, questionId: "t1", source: "codex", reason: "looks safe" }), /require user approval/);
  await pool.answer({ conversationId: s.conversationId, threadId: s.threadId, questionId: "t1", source: "user", reason: "User declined", allow: false });
  assert.equal(await running, 0);
  const denied = await pool.wait({ conversationId: s.conversationId, seconds: 3 });
  assert.equal(denied.result.summary, "tool deny");
  const { readdir } = await import("node:fs/promises");
  assert.deepEqual(JSON.parse(await readFile(join(fx.coord, "pool", "accounts", "acct-claude.json"), "utf8")), []);
  assert.ok((await readdir(join(fx.hostHome, "pool-locks"))).length === 0);
});

test("binding and native session drift refuse instead of silently moving a conversation", async (t) => {
  const fx = await poolFixture(t, { provider: "codex", transport: "local" });
  const pool = fx.coordinator();
  const s = await pool.start({ threadId: "thread-d", profile: fx.name, prompt: "WRITE d.txt d" });
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 0);
  await pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "DRIFT now" });
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 124);
  const drifted = await pool.wait({ conversationId: s.conversationId, seconds: 3 });
  assert.equal(drifted.sessionDrift, true);
  assert.equal(drifted.stopReason, "native session drift");
  assert.equal(drifted.termination, "verified");
  await assert.rejects(pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "more" }), /session drift/);

  const s2 = await pool.start({ threadId: "thread-d", profile: fx.name, prompt: "WRITE e.txt e" });
  await fx.writePool({ ...fx.pool, profiles: { [fx.name]: { ...fx.profile, effort: "high" } } });
  assert.equal(await fx.run(fx.paperclip.startRun(s2.issueId)), 78);
  const refused = await pool.status({ conversationId: s2.conversationId });
  assert.deepEqual([refused.state, refused.category], ["refused", "binding_drift"]);
  await assert.rejects(pool.followup({ conversationId: s2.conversationId, threadId: s2.threadId, prompt: "x" }), /profile changed/);
  assert.equal((await fx.lines("codex-calls.jsonl")).length, 2);
});

test("stop is exact before and during a turn, and Paperclip cancellation stops the remote", async (t) => {
  const fx = await poolFixture(t, { provider: "claude", transport: "ssh" });
  const pool = fx.coordinator();
  const early = await pool.start({ threadId: "thread-s", profile: fx.name, prompt: "WRITE never.txt x" });
  const cancelled = await pool.stop({ conversationId: early.conversationId });
  assert.deepEqual([cancelled.state, cancelled.terminal, cancelled.termination, cancelled.stopping], ["cancelled", true, "not-started", false]);
  assert.equal(await fx.run(fx.paperclip.startRun(early.issueId)), 0);
  assert.equal((await fx.lines("claude-calls.jsonl")).length, 0);

  const s = await pool.start({ threadId: "thread-s", profile: fx.name, prompt: "SLEEP for a while" });
  const runId = fx.paperclip.startRun(s.issueId);
  const running = fx.run(runId);
  await until(async () => (await pool.wait({ conversationId: s.conversationId, seconds: 0 })).progress.includes("working"));
  const stopping = await pool.stop({ conversationId: s.conversationId });
  assert.equal(stopping.stopping, true);
  assert.equal(stopping.paperclipCancel, "requested");
  assert.equal(await running, 124);
  const stopped = await pool.wait({ conversationId: s.conversationId, seconds: 3 });
  assert.deepEqual([stopped.state, stopped.termination, stopped.stopReason], ["interrupted", "verified", "stop requested"]);
  assert.equal(fx.paperclip.count("POST", new RegExp(`/heartbeat-runs/${runId}/cancel`)), 1);

  await pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "SLEEP again" });
  const running2 = fx.run(fx.paperclip.startRun(s.issueId));
  await until(async () => (await pool.status({ conversationId: s.conversationId })).state === "running");
  fx.signals.emit("SIGTERM");
  assert.equal(await running2, 124);
  const signalled = await pool.status({ conversationId: s.conversationId });
  assert.deepEqual([signalled.state, signalled.termination, signalled.stopReason], ["interrupted", "verified", "cancelled"]);
});

test("transport loss stops the remote turn and the account stays reserved until the host proves it ended", async (t) => {
  const fx = await poolFixture(t, { provider: "claude", transport: "ssh", second: { name: "mini-claude-b", account: "acct-claude" } });
  const pool = fx.coordinator();
  const s = await pool.start({ threadId: "thread-l", profile: fx.name, prompt: "SLEEP until cut" });
  const running = fx.run(fx.paperclip.startRun(s.issueId));
  await until(async () => (await pool.status({ conversationId: s.conversationId })).state === "running");
  const b = await pool.start({ threadId: "thread-l", profile: "mini-claude-b", prompt: "WRITE b.txt b" });
  assert.equal(await fx.run(fx.paperclip.startRun(b.issueId), "mini-claude-b"), 75);
  assert.equal((await pool.status({ conversationId: b.conversationId })).category, "account_reserved");
  const sshPid = Number(await readFile(join(fx.state, "ssh-pid"), "utf8"));
  process.kill(sshPid, "SIGKILL");
  const code = await running;
  assert.ok([124, 125].includes(code));
  const lost = await pool.status({ conversationId: s.conversationId });
  assert.equal(lost.state, "transport_lost");
  assert.equal(lost.terminal, true);
  const ledger = () => readFile(join(fx.coord, "pool", "accounts", "acct-claude.json"), "utf8").then(JSON.parse);
  if (code === 125) {
    assert.equal(lost.termination, "unknown");
    assert.equal((await ledger()).length, 1);
    await until(async () => (await pool.reconcile()).every((r) => r.state === "terminated"), 20000, 250);
  }
  assert.deepEqual(await ledger(), []);
  const receipts = await import("node:fs/promises").then((f) => f.readdir(join(fx.hostHome, "pool-runs")));
  const receipt = JSON.parse(await readFile(join(fx.hostHome, "pool-runs", receipts.sort()[0]), "utf8"));
  assert.equal(receipt.termination, "verified");
  const b2 = await pool.start({ threadId: "thread-l", profile: "mini-claude-b", prompt: "WRITE b.txt b" }).catch((e) => e);
  assert.ok(!(b2 instanceof Error) || /active turn/.test(b2.message));
});

test("a coordinator restart reattaches by conversation id and cursor; the worker never depended on it", async (t) => {
  const fx = await poolFixture(t, { provider: "claude", transport: "local" });
  const first = fx.coordinator();
  const s = await first.start({ threadId: "thread-x", profile: fx.name, prompt: "ASK then wait" });
  const running = fx.run(fx.paperclip.startRun(s.issueId));
  const asked = await until(async () => {
    const v = await first.wait({ conversationId: s.conversationId, seconds: 1 });
    return v.question ? v : null;
  });
  // Longer than the host's one-second lease grace with no coordinator call at all.
  await new Promise((r) => setTimeout(r, 1800));
  const second = fx.coordinator();
  const listed = await second.reattach({ threadId: "thread-x" });
  assert.deepEqual(listed.conversations.map((c) => c.conversationId), [s.conversationId]);
  const back = await second.reattach({ conversationId: s.conversationId });
  assert.deepEqual(back.question, asked.question);
  assert.equal(back.state, "needs_input");
  assert.equal(back.progress, asked.progress);
  assert.equal(back.log.offset >= asked.log.offset, true);
  const cursor = JSON.parse(await readFile(join(fx.coord, "pool", "conversations", s.conversationId, "cursor.json"), "utf8"));
  await (await import("node:fs/promises")).rm(join(fx.coord, "pool", "conversations", s.conversationId, "cursor.json"));
  const replayed = await second.reattach({ conversationId: s.conversationId });
  assert.equal(replayed.log.offset, cursor.offset);
  assert.equal(replayed.progress, back.progress);
  await second.answer({ conversationId: s.conversationId, threadId: s.threadId, questionId: "q1", source: "user", reason: "User said green", answers: { "Color?": "Green" } });
  assert.equal(await running, 0);
  const done = await second.wait({ conversationId: s.conversationId, seconds: 3 });
  assert.equal(done.result.summary, "answered Green");
  const elsewhere = await second.reattach({ conversationId: s.conversationId, threadId: "other-thread" });
  assert.equal(elsewhere.conversationId, s.conversationId);
});

test("pool admission keeps the bridge's coordinator invariants and denials make no external write", async (t) => {
  const fx = await poolFixture(t, { provider: "codex", transport: "local" });
  const { configRead, configWrite } = await import("../src/store.mjs");
  const posts = () => fx.paperclip.count("POST", /./);
  const deny = async (pool, args, pattern) => {
    const before = posts();
    await assert.rejects(pool.start({ threadId: "thread-g", profile: fx.name, prompt: "WRITE g.txt g", ...args }), pattern);
    assert.equal(posts(), before);
  };
  await deny(fx.coordinator({ sandbox: { type: "readOnly" } }), {}, /exceeds this Codex task's readOnly sandbox; permissions were not widened/);
  await deny(fx.coordinator({ sandbox: { type: "externalSandbox" } }), {}, /could not be verified/);
  await deny(fx.coordinator({ approvalPolicy: { granular: true } }), {}, /could not be verified/);
  await deny(fx.coordinator(() => { throw new Error("No active, verified turn settings; open the task and send a message."); }), {}, /No active, verified turn settings/);
  await deny(fx.coordinator(), { threadId: "../x" }, /Invalid Codex task id/);
  const pool = fx.coordinator();
  await pool.manager.dispatch("override", { threadId: "thread-g", executor: "off" });
  await deny(pool, {}, /disabled for this task or project/);
  await pool.manager.dispatch("override", { threadId: "thread-g", executor: "auto" });
  const config = await configRead();
  await configWrite({ ...config, projects: { [fx.coordinatorCwd]: "off" } });
  await deny(pool, {}, /disabled for this task or project/);
  await configWrite({ ...config, mode: "off" });
  await deny(pool, {}, /Delegation disabled/);
  await configWrite(config);
  pool.manager.draining = true;
  await deny(pool, {}, /upgrade is in progress/);
  pool.manager.draining = false;
  assert.deepEqual(await (await import("node:fs/promises")).readdir(join(fx.coord, "pool", "conversations")).catch(() => []), []);

  // A workspace-write coordinator may use a workspace-write profile.
  const writer = fx.coordinator({ sandbox: { type: "workspaceWrite" }, approvalPolicy: "on-request" });
  const s = await writer.start({ threadId: "thread-g", profile: fx.name, prompt: "WRITE g.txt g" });
  assert.equal(s.submission, "submitted");
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 0);
  await writer.wait({ conversationId: s.conversationId, seconds: 3 });

  // Another authorized session may continue; a restricted one may not, nor any session
  // once the owning task is off. Observation needs no live session at all.
  const sessions = fx.coordinator((threadId) => (threadId === "thread-ro" ? { sandbox: { type: "readOnly" } } : {}));
  const comments = () => (fx.paperclip.comments.get(s.issueId) ?? []).filter((c) => c.authorType === "user").length;
  await assert.rejects(sessions.followup({ conversationId: s.conversationId, threadId: "thread-ro", prompt: "WRITE h.txt h" }), /exceeds/);
  await assert.rejects(sessions.followup({ conversationId: s.conversationId, prompt: "WRITE h.txt h" }), /current Codex task id/);
  await sessions.manager.dispatch("override", { threadId: "thread-g", executor: "off" });
  await assert.rejects(sessions.followup({ conversationId: s.conversationId, threadId: "thread-other", prompt: "WRITE h.txt h" }), /conversation's task or project/);
  await assert.rejects(sessions.answer({ conversationId: s.conversationId, threadId: "thread-other", questionId: "q", source: "user", reason: "r" }), /conversation's task or project/);
  await assert.rejects(sessions.reattach({ conversationId: s.conversationId, threadId: "thread-other", retry: true }), /conversation's task or project/);
  assert.equal(comments(), 0);
  const offline = fx.coordinator(() => { throw new Error("Codex unavailable"); });
  const seen = await offline.reattach({ conversationId: s.conversationId });
  assert.deepEqual([seen.state, seen.terminal], ["completed", true]);
  assert.equal((await offline.status({ conversationId: s.conversationId })).state, "completed");
  await sessions.manager.dispatch("override", { threadId: "thread-g", executor: "auto" });
  const next = await sessions.followup({ conversationId: s.conversationId, threadId: "thread-other", prompt: "WRITE h.txt h" });
  assert.equal(next.submission, "submitted");
  assert.equal(comments(), 1);
  assert.equal(JSON.parse(await readFile(join(fx.coord, "pool", "conversations", s.conversationId, "turns", "2.json"), "utf8")).coordinatorThreadId, "thread-other");
  assert.equal((await fx.lines("codex-calls.jsonl")).length, 1);
});

test("the host refuses a workspace that is an alias, a symlink or nested, before any provider call", async (t) => {
  const fx = await poolFixture(t, { provider: "codex", transport: "local" });
  const { rename, symlink, mkdir } = await import("node:fs/promises");
  const pool = fx.coordinator();
  const real = fx.profile.workspace;
  await rename(real, `${real}-moved`);
  await symlink(`${real}-moved`, real);
  const s = await pool.start({ threadId: "thread-w", profile: fx.name, prompt: "WRITE w.txt w" });
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 78);
  const refused = await pool.status({ conversationId: s.conversationId });
  assert.equal(refused.state, "refused");
  assert.match(refused.stopReason, /canonical real path/);
  assert.equal((await fx.lines("codex-calls.jsonl")).length, 0);
  await mkdir(join(fx.root, "outer"));
  await fx.writeHost({ ...fx.host, profiles: { [fx.name]: { ...fx.host.profiles[fx.name], workspace: join(fx.root, "outer") }, other: { ...fx.host.profiles[fx.name], bindingSha256: "c".repeat(64), workspace: join(fx.root, "outer", "inner") } } });
  const { loadHost } = await import("../src/pool-config.mjs");
  await assert.rejects(loadHost(fx.hostConfig), /may not contain one another/);
});
