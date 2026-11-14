import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { disableNetwork, doc, enableNetwork, getDoc, onSnapshot, runTransaction, setDoc } from "firebase/firestore";
import { claimTask, settleAttempt } from "../plugins/factory/src/fleet-claims.mjs";
import { answerQuestion, askQuestion, cancelTask, submitTask } from "../plugins/factory/src/fleet-mailbox.mjs";
import { publishArtifacts } from "../plugins/factory/src/fleet-artifacts.mjs";

test("Firestore races commit one claim and deliver the settled result to a listener", { timeout: 30000 }, async (t) => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(address ?? "", /^127\.0\.0\.1:[0-9]+$/, "Use a loopback Firestore emulator");
  const environment = await initializeTestEnvironment({
    projectId: "demo-factory-fleet",
    firestore: {
      host: "127.0.0.1",
      port: Number(address.split(":")[1]),
      rules: `rules_version = '2';
        service cloud.firestore {
          match /databases/{db}/documents/factoryTasks/{id} {
            allow get: if request.auth.uid == resource.data.contextId;
          }
        }`,
    },
  });
  t.after(() => environment.cleanup());
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const ref = (path) => doc(db, path);
    const adapter = { doc: ref, runTransaction: (fn) => runTransaction(db, fn) };
    const brief = {
      contextId: "controller", messageId: "brief", text: "Build the fixture", now: 100,
      launch: { eligibleSlots: ["studio"], workspaceKey: "checkout", source: {}, selection: {} },
    };
    const submitted = await submitTask(adapter, brief);
    const taskId = submitted.task.id;
    const task = ref(`factoryTasks/${taskId}`);
    assert.equal((await submitTask(adapter, brief)).task.id, taskId);
    await assert.rejects(submitTask(adapter, { ...brief, text: "Different brief" }), /already used/);
    await setDoc(ref("factorySlots/studio"), {
      hostId: "studio", available: true, capacity: 1, observedAt: 100,
    });
    const claim = { taskId, hostId: "studio", slotId: "studio", now: 100, leaseMs: 10, maxAgeMs: 10 };
    const attempts = await Promise.all([
      claimTask(adapter, { ...claim, attemptId: "90000000-0000-4000-8000-000000000001" }),
      claimTask(adapter, { ...claim, attemptId: "90000000-0000-4000-8000-000000000002" }),
    ]);
    assert.deepEqual(attempts.map((row) => row.reason ?? "granted").sort(), ["already-claimed", "granted"]);
    const winner = attempts.find((row) => row.attempt).attempt;
    assert.equal((await getDoc(ref("factorySlots/studio"))).data().attemptId, winner.id);
    assert.equal((await getDoc(ref("factoryWorkspaces/checkout"))).data().attemptId, winner.id);
    const question = { ...claim, attemptId: winner.id, questionId: "q", text: "Which color?" };
    assert.deepEqual(await askQuestion(adapter, question), { replay: false });
    assert.equal((await getDoc(task)).data().state, "TASK_STATE_INPUT_REQUIRED");
    const controller = environment.authenticatedContext("controller").firestore();
    const watchedTask = doc(controller, task.path);
    assert.equal((await getDoc(watchedTask)).data().questionId, "q");
    await disableNetwork(controller);
    const answer = { ...question, contextId: "controller", messageId: "answer", text: "Blue" };
    assert.deepEqual(await answerQuestion(adapter, { ...answer, questionId: "old" }), { reason: "stale-question" });
    await assert.rejects(answerQuestion(adapter, { ...answer, contextId: "other" }), /Unknown Factory task/);
    assert.deepEqual(await answerQuestion(adapter, answer), { replay: false });
    assert.deepEqual(await answerQuestion(adapter, answer), { replay: true });
    const persisted = await getDoc(ref(`factoryTasks/${taskId}/messages/answer`));
    assert.equal(persisted.data().text, "Blue");
    assert.equal(persisted.data().replyTo, "q");
    const outputDir = await mkdtemp(join(tmpdir(), "factory-firestore-"));
    t.after(() => rm(outputDir, { recursive: true, force: true }));
    await writeFile(join(outputDir, "result.txt"), "blue");
    const artifacts = await publishArtifacts({
      outputDir, files: ["result.txt"], taskId, attemptId: winner.id,
      async putObject({ objectName, bytes, ifGenerationMatch }) {
        assert.equal(objectName, `factory/${taskId}/${winner.id}/result.txt`);
        assert.equal(bytes.toString(), "blue");
        assert.equal(ifGenerationMatch, 0);
        return "9007199254740993";
      },
    });
    let unsubscribe;
    const observed = new Promise((resolve, reject) => {
      unsubscribe = onSnapshot(watchedTask, (snapshot) => {
        if (snapshot.data()?.state === "TASK_STATE_COMPLETED") resolve(snapshot.data().result);
      }, reject);
    });
    try {
      const result = { summary: "verified", artifacts };
      assert.equal(await settleAttempt(adapter, {
        ...claim, attemptId: winner.id, outcome: "TASK_STATE_COMPLETED", result, cleanupVerified: true,
      }), true);
      await enableNetwork(controller);
      assert.deepEqual(await observed, result);
    } finally {
      unsubscribe();
    }
    assert.deepEqual(await cancelTask(adapter, { ...brief, taskId }), { reason: "task-terminal" });
    const queued = await submitTask(adapter, { ...brief, messageId: "queued" });
    const cancellation = { contextId: "controller", taskId: queued.task.id, now: 101 };
    assert.deepEqual(await cancelTask(adapter, cancellation), { replay: false });
    assert.deepEqual(await cancelTask(adapter, cancellation), { replay: true });
    assert.equal((await getDoc(ref(`factoryTasks/${queued.task.id}`))).data().state, "TASK_STATE_CANCELED");
    const running = await submitTask(adapter, { ...brief, messageId: "running" });
    const runningClaim = { ...claim, taskId: running.task.id, attemptId: "c" };
    assert.equal((await claimTask(adapter, runningClaim)).attempt.id, "c");
    assert.deepEqual(await cancelTask(adapter, { ...cancellation, taskId: running.task.id }), { replay: false });
    assert.equal((await getDoc(ref("factorySlots/studio"))).data().attemptId, "c");
    const canceled = { ...runningClaim, outcome: "TASK_STATE_CANCELED", result: null };
    assert.equal(await settleAttempt(adapter, { ...canceled, cleanupVerified: false }), false);
    assert.equal((await getDoc(ref("factorySlots/studio"))).data().attemptId, "c");
    assert.equal(await settleAttempt(adapter, { ...canceled, cleanupVerified: true }), true);
    assert.equal((await getDoc(ref("factorySlots/studio"))).data().attemptId, null);
    assert.equal((await getDoc(ref(`factoryTasks/${running.task.id}`))).data().state, "TASK_STATE_CANCELED");
  });
});

test("authenticated fleet API isolates roles, wakes both clients and returns a private artifact", { timeout: 30000 }, async (t) => {
  const { createServer } = await import("node:http");
  const { readFile } = await import("node:fs/promises");
  const { once } = await import("node:events");
  const { createRequire } = await import("node:module");
  const requirePlugin = createRequire(new URL("../plugins/factory/package.json", import.meta.url));
  const { initializeApp, deleteApp } = requirePlugin("firebase-admin/app");
  const { getFirestore } = requirePlugin("firebase-admin/firestore");
  const { createFleetApi } = await import("../plugins/factory/src/fleet-api.mjs");
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(address ?? "", /^127\.0\.0\.1:[0-9]+$/);
  const projectId = "demo-factory-fleet";
  const environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: Number(address.split(":")[1]),
      rules: await readFile(new URL("../plugins/factory/firestore.fleet.rules", import.meta.url), "utf8"),
    },
  });
  t.after(() => environment.cleanup());
  await environment.clearFirestore();
  const app = initializeApp({ projectId }, "fleet-api-test");
  const db = getFirestore(app);
  t.after(async () => { await db.terminate(); await deleteApp(app); });
  const objects = new Map();
  const revision = "1".repeat(40);
  const config = {
    users: {
      pro: { role: "controller", projects: ["pilot", "git-source"] },
      stranger: { role: "controller", projects: ["pilot"] },
      studio: { role: "worker", hostId: "mac-studio", slotId: "studio" },
      other: { role: "worker", hostId: "other-mac", slotId: "other" },
    },
    projects: Object.fromEntries([["pilot", revision], ["git-source", "git"]].map(([project, policy]) => [project, {
      workspaceKey: `${project}-workspace`, eligibleSlots: ["studio"], revision: policy,
      selection: { provider: "codex", gateway: "fixture-gateway", model: "gpt-fixture" },
    }])),
  };
  let now = 1_000_000;
  const server = createServer(createFleetApi({
    db, config, clock: () => now,
    async verifyToken(token) {
      if (token === "invalid") throw new Error("Invalid token");
      return { uid: token };
    },
    objects: {
      async put(file, bytes) {
        const descriptor = { ...file, generation: "9007199254740993" };
        objects.set(file.objectName, { descriptor, bytes });
        return descriptor;
      },
      async metadata(objectName) { return objects.get(objectName)?.descriptor; },
      async download(artifact) {
        const stored = objects.get(artifact.objectName);
        assert.equal(artifact.generation, stored.descriptor.generation);
        return stored.bytes;
      },
    },
  })).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  async function call(user, op, body, status = 200) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1`, {
      method: "POST", headers: { Authorization: `Bearer ${user}` }, body: JSON.stringify({ op, ...body }),
    });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  }
  const input = { rootId: "desktop-root", project: "pilot", revision, messageId: "brief", text: "Make an artifact" };
  await call("invalid", "submit", input, 401);
  await call("unenrolled", "submit", input, 403);
  await call("studio", "submit", input, 403);
  await call("pro", "submit", { ...input, model: "not-enrolled" }, 403);
  await call("pro", "submit", { ...input, revision: "2".repeat(40) }, 403);
  const readiness = { rootId: input.rootId, project: input.project };
  await call("studio", "readiness", readiness, 403);
  await call("stranger", "readiness", { ...readiness, project: "git-source" }, 403);
  assert.equal((await call("pro", "readiness", readiness)).slots[0].placementCandidate, false);
  const studio = environment.authenticatedContext("studio").firestore();
  const signal = doc(studio, "factorySignals/studio");
  let off;
  const notified = new Promise((resolve, reject) => {
    off = onSnapshot(signal, (snapshot) => { if (snapshot.exists()) resolve(snapshot.data()); }, reject);
  });
  t.after(() => off());
  const { task } = await call("pro", "submit", input);
  assert.deepEqual(Object.keys(await notified), ["version"]);
  await assert.rejects(getDoc(doc(studio, "factorySignals/pro")), /permission/i);
  await assert.rejects(getDoc(doc(studio, `factoryTasks/${task.id}`)), /permission/i);
  await assert.rejects(setDoc(signal, { version: "forged" }), /permission/i);
  const scope = { rootId: input.rootId, taskId: task.id };
  await call("stranger", "get", scope, 404);
  await call("pro", "get", { ...scope, rootId: "other-root" }, 404);
  assert.deepEqual(await call("studio", "heartbeat", { available: true, capacity: 6000, hostId: "forged" }), { tasks: [task.id] });
  const getSlot = async () => (await call("pro", "readiness", readiness)).slots[0];
  assert.deepEqual((await getSlot()).quota, { status: "unknown" });
  const quota = { ...config.projects.pilot.selection, checkedAt: now, status: "available", secret: "redact" };
  await call("studio", "heartbeat", { available: true, capacity: 6000, quota: { ...quota, gateway: "foreign" } });
  assert.equal((await getSlot()).quota.status, "incompatible");
  await call("studio", "heartbeat", { available: true, capacity: 6000, quota });
  assert.deepEqual(await getSlot(), { slotId: "studio", hostId: "mac-studio",
    heartbeat: { observedAt: now, fresh: true, capacityMiB: 6000 }, busy: false,
    quota: { status: "available", checkedAt: now }, placementCandidate: true });
  const identity = { taskId: task.id, attemptId: "90000000-0000-4000-8000-000000000001" };
  const claim = await call("studio", "claim", identity);
  assert.equal(claim.attempt.hostId, "mac-studio");
  assert.equal((await getSlot()).placementCandidate, false);
  assert.equal((await getSlot()).busy, true);
  assert.deepEqual(await call("studio", "heartbeat", { available: true, capacity: 6000 }), { tasks: [] });
  assert.deepEqual((await getSlot()).quota, { status: "unknown" });
  await call("other", "inspect", identity, 404);
  const question = { ...identity, questionId: "question", text: "Which color?" };
  const pro = environment.authenticatedContext("pro").firestore();
  let offPro;
  const controllerWake = new Promise((resolve, reject) => {
    offPro = onSnapshot(doc(pro, "factorySignals/pro"), (snapshot) => {
      if (snapshot.exists()) resolve(snapshot.data());
    }, reject);
  });
  t.after(() => offPro());
  await call("studio", "question", question);
  assert.deepEqual(Object.keys(await controllerWake), ["version"]);
  assert.equal((await call("pro", "get", scope)).question.text, "Which color?");
  await call("pro", "answer", { ...scope, ...identity, questionId: "question", messageId: "answer", text: "Blue" });
  assert.equal((await call("studio", "inspect", identity)).answer.text, "Blue");
  const file = { ...identity, name: "result.txt", type: "text/plain", bytes: Buffer.from("blue").toString("base64") };
  await call("other", "upload", file, 404);
  const artifact = await call("studio", "upload", file);
  const admissionId = "90000000-0000-4000-8000-000000000002";
  const sessionId = "90000000-0000-4000-8000-000000000003";
  const timing = { source: "runner", startedAt: "2026-01-05T01:02:03.000Z", endedAt: "2026-01-05T01:02:04.000Z", durationMs: 1000, evidence: "synthetic guardian evidence" };
  const invocation = { launch: "session", admissionId, sessionId, timing };
  const finish = { ...identity, outcome: "TASK_STATE_COMPLETED", result: { summary: "Created", artifacts: [file.name] },
    cleanupVerified: true, admissionId, invocation };
  await call("studio", "finish", { ...finish, cleanupVerified: false }, 400);
  await call("studio", "finish", { ...finish, admissionId: sessionId }, 400);
  await call("other", "finish", finish, 404);
  assert.deepEqual(await call("studio", "finish", finish), { settled: true });
  assert.deepEqual(await call("studio", "finish", { ...finish, invocation: { ...invocation, sessionId: admissionId } }), { settled: true });
  const read = await call("pro", "get", scope);
  assert.deepEqual(read.receipt, { ...identity, ...invocation, state: "TASK_STATE_COMPLETED",
    hostId: "mac-studio", slotId: "studio", terminationVerified: true });
  await call("pro", "get", { ...scope, rootId: "other-root" }, 404);
  await call("stranger", "get", scope, 404);
  assert.equal((await call("studio", "inspect", identity)).receipt, undefined);
  assert.equal((await call("studio", "inspect", identity)).task.receipt, undefined);
  await assert.rejects(getDoc(doc(studio, `factoryReceipts/${task.id}`)), /permission/i);
  await assert.rejects(getDoc(doc(pro, `factoryReceipts/${task.id}`)), /permission/i);
  now += 45_001;
  assert.equal((await getSlot()).heartbeat.fresh, false);
  await call("studio", "heartbeat", { available: true, capacity: 6000, quota: { ...quota, checkedAt: now + 1 } });
  assert.equal((await getSlot()).quota.status, "unknown");
  await call("stranger", "download", { ...scope, name: file.name }, 404);
  assert.deepEqual(await call("pro", "download", { ...scope, name: file.name }), { artifact, bytes: file.bytes });
  const gitBrief = { ...input, project: "git-source", revision: "2".repeat(40), messageId: "git-brief" };
  await call("stranger", "submit", gitBrief, 403);
  await call("pro", "submit", { ...gitBrief, revision: "main" }, 400);
  const enrolled = await call("pro", "submit", gitBrief);
  assert.deepEqual(enrolled.task.source, { project: "git-source", revision: gitBrief.revision, checkout: "git" });
  assert.equal((await call("pro", "submit", gitBrief)).task.id, enrolled.task.id);
  const old = { ...identity, taskId: enrolled.task.id, attemptId: admissionId };
  assert.equal((await call("studio", "claim", old)).attempt.id, admissionId);
  await call("studio", "finish", { ...old, outcome: "TASK_STATE_COMPLETED", result: null, cleanupVerified: true });
  assert.equal((await call("pro", "get", { ...scope, taskId: enrolled.task.id })).receipt, undefined);
});
