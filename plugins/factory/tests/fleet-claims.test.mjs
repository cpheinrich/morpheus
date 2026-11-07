import assert from "node:assert/strict";
import { test } from "node:test";
import { claimTask, renewAttempt, settleAttempt } from "../src/fleet-claims.mjs";

// Transaction double. Concurrent callers deliberately start from the same
// snapshot. Losing transactions retry after any document they read changes.
function firestore(initial) {
  const docs = new Map(Object.entries(initial));
  return {
    docs,
    doc: (path) => path,
    async runTransaction(callback) {
      for (;;) {
        const reads = new Map();
        const writes = [];
        const result = await callback({
          get(ref) {
            const original = docs.get(ref);
            reads.set(ref, original);
            return { data: () => structuredClone(original) };
          },
          update(ref, update) {
            writes.push(() => docs.set(ref, applyUpdate(docs.get(ref), update)));
          },
          set(ref, value) { writes.push(() => docs.set(ref, value)); },
          delete(ref) { writes.push(() => docs.delete(ref)); },
        });
        if ([...reads].some(([ref, prior]) => docs.get(ref) !== prior)) continue;
        writes.forEach((write) => write());
        return result;
      }
    },
  };
}

function applyUpdate(previous, update) {
  if ("attempt.leaseUntil" in update) {
    return { ...previous, attempt: { ...previous.attempt, leaseUntil: update["attempt.leaseUntil"] } };
  }
  return { ...previous, ...update };
}

const task = {
  state: "TASK_STATE_SUBMITTED",
  eligibleSlots: ["pro", "studio"],
  workspaceKey: "shared-worktree",
};
const slot = { available: true, capacity: 1, observedAt: 100 };
const request = {
  taskId: "task-1", attemptId: "attempt-1", hostId: "studio", slotId: "studio",
  now: 100, maxAgeMs: 20, leaseMs: 30,
};

function fixture() {
  return firestore({
    "factoryTasks/task-1": task,
    "factoryTasks/task-2": task,
    "factorySlots/pro": { ...slot, hostId: "pro" },
    "factorySlots/studio": { ...slot, hostId: "studio", capacity: 2 },
  });
}

test("best eligible host wins the task and a simultaneous claimant cannot also launch", async () => {
  const db = fixture();
  const [worse, first, concurrent] = await Promise.all([
    claimTask(db, { ...request, hostId: "pro", slotId: "pro", attemptId: "pro-1" }),
    claimTask(db, request),
    claimTask(db, { ...request, attemptId: "studio-2" }),
  ]);
  assert.deepEqual(worse, { reason: "not-preferred" });
  assert.deepEqual(first, {
    attempt: { id: "attempt-1", hostId: "studio", slotId: "studio", leaseUntil: 130 },
    replay: false,
  });
  assert.deepEqual(concurrent, { reason: "already-claimed" });
  assert.deepEqual(await claimTask(db, request), { ...first, replay: true });
  assert.equal(db.docs.get("factorySlots/studio").attemptId, "attempt-1");
  assert.deepEqual(db.docs.get("factoryWorkspaces/shared-worktree"), {
    attemptId: "attempt-1", taskId: "task-1",
  });
});

test("lease expiry and uncertain cleanup preserve ownership until verified settlement", async () => {
  const db = fixture();
  await claimTask(db, request);
  const fallback = { ...request, hostId: "pro", slotId: "pro", attemptId: "attempt-2", taskId: "task-2" };
  const result = { summary: "done" };
  const settlement = { ...request, outcome: "TASK_STATE_COMPLETED", result };
  assert.equal(await renewAttempt(db, { ...request, now: 130 }), false);
  assert.deepEqual(await claimTask(db, { ...request, now: 130 }), { reason: "lease-expired" });
  assert.equal(await settleAttempt(db, { ...settlement, attemptId: "old", cleanupVerified: true }), false);
  assert.equal(await settleAttempt(db, { ...settlement, cleanupVerified: false }), false);
  assert.equal(db.docs.get("factoryTasks/task-1").state, "TASK_STATE_UNSPECIFIED");
  assert.deepEqual(await claimTask(db, request), { reason: "attempt-held" });
  assert.deepEqual(await claimTask(db, fallback), { reason: "workspace-busy" });
  assert.equal(await settleAttempt(db, { ...settlement, cleanupVerified: true }), true);
  assert.equal(db.docs.get("factorySlots/studio").attemptId, null);
  assert.deepEqual(db.docs.get("factoryTasks/task-1").result, result);
  assert.equal(db.docs.get("factoryTasks/task-1").state, "TASK_STATE_COMPLETED");
  assert.equal(db.docs.has("factoryWorkspaces/shared-worktree"), false);
});

test("a stale or busy preferred host leaves the fresh runner eligible", async () => {
  const db = fixture();
  db.docs.set("factorySlots/studio", { ...slot, hostId: "studio", observedAt: 79, capacity: 2 });
  const fallback = { ...request, hostId: "pro", slotId: "pro" };
  assert.equal((await claimTask(db, fallback)).attempt.hostId, "pro");
});
