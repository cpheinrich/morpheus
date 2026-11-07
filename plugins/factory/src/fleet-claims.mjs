// These transactions run behind Factory's trusted operations. Callers derive
// host identity, workspace keys and eligibility from enrollment, never from a
// worker-supplied task message.
const taskPath = (id) => `factoryTasks/${id}`;
const slotPath = (id) => `factorySlots/${id}`;
const workspacePath = (id) => `factoryWorkspaces/${id}`;

async function read(transaction, ref) {
  return (await transaction.get(ref)).data();
}

function available(slot, now, maxAgeMs) {
  return slot?.available === true && !slot.attemptId &&
    Number.isSafeInteger(slot.capacity) && slot.capacity > 0 &&
    Number.isFinite(slot.observedAt) && slot.observedAt <= now &&
    now - slot.observedAt <= maxAgeMs;
}

async function preferredSlot(db, transaction, eligibleSlots, now, maxAgeMs) {
  const candidates = await Promise.all(eligibleSlots.map(async (id) => ({
    id,
    slot: await read(transaction, db.doc(slotPath(id))),
  })));
  return candidates
    .filter(({ slot }) => available(slot, now, maxAgeMs))
    .sort((a, b) => b.slot.capacity - a.slot.capacity || a.id.localeCompare(b.id))[0];
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

    const winner = await preferredSlot(db, transaction, task.eligibleSlots, now, maxAgeMs);
    if (winner?.id !== slotId || winner.slot.hostId !== hostId) return { reason: "not-preferred" };
    const workspaceRef = db.doc(workspacePath(task.workspaceKey));
    if ((await read(transaction, workspaceRef))?.attemptId) return { reason: "workspace-busy" };

    const attempt = { id: attemptId, hostId, slotId, leaseUntil: now + leaseMs };
    transaction.update(taskRef, { state: "TASK_STATE_WORKING", attempt });
    transaction.update(db.doc(slotPath(slotId)), { attemptId });
    transaction.set(workspaceRef, { attemptId, taskId });
    return { attempt, replay: false };
  });
}

export function renewAttempt(db, { taskId, attemptId, hostId, now, leaseMs }) {
  return db.runTransaction(async (transaction) => {
    const ref = db.doc(taskPath(taskId));
    const task = await read(transaction, ref);
    if (!ownsAttempt(task, attemptId, hostId)) return false;
    if (task.attempt.leaseUntil <= now) return false;
    transaction.update(ref, { "attempt.leaseUntil": now + leaseMs });
    return true;
  });
}

function ownsAttempt(task, attemptId, hostId) {
  return task?.attempt?.id === attemptId && task.attempt.hostId === hostId;
}

// An expired lease indicates lost contact. It cannot free a slot or worktree.
// A trusted runner supplies terminal cleanup evidence before releasing either.
export function settleAttempt(db, { taskId, attemptId, hostId, outcome, result, cleanupVerified }) {
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
    transaction.update(taskRef, { state, result, attempt: null, lastAttempt: task.attempt });
    transaction.update(slotRef, { attemptId: null });
    transaction.delete(workspaceRef);
    return true;
  });
}
