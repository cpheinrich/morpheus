import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { poolFixture } from "./pool-fixtures.mjs";
import { hqPath, hqProfileDigest, operationPath } from "../src/pool-hq.mjs";
import { loadPool } from "../src/pool-config.mjs";
import { projectIdentity, atomic } from "../src/store.mjs";
import { claimPath, conversationDir, controlDir, readConversation, runPath, sessionPath, turnPath } from "../src/pool-store.mjs";

async function setup(t) {
  const fx = await poolFixture(t, { provider: "claude", transport: "local" });
  const pool = fx.coordinator();
  pool.manager.snapshot = async () => { throw new Error("HQ must never synthesize a Codex task"); };
  const parsed = await loadPool();
  const mapping = {
    version: 1, connectorId: "mbp-controller", companyId: fx.pool.controller.companyId,
    controller: { ...fx.pool.controller, projectId: null },
    profiles: { [fx.name]: { project: (await projectIdentity(fx.profile.workspace)).project, profileSha256: hqProfileDigest(parsed.profiles[fx.name]) } },
  };
  delete mapping.controller.tokenFile;
  await writeFile(hqPath(), JSON.stringify(mapping), { mode: 0o600 });
  const base = { connectorId: mapping.connectorId, companyId: mapping.companyId, actor: { uid: "human-admin", role: "admin", kind: "user" } };
  const call = (action, args = {}) => pool.manager.dispatch(`hq.${action}`, { ...base, ...args });
  const start = (prompt = "hello") => call("start", { operationId: randomUUID(), profile: fx.name, prompt });
  return { ...fx, poolConfig: fx.pool, pool, mapping, base, call, start };
}
async function finish(c, turn = 1) {
  await atomic(runPath(c, turn), { state: "completed", finished: true, termination: "verified", result: { outcome: "completed", summary: "done" } });
}

test("HQ journals a scoped start before Paperclip and retries recover the same identity without desktop snapshots", async (t) => {
  const fx = await setup(t);
  const id = randomUUID();
  let journal;
  fx.paperclip.fail = (method, path) => {
    if (method === "POST" && /\/issues$/.test(path)) {
      // Synchronous hook observes the already-written journal with the fake upstream.
      journal = JSON.parse(readFileSync(operationPath(id), "utf8"));
      return "throw-after";
    }
  };
  const args = { operationId: id, profile: fx.name, prompt: "hello" };
  const first = await fx.call("start", args);
  const atEffect = await journal;
  assert.deepEqual([atEffect.operationId, atEffect.conversationId, atEffect.turn, atEffect.state], [id, first.work.conversationId, 1, "applying"]);
  assert.equal(first.work.submission, "unknown");
  assert.equal(first.work.terminal, false);
  const stored = await readConversation(first.work.conversationId);
  assert.equal(stored.threadId, null);
  assert.deepEqual(stored.hq.actor, fx.base.actor);
  fx.paperclip.fail = null;
  const second = await fx.call("start", args);
  assert.equal(second.work.conversationId, first.work.conversationId);
  const recovered = await fx.call("operation", { operationId: id });
  assert.equal(recovered.operation.turn, 1);
  assert.equal(recovered.work.submission, "submitted");
  assert.equal(fx.paperclip.count("POST", /\/issues$/), 1);
  await assert.rejects(fx.call("start", { ...args, prompt: "changed" }), /different payload/);
  await assert.rejects(fx.call("start", { ...args, prompt: "hello " }), /different payload/);
  assert.equal(fx.paperclip.count("POST", /\/issues$/), 1);
});

test("HQ rejects every read/control outside the mapped company and refuses profile/controller drift", async (t) => {
  const fx = await setup(t);
  const started = await fx.start();
  const conversationId = started.work.conversationId;
  for (const [action, args] of [
    ["status", { conversationId }], ["wait", { conversationId, seconds: 0 }], ["logs", { conversationId }],
    ["reattach", { conversationId }], ["operation", { operationId: started.operation.operationId }],
    ["stop", { conversationId, operationId: randomUUID() }],
    ["answer", { conversationId, operationId: randomUUID(), questionId: "q" }],
    ["followup", { conversationId, operationId: randomUUID(), prompt: "next" }], ["profiles", {}],
  ]) await assert.rejects(fx.call(action, { ...args, companyId: randomUUID() }), /scope refused/);
  await assert.rejects(fx.call("status", { conversationId, actor: { ...fx.base.actor, role: "employee" } }));
  await assert.rejects(fx.call("start", { operationId: randomUUID(), profile: fx.name, prompt: "override", model: "other" }));
  await fx.writePool({ ...fx.poolConfig, controller: { ...fx.poolConfig.controller, projectId: randomUUID() } });
  await assert.rejects(fx.call("status", { conversationId }), /controller identity changed/);
  await fx.writePool({ ...fx.poolConfig, profiles: { ...fx.profiles, [fx.name]: { ...fx.profile, effort: "high" } } });
  await assert.rejects(fx.call("status", { conversationId }), /profile is not mapped or changed/);
  assert.equal(fx.paperclip.count("POST", /\/issues$/), 1);
});

test("HQ controls retain the actual actor, refuse agent permission approval, and journal follow-up turn before effect", async (t) => {
  const fx = await setup(t);
  const first = await fx.start();
  const conversationId = first.work.conversationId;
  await mkdir(claimPath(conversationId, 1));
  await atomic(runPath(conversationId, 1), { state: "running", finished: false, question: { id: "permission", toolName: "Bash", input: { command: "echo hi" } } });
  const denied = await fx.call("answer", { conversationId, questionId: "permission", operationId: randomUUID(), reason: "Routine clarification only", actor: { ...fx.base.actor, uid: "agent-1", kind: "agent" } });
  assert.equal(denied.operation.state, "unknown");
  assert.equal((await fx.pool.status({ conversationId })).supervisionReplies, 0);
  const answered = await fx.call("answer", { conversationId, questionId: "permission", operationId: randomUUID(), allow: true });
  assert.equal(answered.operation.state, "receipted");
  const controls = await (await import("node:fs/promises")).readdir(controlDir(conversationId));
  const control = JSON.parse(await readFile(join(controlDir(conversationId), controls[0]), "utf8"));
  assert.deepEqual(control.actor, fx.base.actor);
  assert.equal(control.message.response.response.behavior, "allow");
  await finish(conversationId);
  const id = randomUUID();
  let before;
  fx.paperclip.fail = (method, path) => {
    if (method === "POST" && /\/comments$/.test(path)) before = JSON.parse(readFileSync(operationPath(id), "utf8"));
  };
  const nextArgs = { conversationId, operationId: id, prompt: "next" };
  const next = await fx.call("followup", nextArgs);
  assert.equal((await before).turn, 2);
  assert.equal(next.work.turn, 2);
  assert.equal(next.work.terminal, false);
  assert.equal((await fx.call("followup", nextArgs)).operation.turn, 2);
  assert.equal(fx.paperclip.count("POST", /\/comments$/), 1);
  const turn = JSON.parse(await readFile(turnPath(conversationId, 2), "utf8"));
  assert.deepEqual(turn.actor, fx.base.actor);
  assert.equal(turn.coordinatorThreadId, null);
});

test("HQ stop receipt is not native completion; projected status/logs exclude native identities", async (t) => {
  const fx = await setup(t);
  const first = await fx.start();
  const conversationId = first.work.conversationId;
  await mkdir(claimPath(conversationId, 1));
  await atomic(runPath(conversationId, 1), { state: "running", finished: false, paperclipRunId: randomUUID(), runUuid: randomUUID(), remote: { hostId: "/private/host" }, observed: { nativeSession: "secret" } });
  await atomic(sessionPath(conversationId), { session: "secret-session" });
  const stopped = await fx.call("stop", { conversationId, operationId: randomUUID() });
  assert.equal(stopped.operation.state, "receipted");
  assert.equal(stopped.work.stopRequested, true);
  assert.equal(stopped.work.stopped, false);
  assert.equal(stopped.work.terminal, false);
  const text = JSON.stringify(stopped);
  for (const key of ["nativeSession", "remoteRun", "paperclipRunId", "threadId", "/private/host", "secret-session", "observed"])
    assert.equal(text.includes(key), false, key);
  const run = JSON.parse(await readFile(runPath(conversationId, 1), "utf8"));
  fx.paperclip.logs.set(run.paperclipRunId, JSON.stringify({ stream: "stdout", chunk: JSON.stringify({ pool: "receipt", state: "cancelled", termination: "verified", session: "secret-session", hostPath: "/private/host" }) + "\n" }) + "\n");
  const logs = await fx.call("logs", { conversationId });
  assert.deepEqual(logs.lines, [{ pool: "receipt", state: "cancelled", termination: "verified" }]);
  await atomic(runPath(conversationId, 1), { ...run, state: "cancelled", finished: true, termination: "verified" });
  assert.equal((await fx.call("status", { conversationId })).work.stopped, true);
});

test("HQ cannot read desktop conversations, replay after restart cannot repost, and generic Manager methods refuse", async (t) => {
  const fx = await setup(t);
  const id = randomUUID();
  const args = { operationId: id, profile: fx.name, prompt: "hello" };
  const first = await fx.call("start", args);
  const conversationId = first.work.conversationId;
  const c = await readConversation(conversationId);
  await atomic(join(conversationDir(conversationId), "conversation.json"), { ...c, hq: null });
  await assert.rejects(fx.call("status", { conversationId }), /outside this HQ mapping/);
  await atomic(join(conversationDir(conversationId), "conversation.json"), c);
  const restarted = fx.coordinator().manager;
  await restarted.dispatch("hq.start", { ...fx.base, ...args });
  assert.equal(fx.paperclip.count("POST", /\/issues$/), 1);
  await assert.rejects(fx.call("config", {}), /Unknown HQ pool operation/);
  await assert.rejects(fx.call("shutdown", {}), /Unknown HQ pool operation/);
});


test("desktop and HQ starts share allocation admission before either can journal a second turn", async (t) => {
  const fx = await setup(t);
  let release, entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const reached = new Promise((resolve) => { entered = resolve; });
  const original = fx.pool.assertProfileIdle.bind(fx.pool);
  fx.pool.assertProfileIdle = async (...args) => { entered(); await gate; return original(...args); };
  const first = fx.start();
  await reached;
  try {
    await assert.rejects(fx.pool.start({ threadId: "real-desktop-task", profile: fx.name, prompt: "racing start" }), /Another pool turn is being allocated/);
  } finally { release(); }
  assert.equal((await first).work.state, "queued");
  assert.equal(fx.paperclip.count("POST", /\/issues$/), 1);
});

test("a crash after journaling but before upstream submission remains observable and never reposts", async (t) => {
  const fx = await setup(t);
  const args = { operationId: randomUUID(), profile: fx.name, prompt: "recover exact intent" };
  fx.pool.submitIssue = async () => { throw new Error("simulated process failure before upstream"); };
  const first = await fx.call("start", args);
  assert.equal(first.operation.state, "unknown");
  assert.equal(first.work.state, "submission_unknown");
  const second = await fx.call("start", args);
  assert.equal(second.work.conversationId, first.work.conversationId);
  assert.equal(second.operation.turn, 1);
  assert.equal(fx.paperclip.count("POST", /\/issues$/), 0);
});

test("desktop and HQ follow-ups on separate conversations share one profile allocation guard", async (t) => {
  const fx = await setup(t);
  const hq = await fx.start();
  await finish(hq.work.conversationId);
  fx.pool.manager.snapshot = async () => ({ cwd: fx.profile.workspace, model: "gpt-5.6-sol", reasoningEffort: "medium", sandbox: { type: "dangerFullAccess" }, approvalPolicy: "never" });
  const desktop = await fx.pool.start({ threadId: "desktop-fixture-task", profile: fx.name, prompt: "desktop first" });
  await finish(desktop.conversationId);
  let release, entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const reached = new Promise((resolve) => { entered = resolve; });
  const original = fx.pool.continueTurn.bind(fx.pool);
  fx.pool.continueTurn = async (...args) => { entered(); await gate; return original(...args); };
  const next = fx.call("followup", { conversationId: hq.work.conversationId, operationId: randomUUID(), prompt: "HQ continuation" });
  await reached;
  try {
    await assert.rejects(fx.pool.followup({ conversationId: desktop.conversationId, threadId: "desktop-fixture-task", prompt: "racing desktop continuation" }), /Another pool turn is being allocated/);
  } finally { release(); }
  assert.equal((await next).work.turn, 2);
  assert.equal((await fx.pool.status({ conversationId: desktop.conversationId })).turn, 1);
  assert.equal(fx.paperclip.count("POST", /\/comments$/), 1);
});
