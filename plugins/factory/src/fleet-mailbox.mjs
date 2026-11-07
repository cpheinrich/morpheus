import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const taskPath = (id) => `factoryTasks/${id}`;
const messagePath = (taskId, messageId) => `${taskPath(taskId)}/messages/${messageId}`;
const identifier = /^[A-Za-z0-9_-]{1,128}$/;

function assertId(value) {
  if (typeof value !== "string" || !identifier.test(value)) throw new Error("Invalid Factory identity");
}

function assertText(value) {
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value) > 64 * 1024)
    throw new Error("Factory messages must have between 1 and 65536 bytes of text");
}

async function data(transaction, ref) {
  return (await transaction.get(ref)).data();
}

function matchContext(task, contextId) {
  if (task?.contextId !== contextId) throw new Error("Unknown Factory task");
}

// This boundary takes the authenticated controller's context and a launch
// spec resolved by the service from a registered project and exact revision.
export function submitTask(db, { contextId, messageId, text, launch, now }) {
  assertId(contextId);
  assertId(messageId);
  assertText(text);
  const { eligibleSlots, workspaceKey, source, selection } = launch;
  if (!Array.isArray(eligibleSlots) || !eligibleSlots.length || eligibleSlots.length > 16)
    throw new Error("Factory requires between one and sixteen eligible slots");
  for (const value of [workspaceKey, ...eligibleSlots]) assertId(value);
  const spec = { eligibleSlots, workspaceKey, source, selection };
  const submissionId = createHash("sha256").update(contextId).update("\0").update(messageId).digest("hex");
  const submission = db.doc(`factorySubmissions/${submissionId}`);
  const id = randomUUID();
  return db.runTransaction(async (transaction) => {
    const prior = await data(transaction, submission);
    if (prior) {
      const task = await data(transaction, db.doc(taskPath(prior.taskId)));
      matchContext(task, contextId);
      if (task.brief.text !== text || !isDeepStrictEqual(prior.launch, spec))
        throw new Error("Message ID already used for a different brief");
      return { task, replay: true };
    }
    const brief = { messageId, role: "ROLE_USER", text, createdAt: now };
    const task = { ...spec, id, contextId, brief, state: "TASK_STATE_SUBMITTED", createdAt: now };
    transaction.set(db.doc(taskPath(id)), task);
    transaction.set(submission, { taskId: id, launch: spec });
    return { task, replay: false };
  });
}

export function askQuestion(db, { taskId, attemptId, hostId, questionId, text, now }) {
  for (const value of [taskId, attemptId, hostId, questionId]) assertId(value);
  assertText(text);
  return db.runTransaction(async (transaction) => {
    const taskRef = db.doc(taskPath(taskId));
    const task = await data(transaction, taskRef);
    const attempt = task?.attempt;
    if (attempt?.id !== attemptId || attempt.hostId !== hostId || attempt.leaseUntil <= now)
      return { reason: "stale-attempt" };
    if (task.cancelRequestedAt != null) return { reason: "cancel-requested" };
    const ref = db.doc(messagePath(taskId, questionId));
    const previous = await data(transaction, ref);
    if (previous) {
      if (previous.role !== "ROLE_AGENT" || previous.attemptId !== attemptId || previous.text !== text)
        throw new Error("Message ID already used for a different question");
      return { replay: true };
    }
    if (task.state !== "TASK_STATE_WORKING") return { reason: "task-not-working" };
    transaction.set(ref, { messageId: questionId, role: "ROLE_AGENT", attemptId, text, createdAt: now });
    transaction.update(taskRef, { state: "TASK_STATE_INPUT_REQUIRED", questionId, answerId: null });
    return { replay: false };
  });
}

export function answerQuestion(db, { contextId, taskId, attemptId, questionId, messageId, text, now }) {
  for (const value of [contextId, taskId, attemptId, questionId, messageId]) assertId(value);
  assertText(text);
  return db.runTransaction(async (transaction) => {
    const taskRef = db.doc(taskPath(taskId));
    const task = await data(transaction, taskRef);
    matchContext(task, contextId);
    const ref = db.doc(messagePath(taskId, messageId));
    const previous = await data(transaction, ref);
    if (previous) {
      if (previous.role !== "ROLE_USER" || previous.attemptId !== attemptId ||
          previous.replyTo !== questionId || previous.text !== text)
        throw new Error("Message ID already used for a different answer");
      return { replay: true };
    }
    if (!acceptsAnswer(task, attemptId, questionId, now)) return { reason: "stale-question" };
    transaction.set(ref, { messageId, role: "ROLE_USER", attemptId, replyTo: questionId, text, createdAt: now });
    transaction.update(taskRef, { state: "TASK_STATE_WORKING", questionId: null, answerId: messageId });
    return { replay: false };
  });
}

function acceptsAnswer(task, attemptId, questionId, now) {
  return task.state === "TASK_STATE_INPUT_REQUIRED" && task.cancelRequestedAt == null &&
    task.attempt?.id === attemptId && task.attempt.leaseUntil > now && task.questionId === questionId;
}

export function cancelTask(db, { contextId, taskId, now }) {
  assertId(contextId);
  assertId(taskId);
  return db.runTransaction(async (transaction) => {
    const ref = db.doc(taskPath(taskId));
    const task = await data(transaction, ref);
    matchContext(task, contextId);
    if (task.cancelRequestedAt != null) return { replay: true };
    if (task.state === "TASK_STATE_SUBMITTED" && !task.attempt) {
      transaction.update(ref, { state: "TASK_STATE_CANCELED", cancelRequestedAt: now });
    } else if (task.attempt) {
      transaction.update(ref, { cancelRequestedAt: now });
    } else {
      return { reason: "task-terminal" };
    }
    return { replay: false };
  });
}
