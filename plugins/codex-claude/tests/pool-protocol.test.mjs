// Paperclip completion protocol, submission evidence and cancellation recovery, against a
// fake shaped on the pinned 2026.1012.0 server: run-attributed comments, an atomic
// comment+status PATCH, agent comment request ids ignored, an operator cancel that holds
// plain comment wakes, and the post-run missing-comment / disposition-repair policy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDisposition } from "../src/pool-store.mjs";
import { poolFixture, until } from "./pool-fixtures.mjs";

const byRun = (fx, issueId, runId) => (fx.paperclip.comments.get(issueId) ?? []).filter((c) => c.createdByRunId === runId);
const exists = (path) => stat(path).then(() => true, () => false);

test("each finished turn records one run-attributed disposition, so Paperclip queues no repair", async (t) => {
  const fx = await poolFixture(t, { provider: "codex", transport: "local" });
  const pool = fx.coordinator();
  const s = await pool.start({ threadId: "thread-p", profile: fx.name, prompt: "QUESTION about colors" });
  const run1 = fx.paperclip.startRun(s.issueId);
  assert.equal(await fx.run(run1), 0);
  const issue = fx.paperclip.issues.get(s.issueId);
  assert.equal(issue.status, "blocked");
  const [own] = byRun(fx, s.issueId, run1);
  assert.match(own.body, /Pool turn 1: needs_input \(termination verified\)\.\nSummary: need a color\nQuestion: Which color\?/);
  assert.match(own.body, /Paperclip status is operational only/);
  assert.deepEqual(parseDisposition(own.body), { conversationId: s.conversationId, turn: 1, runId: run1 });
  assert.deepEqual(fx.paperclip.policy(run1, 0), { missingComment: false, dispositionRepair: false });
  const asked = await pool.status({ conversationId: s.conversationId });
  assert.deepEqual(asked.disposition, { status: "blocked", state: "applied", runId: run1 });

  await pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "WRITE color.txt blue", replySource: "user", replyReason: "User chose blue" });
  assert.equal(issue.status, "todo");
  assert.deepEqual(fx.paperclip.wakes.at(-1), { issueId: s.issueId, resume: true });
  const run2 = fx.paperclip.startRun(s.issueId);
  assert.equal(await fx.run(run2), 0);
  assert.equal(issue.status, "done");
  assert.equal(byRun(fx, s.issueId, run2).length, 1);
  assert.deepEqual(fx.paperclip.policy(run2, 0), { missingComment: false, dispositionRepair: false });

  await writeFile(join(fx.state, "codex-logged-out"), "");
  await pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "WRITE more.txt x" });
  const run3 = fx.paperclip.startRun(s.issueId);
  assert.equal(await fx.run(run3), 75);
  assert.equal(issue.status, "blocked");
  assert.match(byRun(fx, s.issueId, run3)[0].body, /Pool turn 3: refused \(termination not-started\)\.\nStop reason: native_auth_unavailable/);
  assert.equal((await fx.lines("codex-calls.jsonl")).length, 2);
});

test("a late or repair wake cannot execute a follow-up Paperclip never accepted", async (t) => {
  const fx = await poolFixture(t, { provider: "codex", transport: "local" });
  const pool = fx.coordinator();
  const s = await pool.start({ threadId: "thread-q", profile: fx.name, prompt: "WRITE one.txt 1" });
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 0);
  const calls = async () => (await fx.lines("codex-calls.jsonl")).length;
  const comments = /^\/issues\/[^/]+\/comments$/;
  const turnDir = join(fx.coord, "pool", "conversations", s.conversationId, "turns");

  fx.paperclip.fail = (method, path) => (method === "POST" && comments.test(path) ? 422 : null);
  const rejected = await pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "WRITE two.txt 2" });
  fx.paperclip.fail = null;
  assert.deepEqual([rejected.submission, rejected.state, rejected.terminal], ["rejected", "rejected", true]);
  const late = fx.paperclip.startRun(s.issueId);
  assert.equal(await fx.run(late), 0);
  assert.match(fx.paperclip.logs.get(late), /no pending pool turn/);
  assert.equal(await exists(join(turnDir, "2.claim")), false);

  fx.paperclip.fail = (method, path) => (method === "POST" && comments.test(path) ? "throw" : null);
  const unknown = await pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "WRITE three.txt 3" });
  fx.paperclip.fail = null;
  assert.equal(unknown.submission, "unknown");
  const repair = fx.paperclip.startRun(s.issueId);
  assert.equal(await fx.run(repair), 0);
  assert.match(fx.paperclip.logs.get(repair), /not committed upstream yet/);
  assert.equal(await exists(join(turnDir, "3.claim")), false);
  assert.equal(byRun(fx, s.issueId, repair).length, 0);
  assert.equal(await calls(), 1);

  const retried = await pool.reattach({ conversationId: s.conversationId, threadId: s.threadId, retry: true });
  assert.equal(retried.submission, "submitted");
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 0);
  assert.equal(await readFile(join(fx.profiles[fx.name].workspace, "three.txt"), "utf8"), "3\n");
  assert.equal(await exists(join(fx.profiles[fx.name].workspace, "two.txt")), false);

  // Accepted upstream but unknown locally: a recovery wake may consume it, once.
  fx.paperclip.fail = (method, path) => (method === "POST" && comments.test(path) ? "throw-after" : null);
  const applied = await pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "WRITE five.txt 5" });
  fx.paperclip.fail = null;
  assert.equal(applied.submission, "unknown");
  assert.deepEqual(await Promise.all([fx.run(fx.paperclip.startRun(s.issueId)), fx.run(fx.paperclip.startRun(s.issueId))]), [0, 0]);
  assert.equal(await calls(), 3);
  assert.equal((await pool.status({ conversationId: s.conversationId })).state, "completed");
});

test("a duplicate wake during an active turn writes nothing to Paperclip and leaves that turn open", async (t) => {
  const fx = await poolFixture(t, { provider: "claude", transport: "local" });
  const pool = fx.coordinator();
  const s = await pool.start({ threadId: "thread-a", profile: fx.name, prompt: "SLEEP while duplicates arrive" });
  const running = fx.run(fx.paperclip.startRun(s.issueId));
  await until(async () => (await pool.wait({ conversationId: s.conversationId, seconds: 0 })).progress.includes("working"));
  const issue = fx.paperclip.issues.get(s.issueId);
  const duplicate = fx.paperclip.startRun(s.issueId);
  issue.executionRunId = (await pool.status({ conversationId: s.conversationId })).paperclipRunId;
  assert.equal(await fx.run(duplicate), 0);
  assert.equal(issue.status, "in_progress");
  assert.match(fx.paperclip.logs.get(duplicate), /turn already claimed/);
  // Log-only: no comment and no status write; Paperclip's own retry for that is bounded.
  assert.equal(byRun(fx, s.issueId, duplicate).length, 0);
  assert.equal(fx.paperclip.count("PATCH", /./), 0);
  await pool.stop({ conversationId: s.conversationId });
  assert.equal(await running, 124);
  assert.equal(issue.status, "blocked");
  assert.equal((await fx.lines("claude-calls.jsonl")).length, 1);
});

test("an unknown disposition is never re-sent, blocks new turns until positively observed, and old wakes write nothing", async (t) => {
  const fx = await poolFixture(t, { provider: "codex", transport: "local" });
  const pool = fx.coordinator();
  const s = await pool.start({ threadId: "thread-u", profile: fx.name, prompt: "WRITE a.txt a" });
  const issue = fx.paperclip.issues.get(s.issueId);
  const patches = () => fx.paperclip.count("PATCH", /./);
  const userComments = () => (fx.paperclip.comments.get(s.issueId) ?? []).filter((c) => c.authorType === "user").length;
  // Applied upstream, unknown locally: a later wake settles it by exact observation only.
  fx.paperclip.fail = (method) => (method === "PATCH" ? "throw-after" : null);
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 0);
  fx.paperclip.fail = null;
  assert.equal((await pool.status({ conversationId: s.conversationId })).disposition.state, "unknown");
  const observer = fx.paperclip.startRun(s.issueId);
  assert.equal(await fx.run(observer), 0);
  assert.deepEqual([patches(), byRun(fx, s.issueId, observer).length], [1, 0]);
  assert.equal((await pool.status({ conversationId: s.conversationId })).disposition.state, "applied");

  // Timed out and still in flight: never re-sent, and no new turn may race it.
  await pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "WRITE b.txt b" });
  fx.paperclip.fail = (method) => (method === "PATCH" ? "delay" : null);
  const first = fx.paperclip.startRun(s.issueId);
  assert.equal(await fx.run(first), 0);
  fx.paperclip.fail = null;
  assert.equal(issue.status, "in_progress");
  const before = userComments();
  await assert.rejects(pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "WRITE c.txt c" }), /status update is unconfirmed/);
  for (let i = 0; i < 2; i++) assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 0);
  const stale = await pool.reattach({ conversationId: s.conversationId, threadId: s.threadId });
  assert.deepEqual([patches(), userComments(), issue.status, stale.disposition.state], [2, before, "in_progress", "unknown"]);
  // The delayed write lands; positive observation settles it and the conversation continues.
  fx.paperclip.applyDelayed();
  assert.equal(issue.status, "done");
  const next = await pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "WRITE c.txt c" });
  assert.deepEqual([next.turn, next.submission, issue.status], [3, "submitted", "todo"]);
  assert.equal((await readFile(join(fx.coord, "pool", "conversations", s.conversationId, "turns", "2.disposition.json"), "utf8")).includes('"applied"'), true);
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 0);
  assert.equal(issue.status, "done");
  assert.equal((await fx.lines("codex-calls.jsonl")).length, 3);
});

test("a Paperclip cancel that kills the runner's process group keeps unknown evidence, adds host proof, and resume continues the session", async (t) => {
  const fx = await poolFixture(t, { provider: "claude", transport: "ssh" });
  const pool = fx.coordinator();
  const s = await pool.start({ threadId: "thread-k", profile: fx.name, prompt: "SLEEP until cancelled" });
  const runId = fx.paperclip.startRun(s.issueId);
  const url = await fx.paperclip.listen();
  t.after(() => fx.paperclip.server.close());
  const child = spawn(process.execPath, [fileURLToPath(new URL("../scripts/pool-runner.mjs", import.meta.url))], {
    env: {
      PAPERCLIP_RUN_ID: runId, PAPERCLIP_AGENT_ID: fx.profile.agentId, PAPERCLIP_API_URL: url,
      PAPERCLIP_API_KEY: "paperclip-run-secret", HOME: fx.userHome, PATH: process.env.PATH, CODEX_CLAUDE_HOME: fx.coord,
    },
    detached: true, stdio: ["ignore", "pipe", "ignore"],
  });
  child.stdout.pipe(fx.paperclip.logStream(runId));
  await until(async () => (await pool.status({ conversationId: s.conversationId })).nativeSession === "sess-1");
  // Operator cancel: Paperclip records it and kills the whole local process group.
  await fx.paperclip.fetch(`${url}/api/heartbeat-runs/${runId}/cancel`, { method: "POST", headers: {} });
  process.kill(-child.pid, "SIGKILL");
  await until(() => child.exitCode !== null || child.signalCode !== null);
  const lost = await pool.status({ conversationId: s.conversationId });
  assert.deepEqual([lost.state, lost.terminal, lost.termination, lost.hostTermination], ["runner_lost", true, "unknown", null]);
  const ledger = () => readFile(join(fx.coord, "pool", "accounts", "acct-claude.json"), "utf8").then(JSON.parse);
  assert.equal((await ledger()).length, 1);
  await assert.rejects(pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "too early" }), /termination is not proven/);
  assert.equal((fx.paperclip.comments.get(s.issueId) ?? []).length, 0);
  await until(async () => (await pool.reconcile()).every((r) => r.state === "terminated"), 20000, 250);
  const proven = await pool.status({ conversationId: s.conversationId });
  assert.deepEqual([proven.state, proven.termination, proven.hostTermination.state], ["runner_lost", "unknown", "terminated"]);
  assert.deepEqual(await ledger(), []);

  // A plain comment wake is held after an operator cancel; the follow-up resumes explicitly.
  const before = fx.paperclip.wakes.length;
  await pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "WRITE after.txt resumed" });
  assert.deepEqual(fx.paperclip.wakes.slice(before), [{ issueId: s.issueId, resume: true }]);
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 0);
  const done = await pool.status({ conversationId: s.conversationId });
  assert.deepEqual([done.turn, done.state, done.nativeSession], [2, "completed", "sess-1"]);
  const calls = await fx.lines("claude-calls.jsonl");
  assert.equal(calls[1].args[calls[1].args.indexOf("--resume") + 1], "sess-1");
  assert.equal(await readFile(join(fx.profile.workspace, "after.txt"), "utf8"), "resumed\n");
});
