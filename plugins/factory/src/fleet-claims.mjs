import { receiptPath } from "./fleet-receipt.mjs";
import { taskQueueKeys } from "./fleet-mailbox.mjs";
import { quotaStatus } from "./fleet-quota.mjs";

export const legacyLeaseMs = 60_000;
export const leaseMs = 120_000;

// These transactions run behind Factory's trusted operations. Callers derive
// host identity, workspace keys and eligibility from enrollment, never from a
// worker-supplied task message.
const taskPath = (id) => `factoryTasks/${id}`;
const slotPath = (id) => `factorySlots/${id}`;
const workspacePath = (id) => `factoryWorkspaces/${id}`;

async function read(transaction, ref) {
  return (await transaction.get(ref)).data();
}

export function freshHeartbeat(slot, now, maxAgeMs) {
  return Number.isFinite(slot?.observedAt) && slot.observedAt <= now && now - slot.observedAt <= maxAgeMs;
}

export function available(slot, now, maxAgeMs) {
  return freshHeartbeat(slot, now, maxAgeMs) && slot.available === true && !slot.attemptId &&
    Number.isSafeInteger(slot.capacity) && slot.capacity > 0;
}

async function preferredSlot(db, transaction, task, now, maxAgeMs) {
  const candidates = await Promise.all(task.eligibleSlots.map(async (id) => ({
    id,
    slot: await read(transaction, db.doc(slotPath(id))),
  })));
  return candidates
    .filter(({ slot }) => available(slot, now, maxAgeMs) && matchesClaudeQuota(slot, task.selection, now))
    .sort((a, b) => b.slot.capacity - a.slot.capacity || a.id.localeCompare(b.id))[0];
}

function matchesClaudeQuota(slot, selection, now) {
  return selection?.provider !== "claude" || quotaStatus(slot.quota, selection, now).status === "available";
}

export async function fleetQueueReason(db, task, now, maxAgeMs) {
  const [workspace, ...slots] = await Promise.all([
    db.doc(workspacePath(task.workspaceKey)).get(),
    ...task.eligibleSlots.map(id => db.doc(slotPath(id)).get()),
  ]);
  if (workspace.data()?.attemptId) return "workspace-busy";
  const idle = slots.map(doc => doc.data()).filter(slot => available(slot, now, maxAgeMs));
  if (!idle.length) return "worker-unavailable";
  const statuses = idle.map(slot => quotaStatus(slot.quota, task.selection, now).status);
  if (statuses.includes("available")) return "awaiting-worker";
  return statuses.includes("limited") ? "quota-limited" : "quota-unavailable";
}

export function claimTask(db, {
  taskId, attemptId, slotId, hostId, now, leaseMs, maxAgeMs,
}) {
  return db.runTransaction(async (transaction) => {
    const taskRef = db.doc(taskPath(taskId));
    const task = await read(transaction, taskRef);
    if (!task) return { reason: "unknown-task" };
    const prior = task.attempt;
    if (prior?.id === attemptId && prior.hostId === hostId && prior.slotId === slotId) {
      if (prior.leaseUntil <= now) return { reason: "lease-expired" };
      if (task.state !== "TASK_STATE_WORKING" || task.cancelRequestedAt != null)
        return { reason: "attempt-held" };
      return { attempt: prior, replay: true };
    }
    if (task.state !== "TASK_STATE_SUBMITTED" || prior) return { reason: "already-claimed" };

    const winner = await preferredSlot(db, transaction, task, now, maxAgeMs);
    if (winner?.id !== slotId || winner.slot.hostId !== hostId) return { reason: "not-preferred" };
    const workspaceRef = db.doc(workspacePath(task.workspaceKey));
    if ((await read(transaction, workspaceRef))?.attemptId) return { reason: "workspace-busy" };

    const attempt = { id: attemptId, hostId, slotId, leaseUntil: now + leaseMs };
    transaction.update(taskRef, { state: "TASK_STATE_WORKING", attempt, queuedSlots: [] });
    transaction.update(db.doc(slotPath(slotId)), { attemptId, lastProvider: task.selection?.provider ?? "codex" });
    transaction.set(workspaceRef, { attemptId, taskId });
    return { attempt, replay: false };
  });
}

export function renewAttempt(db, { taskId, attemptId, hostId, now, leaseMs }) {
  return db.runTransaction(async (transaction) => {
    const ref = db.doc(taskPath(taskId));
    const task = await read(transaction, ref);
    if (!ownsAttempt(task, attemptId, hostId)) return false;
    if (task.attempt.leaseUntil <= now || task.cancelRequestedAt != null) return false;
    transaction.update(ref, { "attempt.leaseUntil": Math.max(task.attempt.leaseUntil, now + leaseMs) });
    return true;
  });
}

function ownsAttempt(task, attemptId, hostId) {
  return task?.attempt?.id === attemptId && task.attempt.hostId === hostId;
}

// An expired lease indicates lost contact. It cannot free a slot or worktree.
// A trusted runner supplies terminal cleanup evidence before releasing either.
export function settleAttempt(db, { taskId, attemptId, hostId, outcome, result, cleanupVerified, invocation }) {
  if (!["TASK_STATE_COMPLETED", "TASK_STATE_FAILED", "TASK_STATE_CANCELED"].includes(outcome))
    throw new Error("Invalid terminal task outcome");
  return db.runTransaction(async (transaction) => {
    const taskRef = db.doc(taskPath(taskId));
    const task = await read(transaction, taskRef);
    if (!ownsAttempt(task, attemptId, hostId)) return false;
    if (cleanupVerified !== true) {
      transaction.update(taskRef, { state: "TASK_STATE_UNSPECIFIED" });
      return false;
    }
    const slotRef = db.doc(slotPath(task.attempt.slotId));
    const workspaceRef = db.doc(workspacePath(task.workspaceKey));
    const [slot, workspace] = await Promise.all([
      read(transaction, slotRef),
      read(transaction, workspaceRef),
    ]);
    if (slot?.attemptId !== attemptId || slot.hostId !== hostId) return false;
    if (workspace?.attemptId !== attemptId || workspace.taskId !== taskId) return false;
    const state = task.cancelRequestedAt != null ? "TASK_STATE_CANCELED" : outcome;
    const delivered = state === "TASK_STATE_CANCELED" ? canceledResult(outcome, result) : result;
    transaction.update(taskRef, { state, result: delivered, attempt: null, lastAttempt: task.attempt });
    if (invocation) {
      transaction.set(db.doc(receiptPath(taskId)), {
        ...invocation, taskId, attemptId, hostId, slotId: task.attempt.slotId,
        state, terminationVerified: true, ...(delivered?.diagnosticCode ? { diagnosticCode: delivered.diagnosticCode } : {}), source: task.source ?? null, selection: task.selection ?? null,
      });
    }
    transaction.update(slotRef, { attemptId: null });
    transaction.delete(workspaceRef);
    return true;
  });
}

// A still-owned reservation that has never started inference can release
// both leases after a fresh quota failure. The slot remembers this release
// for a lost reply, even if another host has already reclaimed the task.
export function requeueUnstartedTask(db, { taskId, attemptId, hostId, slotId, invocation }) {
  return db.runTransaction(async transaction => {
    const slotRef = db.doc(slotPath(slotId));
    const slot = await read(transaction, slotRef);
    if (slot?.hostId !== hostId) return false;
    if (slot.requeued?.taskId === taskId && slot.requeued.attemptId === attemptId) return true;
    const taskRef = db.doc(taskPath(taskId));
    const task = await read(transaction, taskRef);
    if (!ownsAttempt(task, attemptId, hostId) || task.attempt.slotId !== slotId || slot.attemptId !== attemptId) return false;
    if (task.selection?.provider !== "claude" || task.questionId || task.answerId || task.state !== "TASK_STATE_WORKING") return false;
    const workspaceRef = db.doc(workspacePath(task.workspaceKey));
    const workspace = await read(transaction, workspaceRef);
    if (workspace?.attemptId !== attemptId || workspace.taskId !== taskId) return false;
    const state = task.cancelRequestedAt != null ? "TASK_STATE_CANCELED" : "TASK_STATE_SUBMITTED";
    const queuedSlots = state === "TASK_STATE_SUBMITTED" ? taskQueueKeys(task.eligibleSlots, task.selection) : [];
    transaction.update(taskRef, { state, queuedSlots, attempt: null, lastAttempt: task.attempt });
    transaction.update(slotRef, { attemptId: null, available: false, requeued: { taskId, attemptId } });
    transaction.set(db.doc(receiptPath(taskId)), { ...invocation, taskId, attemptId, hostId, slotId, state, terminationVerified: true, selection: task.selection, source: task.source });
    transaction.delete(workspaceRef);
    return true;
  });
}

function canceledResult(outcome, result) {
  return outcome === "TASK_STATE_CANCELED" && result ? { summary: result.summary } : null;
}
