import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { invocationReceipt, notLaunched } from "./fleet-receipt.mjs";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const states = ["claiming", "preparing", "running", "waiting", "finishing"];
const maxJournalBytes = 64 * 1024;
const failed = "TASK_STATE_FAILED";
const canceled = "TASK_STATE_CANCELED";
const isId = (value) => typeof value === "string" && uuid.test(value);

function identity(record) {
  return { taskId: record.taskId, attemptId: record.attemptId };
}

function validJournal(record) {
  return record?.version === 1 && states.includes(record.phase) &&
    isId(record.taskId) && isId(record.attemptId) &&
    (["claiming", "preparing", "finishing"].includes(record.phase) || isId(record.admissionId)) &&
    (record.phase !== "waiting" || isId(record.questionId)) &&
    (record.phase !== "finishing" || validSettlement(record));
}

function validSettlement(record) {
  const { settlement } = record;
  const invocation = invocationReceipt.safeParse(settlement?.invocation).data;
  return invocation?.admissionId === (record.admissionId ?? null) &&
    ["TASK_STATE_FAILED", "TASK_STATE_CANCELED", "TASK_STATE_COMPLETED"].includes(settlement.outcome);
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
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > maxJournalBytes)
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

function verifiedInvocation(record, output) {
  if (output?.terminationVerified !== true) return undefined;
  const invocation = invocationReceipt.safeParse(output.invocation).data;
  if (invocation?.admissionId === record.admissionId) return invocation;
}

function finishIdentity(record) {
  return record.admissionId ? { admissionId: record.admissionId } : {};
}

// One supervised process owns this journal and slot. RPC deadlines and process
// termination are the caller's responsibility. The runner never replays a spawn.
export function createFleetRunner({ call, execute, prepare, recover = async () => false, journalPath, capacity = () => 1, quotaObservation }) {
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

  async function finish(record, outcome, result, cleanupVerified, invocation) {
    if (cleanupVerified && invocation) {
      // A process can die after the receipt is ready but before Firestore commits.
      const next = { ...record, phase: "finishing", settlement: { outcome, result, invocation } };
      await writeJournal(journalPath, next);
    }
    return postFinish(record, outcome, result, cleanupVerified, invocation);
  }

  async function postFinish(record, outcome, result, cleanupVerified, invocation) {
    const receipt = invocation ? { ...finishIdentity(record), invocation } : {};
    const reply = await call("finish", { ...identity(record), outcome, result, cleanupVerified, ...receipt });
    if (cleanupVerified && reply?.settled === true) {
      await forget();
      return "settled";
    }
    return "held";
  }

  function finishBeforeLaunch(record, outcome, summary) {
    return finish(record, outcome, { summary }, true, notLaunched(record.admissionId));
  }

  async function start(record, task, prompt, answerId = null) {
    const admissionId = randomUUID();
    const resume = answerId ? record.admissionId : null;
    const next = { ...record, phase: "running", admissionId, answerId };
    delete next.invocation;
    await writeJournal(journalPath, next);
    if (stopping)
      return finishBeforeLaunch(next, failed, "Runner stopped before launching the worker.");
    const controller = new AbortController();
    const run = { controller, done: false, output: null, stopReason: null };
    active = run;
    Promise.resolve()
      .then(() => execute({ task, admissionId, resume, prompt, signal: controller.signal }))
      .then((output) => { run.output = output; }, () => {})
      .finally(() => { run.done = true; });
    return "running";
  }

  async function prepareSource(record, task) {
    const next = { ...record, phase: "preparing" };
    await writeJournal(journalPath, next);
    const run = { controller: new AbortController(), done: false, output: false, stopReason: null };
    active = run;
    Promise.resolve()
      .then(() => prepare(task, run.controller.signal))
      .then((ready) => { run.output = ready === true; }, () => {})
      .finally(() => { run.done = true; });
    return "preparing";
  }

  async function drivePreparing(record, task) {
    if (active && !active.done) return "preparing";
    if (task.cancelRequestedAt != null)
      return finishBeforeLaunch(record, canceled, "Canceled before launching the worker.");
    if (!active?.output || active.stopReason || stopping)
      return finishBeforeLaunch(record, failed, "Studio source preparation failed or was interrupted before launch.");
    return start(record, task, task.brief.text);
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
      return recoverTurn(record, task);
    const invocation = verifiedInvocation(record, output);
    if (task.cancelRequestedAt != null)
      return finish(record, canceled, { summary: "Worker stopped after cancellation." }, true, invocation);
    if (stopReason)
      return finish(record, failed, { summary: "Worker stopped after losing runner authority." }, true, invocation);
    const question = questionText(output);
    if (question) {
      const next = { ...record, phase: "waiting", questionId: randomUUID(), invocation };
      await writeJournal(journalPath, next);
      active = undefined;
      pendingQuestion = question;
      return sendQuestion(next);
    }
    const outcome = output.result?.outcome === "completed" ? "TASK_STATE_COMPLETED" : failed;
    return finish(record, outcome, resultFor(output), true, invocation);
  }

  async function recoverTurn(record, task) {
    const recovered = await recover(record.admissionId, task);
    const proven = recovered === true || recovered?.terminationVerified === true;
    return finish(record, failed, {
      summary: proven ? "Recovered verified worker cleanup after supervision was interrupted." : "Worker termination could not be verified.",
    }, proven, verifiedInvocation(record, recovered));
  }

  async function driveRunning(record, task) {
    if (!active) return recoverTurn(record, task);
    if (task.cancelRequestedAt != null) abort("canceled");
    if (active.done) return completeTurn(record, task);
    return "running";
  }

  async function driveWaiting(record, snapshot) {
    const { task } = snapshot;
    if (task.cancelRequestedAt != null)
      return finishWaiting(record, task, canceled, "Canceled while waiting for input.");
    const answer = answerFor(snapshot, record);
    if (answer) return stopping ? "waiting" : start(record, task, answer.text, answer.messageId);
    if (pendingQuestion) return sendQuestion(record);
    if (task.state === "TASK_STATE_INPUT_REQUIRED" && task.questionId === record.questionId)
      return "waiting";
    return finishWaiting(record, task, failed, "Worker question could not be recovered.");
  }

  async function finishWaiting(record, task, outcome, summary) {
    const invocation = invocationReceipt.safeParse(record.invocation).data;
    if (invocation?.admissionId === record.admissionId) return finish(record, outcome, { summary }, true, invocation);
    const recovered = await recover(record.admissionId, task);
    return finish(record, outcome, { summary }, true, verifiedInvocation(record, recovered));
  }

  async function finishExpired(record, task) {
    const summary = "Runner lease could not be renewed.";
    if (record.phase === "preparing") return finishBeforeLaunch(record, failed, summary);
    if (record.phase === "waiting") return finishWaiting(record, task, failed, summary);
    const output = active?.output?.terminationVerified === true ? active.output : await recover(record.admissionId, task);
    const proven = output === true || output?.terminationVerified === true;
    return finish(record, failed, { summary }, proven, verifiedInvocation(record, output));
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
        return finishExpired(record, snapshot.task);
      }
      if (record.phase === "preparing") return drivePreparing(record, snapshot.task);
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
      return finishBeforeLaunch(record, failed, "Runner recovered an attempt that never launched.");
    if (reply?.reason) {
      await forget();
      return "idle";
    }
    if (reply?.attempt?.id !== record.attemptId) throw new Error("Invalid Factory claim response.");
    if (recovered || reply.replay || stopping)
      return finishBeforeLaunch(record, failed, "Runner recovered an attempt that never launched.");
    const { task } = await call("inspect", identity(record));
    if (task?.attempt?.id !== record.attemptId) return "held";
    if (task.cancelRequestedAt != null)
      return finishBeforeLaunch(record, canceled, "Canceled before launching the worker.");
    if (task.state !== "TASK_STATE_WORKING") return "held";
    const renewed = await call("renew", identity(record));
    if (renewed?.renewed !== true)
      return finishBeforeLaunch(record, failed, "Runner lease expired before launch.");
    if (prepare && task.source?.checkout === "git") return prepareSource(record, task);
    return start(record, task, task.brief.text);
  }

  function driveJournal(record) {
    if (record.phase === "claiming") return claim(record, true);
    if (record.phase === "finishing") {
      const { outcome, result, invocation } = record.settlement;
      return postFinish(record, outcome, result, true, invocation);
    }
    return drive(record);
  }

  async function tick() {
    if (busy) return "busy";
    busy = true;
    try {
      const record = await loadJournal(journalPath);
      if (record) return await driveJournal(record);
      const free = stopping ? 0 : await capacity();
      const available = Number.isSafeInteger(free) && free > 0;
      const quota = quotaObservation?.();
      const { tasks } = await call("heartbeat", { available, capacity: available ? free : 0, ...(quota ? { quota } : {}) });
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
