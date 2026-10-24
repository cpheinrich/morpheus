// Regressions for the first independent review's findings (F1-F7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { atomic } from "../src/store.mjs";
import { dispositionMarker } from "../src/pool-store.mjs";
import { poolFixture, until } from "./pool-fixtures.mjs";

const remote = fileURLToPath(new URL("../scripts/pool-remote.mjs", import.meta.url));
const convDir = (fx, id) => join(fx.coord, "pool", "conversations", id);
function host(fx, args, lines = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [remote, ...args, "--config", fx.hostConfig], { env: { HOME: fx.userHome, PATH: process.env.PATH }, stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (b) => (out += b));
    for (const line of lines) child.stdin.write(line + "\n");
    child.on("close", (code) => resolve({ code, lines: out.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) }));
    if (!lines.length) child.stdin.end();
    else setTimeout(() => child.stdin.end(), 8000).unref();
  });
}
const envelope = (fx, runUuid, extra = {}) => JSON.stringify({
  schema: "codex-claude-pool-envelope/1", runUuid, profile: fx.name, bindingSha256: fx.host.profiles[fx.name].bindingSha256,
  conversationId: randomUUID(), turn: 1, session: null, prompt: "WRITE late.txt late", paperclipRunId: null, ...extra,
});

test("F1: a half-written control never kills the relay and a later complete answer is delivered", async (t) => {
  const fx = await poolFixture(t, { provider: "claude", transport: "local" });
  const pool = fx.coordinator();
  const s = await pool.start({ threadId: "thread-1", profile: fx.name, prompt: "ASK for a color" });
  const running = fx.run(fx.paperclip.startRun(s.issueId));
  let settled = false;
  running.then(() => (settled = true));
  await until(async () => (await pool.wait({ conversationId: s.conversationId, seconds: 0 })).question);
  const control = join(convDir(fx, s.conversationId), "control");
  await writeFile(join(control, "000000000000000-empty.json"), "");
  await writeFile(join(control, "000000000000001-partial.json"), '{"type":"ans');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(settled, false);
  assert.equal((await pool.status({ conversationId: s.conversationId })).state, "needs_input");
  await pool.answer({ conversationId: s.conversationId, threadId: s.threadId, questionId: "q1", source: "codex", reason: "Reversible fixture choice", answers: { "Color?": "Blue" } });
  assert.equal(await running, 0);
  assert.equal((await pool.status({ conversationId: s.conversationId })).result.summary, "answered Blue");
  assert.deepEqual((await readdir(control)).filter((n) => n.endsWith(".tmp")), []);
});

test("F2: an SSH failure before any receipt is settled by a host tombstone that refuses the late envelope", async (t) => {
  const fx = await poolFixture(t, { provider: "codex", transport: "ssh" });
  const pool = fx.coordinator();
  await writeFile(join(fx.state, "ssh-down"), "");
  const s = await pool.start({ threadId: "thread-2", profile: fx.name, prompt: "WRITE a.txt a" });
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 125);
  const lost = await pool.status({ conversationId: s.conversationId });
  assert.deepEqual([lost.state, lost.termination], ["transport_lost", "unknown"]);
  const ledger = () => readFile(join(fx.coord, "pool", "accounts", "acct-codex.json"), "utf8").then(JSON.parse);
  assert.equal((await ledger()).length, 1);
  // A real runner is its own process and has exited by now; this one shares the test's pid.
  const ledgerPath = join(fx.coord, "pool", "accounts", "acct-codex.json");
  await writeFile(ledgerPath, JSON.stringify((await ledger()).map((e) => ({ ...e, runnerIdentity: "exited runner" }))));
  assert.equal((await pool.reconcile())[0].state, "unknown"); // still unreachable: nothing settles
  assert.equal((await ledger()).length, 1);
  await rm(join(fx.state, "ssh-down"));
  const report = await pool.reconcile();
  assert.deepEqual(report.map((r) => r.state), ["terminated"]);
  assert.deepEqual(await ledger(), []);
  const { runUuid } = JSON.parse(await readFile(join(convDir(fx, s.conversationId), "turns", "1.run.json"), "utf8"));
  const late = await host(fx, ["run"], [envelope(fx, runUuid)]);
  assert.equal(late.code, 75);
  assert.deepEqual(late.lines.map((l) => [l.pool, l.category]), [["refused", "duplicate"]]);
  assert.equal((await fx.lines("codex-calls.jsonl")).length, 0);
  // Interleaving: an admission that already owns the receipt is never tombstoned.
  const live = randomBytes(16).toString("hex");
  await writeFile(join(fx.hostHome, "pool-runs", `${live}.json`), JSON.stringify({ runUuid: live, state: "admitting", termination: "pending", poolPid: process.pid, poolIdentity: execFileSync("ps", ["-p", String(process.pid), "-o", "lstart=", "-o", "pgid=", "-o", "uid="], { encoding: "utf8" }).trim() }));
  assert.deepEqual((await host(fx, ["reconcile", live])).lines.at(-1), { runUuid: live, state: "active" });
  assert.equal(JSON.parse(await readFile(join(fx.hostHome, "pool-runs", `${live}.json`), "utf8")).state, "admitting");
});

test("F3: a reservation error after the claim is recorded as refused, never left claimed and unrecorded", async (t) => {
  const fx = await poolFixture(t, { provider: "codex", transport: "local" });
  const pool = fx.coordinator();
  await mkdir(join(fx.coord, "pool", "accounts", "acct-codex.json"), { recursive: true });
  const s = await pool.start({ threadId: "thread-3", profile: fx.name, prompt: "WRITE a.txt a" });
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 75);
  const r = await pool.status({ conversationId: s.conversationId });
  assert.deepEqual([r.state, r.terminal, r.category, r.termination, r.disposition.state], ["refused", true, "runner_error", "not-started", "applied"]);
  assert.equal((await fx.lines("codex-calls.jsonl")).length, 0);
});

test("F4: a stop between claim and run record is persisted and the runner refuses to launch", async (t) => {
  const fx = await poolFixture(t, { provider: "codex", transport: "local" });
  const pool = fx.coordinator();
  const s = await pool.start({ threadId: "thread-4", profile: fx.name, prompt: "WRITE a.txt a" });
  const turns = join(convDir(fx, s.conversationId), "turns");
  await mkdir(join(turns, "1.claim"));
  const stopped = await pool.stop({ conversationId: s.conversationId });
  assert.deepEqual([stopped.stopping, stopped.paperclipCancel], [true, "no Paperclip run recorded yet"]);
  const controls = (await readdir(join(convDir(fx, s.conversationId), "control"))).filter((n) => n.endsWith(".json"));
  assert.equal(controls.length, 1);
  // The claiming runner then reaches its pre-launch check.
  await rm(join(turns, "1.claim"), { recursive: true });
  assert.equal(await fx.run(fx.paperclip.startRun(s.issueId)), 75);
  const r = await pool.status({ conversationId: s.conversationId });
  assert.deepEqual([r.state, r.category, r.termination], ["refused", "stopped", "not-started"]);
  assert.deepEqual(JSON.parse(await readFile(join(fx.coord, "pool", "accounts", "acct-codex.json"), "utf8")), []);
  assert.equal((await fx.lines("codex-calls.jsonl")).length, 0);
});

test("F5: a stop that arrives during host admission prevents the launch", async (t) => {
  const fx = await poolFixture(t, { provider: "codex", transport: "local" });
  const result = await host(fx, ["run"], [envelope(fx, randomBytes(16).toString("hex")), JSON.stringify({ type: "stop" })]);
  assert.equal(result.code, 75);
  assert.deepEqual(result.lines.filter((l) => l.pool === "refused").map((l) => l.category), ["stopped"]);
  assert.equal((await fx.lines("codex-calls.jsonl")).length, 0);
});

test("F6: an unreadable process identity is not proof that a runner is lost", async (t) => {
  if (process.getuid() === 0) return t.skip("root can signal every process");
  const rows = execFileSync("ps", ["-axo", "pid=,uid="], { encoding: "utf8" }).trim().split("\n").map((l) => l.trim().split(/\s+/).map(Number));
  const rootPid = rows.find(([pid, uid]) => uid === 0 && pid > 1)?.[0];
  if (!rootPid) return t.skip("no foreign process to probe");
  const fx = await poolFixture(t, { provider: "codex", transport: "local" });
  const pool = fx.coordinator();
  const s = await pool.start({ threadId: "thread-6", profile: fx.name, prompt: "WRITE a.txt a" });
  await atomic(join(convDir(fx, s.conversationId), "turns", "1.run.json"), { conversationId: s.conversationId, turn: 1, state: "running", finished: false, runnerPid: rootPid, runnerIdentity: "not readable here" });
  const r = await pool.status({ conversationId: s.conversationId });
  assert.deepEqual([r.state, r.terminal], ["running", false]);
});

test("F7: only the writing run's own marker settles an uncertain disposition; a board copy does not", async (t) => {
  const fx = await poolFixture(t, { provider: "codex", transport: "local" });
  const pool = fx.coordinator();
  const s = await pool.start({ threadId: "thread-7", profile: fx.name, prompt: "WRITE a.txt a" });
  fx.paperclip.fail = (method) => (method === "PATCH" ? "delay" : null);
  const runId = fx.paperclip.startRun(s.issueId);
  assert.equal(await fx.run(runId), 0);
  fx.paperclip.fail = null;
  await fx.paperclip.fetch(`http://127.0.0.1:3100/api/issues/${s.issueId}/comments`, { method: "POST", headers: {}, body: JSON.stringify({ body: `copied\n\n${dispositionMarker(s.conversationId, 1, runId)}` }) });
  assert.equal((await pool.reattach({ conversationId: s.conversationId })).disposition.state, "unknown");
  await assert.rejects(pool.followup({ conversationId: s.conversationId, threadId: s.threadId, prompt: "WRITE b.txt b" }), /status update is unconfirmed/);
  fx.paperclip.applyDelayed();
  assert.equal((await pool.reattach({ conversationId: s.conversationId })).disposition.state, "applied");
});

test("a duplicate answer is refused as a duplicate even after the question cleared, with no second effect", async (t) => {
  const fx = await poolFixture(t, { provider: "claude", transport: "local" });
  const pool = fx.coordinator();
  const s = await pool.start({ threadId: "thread-d", profile: fx.name, prompt: "ASK for a color" });
  const running = fx.run(fx.paperclip.startRun(s.issueId));
  await until(async () => (await pool.wait({ conversationId: s.conversationId, seconds: 0 })).question);
  await pool.answer({ conversationId: s.conversationId, threadId: s.threadId, questionId: "q1", source: "codex", reason: "Reversible fixture choice", answers: { "Color?": "Blue" } });
  // Deterministically past the question before the duplicate arrives.
  await until(async () => !(await pool.status({ conversationId: s.conversationId })).question);
  await assert.rejects(pool.answer({ conversationId: s.conversationId, threadId: s.threadId, questionId: "q1", source: "codex", reason: "again" }), /already answered/);
  assert.equal(await running, 0);
  const controls = (await readdir(join(convDir(fx, s.conversationId), "control"))).filter((n) => !n.endsWith(".tmp"));
  assert.equal(controls.length, 1);
  assert.equal((await fx.lines("claude-calls.jsonl")).length, 1);
});

test("fixture teardown stops and awaits a live run before deleting its state", async (t) => {
  const fx = await poolFixture(t, { provider: "claude", transport: "local" });
  const pool = fx.coordinator();
  const s = await pool.start({ threadId: "thread-t", profile: fx.name, prompt: "ASK and never get an answer" });
  const running = fx.run(fx.paperclip.startRun(s.issueId));
  await until(async () => (await pool.wait({ conversationId: s.conversationId, seconds: 0 })).question);
  // What t.after does when a test throws here: the run is drained before rm(root).
  assert.deepEqual(await fx.drain(), [124]);
  assert.equal(await running, 124);
  const done = await pool.status({ conversationId: s.conversationId });
  assert.deepEqual([done.state, done.termination], ["interrupted", "verified"]);
  const runs = await readdir(join(fx.hostHome, "runs"));
  const owned = JSON.parse(await readFile(join(fx.hostHome, "runs", runs[0], "process.json"), "utf8"));
  assert.deepEqual([owned.state, owned.interrupted], ["exited", true]);
  assert.throws(() => process.kill(owned.claudePid, 0), { code: "ESRCH" });
  assert.deepEqual(await fx.drain(), []);
});

test("host reconcile never treats an unreadable or unidentified admitting process as gone", async (t) => {
  const fx = await poolFixture(t, { provider: "codex", transport: "local" });
  const receipt = (runUuid, fields) => writeFile(join(fx.hostHome, "pool-runs", `${runUuid}.json`), JSON.stringify({ runUuid, state: "admitting", termination: "pending", ...fields }));
  await mkdir(join(fx.hostHome, "pool-runs"), { recursive: true });
  const unidentified = randomBytes(16).toString("hex");
  await receipt(unidentified, { poolPid: process.pid, poolIdentity: null });
  assert.deepEqual((await host(fx, ["reconcile", unidentified])).lines.at(-1), { runUuid: unidentified, state: "unknown" });
  if (process.getuid() !== 0) {
    const rows = execFileSync("ps", ["-axo", "pid=,uid="], { encoding: "utf8" }).trim().split("\n").map((l) => l.trim().split(/\s+/).map(Number));
    const rootPid = rows.find(([pid, uid]) => uid === 0 && pid > 1)?.[0];
    if (rootPid) {
      const unreadable = randomBytes(16).toString("hex");
      await receipt(unreadable, { poolPid: rootPid, poolIdentity: "recorded identity" });
      assert.deepEqual((await host(fx, ["reconcile", unreadable])).lines.at(-1), { runUuid: unreadable, state: "unknown" });
      assert.equal(JSON.parse(await readFile(join(fx.hostHome, "pool-runs", `${unreadable}.json`), "utf8")).termination, "pending");
    }
  }
  assert.equal(JSON.parse(await readFile(join(fx.hostHome, "pool-runs", `${unidentified}.json`), "utf8")).termination, "pending");
});
