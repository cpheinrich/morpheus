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
