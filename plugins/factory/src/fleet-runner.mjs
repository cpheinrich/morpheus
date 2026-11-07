import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const states = ["claiming", "running", "waiting"];
const failed = "TASK_STATE_FAILED";
const canceled = "TASK_STATE_CANCELED";
const isId = (value) => typeof value === "string" && uuid.test(value);

function identity(record) {
  return { taskId: record.taskId, attemptId: record.attemptId };
}

function validJournal(record) {
  return record?.version === 1 && states.includes(record.phase) &&
    isId(record.taskId) && isId(record.attemptId) &&
    (record.phase === "claiming" || isId(record.admissionId)) &&
    (record.phase !== "waiting" || isId(record.questionId));
}

async function loadJournal(path) {
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  const file = await open(path, flags).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!file) return null;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 4096)
      throw new Error("Unsafe Factory runner journal.");
    const record = JSON.parse(await file.readFile("utf8"));
    if (!validJournal(record)) throw new Error("Invalid Factory runner journal.");
    return record;
  } finally {
    await file.close();
  }
}

async function syncDirectory(path) {
  const handle = await open(dirname(path), "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function writeJournal(path, record, reserve = false) {
  const temporary = reserve ? path : `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(record));
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (!reserve) await rename(temporary, path);
  await syncDirectory(path);
}

function answerFor(snapshot, record) {
  const answer = snapshot.answer;
  if (snapshot.task?.state !== "TASK_STATE_WORKING" || !answer ||
      snapshot.task.answerId !== answer.messageId || answer.replyTo !== record.questionId ||
      answer.messageId === record.answerId || typeof answer.text !== "string")
    return null;
  return answer;
}

function questionText(output) {
  const text = output?.result?.question;
  if (output?.result?.outcome !== "needs_input" || !output.sessionId ||
      typeof text !== "string" || !text.trim() || Buffer.byteLength(text) > 64 * 1024)
    return null;
  return text;
}

function resultFor(output) {
  const result = output?.result;
  if (result?.outcome !== "completed") return { summary: "Worker did not complete the task." };
  const summary = typeof result.summary === "string" ? result.summary.slice(0, 8192) : "";
  return { summary, ...(Array.isArray(result.artifacts) ? { artifacts: result.artifacts } : {}) };
}

// One supervised process owns this journal and slot. RPC deadlines and process
// termination are the caller's responsibility. The runner never replays a spawn.
export function createFleetRunner({ call, execute, recover = async () => false, journalPath, capacity = () => 1 }) {
  if (!isAbsolute(journalPath)) throw new Error("Factory runner journal path must be absolute.");
  let busy = false;
  let stopping = false;
  let active;
  let pendingQuestion;

  async function forget() {
    await rm(journalPath, { force: true });
    await syncDirectory(journalPath);
    active = undefined;
    pendingQuestion = undefined;
  }

  async function finish(record, outcome, result, cleanupVerified) {
    const reply = await call("finish", { ...identity(record), outcome, result, cleanupVerified });
    if (cleanupVerified && reply?.settled === true) {
      await forget();
      return "settled";
    }
    return "held";
  }

  async function start(record, task, prompt, answerId = null) {
    const admissionId = randomUUID();
    const resume = answerId ? record.admissionId : null;
    const next = { ...record, phase: "running", admissionId, answerId };
    await writeJournal(journalPath, next);
    if (stopping)
      return finish(next, failed, { summary: "Runner stopped before launching the worker." }, true);
    const controller = new AbortController();
    const run = { controller, done: false, output: null, stopReason: null };
    active = run;
    Promise.resolve()
      .then(() => execute({ task, admissionId, resume, prompt, signal: controller.signal }))
      .then((output) => { run.output = output; }, () => {})
      .finally(() => { run.done = true; });
    return "running";
  }

  function abort(reason) {
    if (!active || active.done) return;
    active.stopReason ??= reason;
    active.controller.abort();
  }

  async function sendQuestion(record) {
    const reply = await call("question", {
      ...identity(record), questionId: record.questionId, text: pendingQuestion,
    });
    if (reply?.reason) return "held";
    pendingQuestion = undefined;
    return "waiting";
  }

  async function completeTurn(record, task) {
    const { output, stopReason } = active;
    if (output?.terminationVerified !== true)
      return recoverTurn(record);
    if (task.cancelRequestedAt != null)
      return finish(record, canceled, { summary: "Worker stopped after cancellation." }, true);
    if (stopReason)
      return finish(record, failed, { summary: "Worker stopped after losing runner authority." }, true);
    const question = questionText(output);
    if (question) {
      const next = { ...record, phase: "waiting", questionId: randomUUID() };
      await writeJournal(journalPath, next);
      active = undefined;
      pendingQuestion = question;
      return sendQuestion(next);
    }
    const outcome = output.result?.outcome === "completed" ? "TASK_STATE_COMPLETED" : failed;
    return finish(record, outcome, resultFor(output), true);
  }

  async function recoverTurn(record) {
    const proven = await recover(record.admissionId);
    return finish(record, failed, {
      summary: proven ? "Recovered verified worker cleanup after supervision was interrupted." : "Worker termination could not be verified.",
    }, proven);
  }

  async function driveRunning(record, task) {
    if (!active) return recoverTurn(record);
    if (task.cancelRequestedAt != null) abort("canceled");
    if (active.done) return completeTurn(record, task);
    return "running";
  }

  async function driveWaiting(record, snapshot) {
    const { task } = snapshot;
    if (task.cancelRequestedAt != null)
      return finish(record, canceled, { summary: "Canceled while waiting for input." }, true);
    const answer = answerFor(snapshot, record);
    if (answer) return stopping ? "waiting" : start(record, task, answer.text, answer.messageId);
    if (pendingQuestion) return sendQuestion(record);
    if (task.state === "TASK_STATE_INPUT_REQUIRED" && task.questionId === record.questionId)
      return "waiting";
    return finish(record, failed, { summary: "Worker question could not be recovered." }, true);
  }

  async function drive(record) {
    try {
      const snapshot = await call("inspect", identity(record));
      if (!snapshot?.task?.attempt && snapshot?.task?.lastAttempt?.id === record.attemptId) {
        await forget();
        return "settled";
      }
      if (snapshot?.task?.attempt?.id !== record.attemptId) {
        abort("lost-attempt");
        return "held";
      }
      if (snapshot.task.cancelRequestedAt != null) abort("canceled");
      const renewed = await call("renew", identity(record));
      if (renewed?.renewed !== true) {
        abort("lost-lease");
        if (active && !active.done) return "held";
        const proven = record.phase === "waiting" || active?.output?.terminationVerified === true || await recover(record.admissionId);
        return finish(record, failed, { summary: "Runner lease could not be renewed." }, proven);
      }
      return record.phase === "running"
        ? await driveRunning(record, snapshot.task)
        : await driveWaiting(record, snapshot);
    } catch (error) {
      abort("lost-contact");
      throw error;
    }
  }

  async function claim(record, recovered) {
    const reply = await call("claim", identity(record));
    if (reply?.reason === "lease-expired" || reply?.reason === "attempt-held")
      return finish(record, failed, { summary: "Runner recovered an attempt that never launched." }, true);
    if (reply?.reason) {
      await forget();
      return "idle";
    }
    if (reply?.attempt?.id !== record.attemptId) throw new Error("Invalid Factory claim response.");
    if (recovered || reply.replay || stopping)
      return finish(record, failed, { summary: "Runner recovered an attempt that never launched." }, true);
    const { task } = await call("inspect", identity(record));
    if (task?.attempt?.id !== record.attemptId) return "held";
    if (task.cancelRequestedAt != null)
      return finish(record, canceled, { summary: "Canceled before launching the worker." }, true);
    if (task.state !== "TASK_STATE_WORKING") return "held";
    const renewed = await call("renew", identity(record));
    if (renewed?.renewed !== true)
      return finish(record, failed, { summary: "Runner lease expired before launch." }, true);
    return start(record, task, task.brief.text);
  }

  async function tick() {
    if (busy) return "busy";
    busy = true;
    try {
      const record = await loadJournal(journalPath);
      if (record?.phase === "claiming") return await claim(record, true);
      if (record) return await drive(record);
      const free = stopping ? 0 : await capacity();
      const available = Number.isSafeInteger(free) && free > 0;
      const { tasks } = await call("heartbeat", { available, capacity: available ? free : 0 });
      if (!available || !tasks?.length) return "idle";
      for (const taskId of tasks) {
        if (!isId(taskId)) throw new Error("Invalid Factory task candidate.");
        const next = { version: 1, taskId, attemptId: randomUUID(), phase: "claiming" };
        await writeJournal(journalPath, next, true);
        const state = await claim(next, false);
        if (state !== "idle") return state;
      }
      return "idle";
    } finally {
      busy = false;
    }
  }

  return {
    tick,
    stop() { stopping = true; abort("stopping"); },
  };
}
