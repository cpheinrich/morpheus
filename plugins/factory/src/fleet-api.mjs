import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { claimTask, renewAttempt, settleAttempt } from "./fleet-claims.mjs";
import { answerQuestion, askQuestion, cancelTask, submitTask } from "./fleet-mailbox.mjs";
import { invocationReceipt, receiptPath } from "./fleet-receipt.mjs";
import { fleetReadiness, quotaObservation } from "./fleet-readiness.mjs";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const digest = /^[0-9a-f]{64}$/;
const revision = z.string().regex(/^[0-9a-f]{40}$/);
const name = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/);
const message = z.string().refine((value) => value.trim() && Buffer.byteLength(value) <= 65536);
const shortText = z.string().max(8192);
const maxBytes = 8 * 1024 * 1024;
const bodyLimit = Math.ceil(maxBytes / 3) * 4 + 4096;
const taskFields = { taskId: id };
const attemptFields = { ...taskFields, attemptId: id };
const scope = { rootId: id, ...taskFields };
const worker = {
  heartbeat: z.object({ available: z.boolean(), capacity: z.number().int().min(0).max(1048576), quota: quotaObservation.optional() }),
  claim: z.object(attemptFields),
  inspect: z.object(attemptFields),
  renew: z.object(attemptFields),
  question: z.object({ ...attemptFields, questionId: id, text: message }),
  finish: z.object({
    ...attemptFields,
    outcome: z.enum(["TASK_STATE_COMPLETED", "TASK_STATE_FAILED", "TASK_STATE_CANCELED"]),
    result: z.object({ summary: shortText, artifacts: z.array(name).max(8).optional() }).nullable(),
    cleanupVerified: z.boolean(),
    admissionId: z.uuid().optional(),
    invocation: invocationReceipt.optional(),
  }).refine(validFinishReceipt),
  upload: z.object({
    ...attemptFields, name, type: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/).max(100),
    bytes: z.base64().max(bodyLimit - 4096),
  }),
};
const controller = {
  submit: z.object({ rootId: id, messageId: id, text: message, project: id, revision, model: id.optional() }),
  get: z.object(scope),
  readiness: z.object({ rootId: id, project: id }),
  answer: z.object({ ...scope, attemptId: id, questionId: id, messageId: id, text: message }),
  cancel: z.object(scope),
  download: z.object({ ...scope, name }),
};

function validFinishReceipt(input) {
  if (!input.invocation) return input.admissionId === undefined;
  if (!input.cleanupVerified || input.invocation.admissionId !== (input.admissionId ?? null)) return false;
  return input.invocation.launch !== "never-launched" || input.outcome !== "TASK_STATE_COMPLETED";
}

const hash = (value) => createHash("sha256").update(value).digest("hex");
const objectName = ({ taskId, attemptId, name }) => `factory/${taskId}/${attemptId}/${name}`;
const taskRef = (db, id) => db.doc(`factoryTasks/${id}`);
const messageRef = (db, task, id) => db.doc(`factoryTasks/${task}/messages/${id}`);
const leaseMs = 60_000;
const maxAgeMs = 45_000;

function failure(status, message) {
  return Object.assign(new Error(message), { status });
}

async function loadTask(db, taskId, authorized) {
  const task = (await taskRef(db, taskId).get()).data();
  if (!task || !authorized(task)) throw failure(404, "Unknown Factory task");
  return task;
}

function enrolledProject(config, principal, name) {
  return principal.projects.includes(name) && Object.hasOwn(config.projects, name) && config.projects[name];
}

function launchFor(config, principal, input) {
  const project = enrolledProject(config, principal, input.project);
  const selection = project?.selection;
  const fetchSource = project?.revision === "git";
  if (!project || (!fetchSource && project.revision !== input.revision) || (input.model && input.model !== selection.model))
    throw failure(403, "Project revision or model is outside the pilot enrollment");
  return {
    workspaceKey: project.workspaceKey, eligibleSlots: project.eligibleSlots,
    source: { project: input.project, revision: input.revision, ...(fetchSource ? { checkout: "git" } : {}) },
    selection,
  };
}

async function signal(db, uids, log) {
  await Promise.all(uids.map(async (uid) => {
    try { await db.doc(`factorySignals/${uid}`).set({ version: randomUUID() }); }
    catch { log("Factory wake failed; clients reconcile from Firestore"); }
  }));
}

function inspectReadiness(db, config, principal, projectName, now) {
  const project = enrolledProject(config, principal, projectName);
  if (!project) throw failure(403, "Project is outside the pilot enrollment");
  return fleetReadiness(db, config.users, projectName, project, now, maxAgeMs);
}

async function handleController(op, input, { db, config, principal, uid, objects, log, now }) {
  if (op === "readiness") return inspectReadiness(db, config, principal, input.project, now);
  const contextId = hash(`${uid}\0${input.rootId}`);
  const notify = (slots) => signal(db, Object.keys(config.users).filter((key) =>
    slots.includes(config.users[key].slotId)), log);
  if (op === "submit") {
    const result = await submitTask(db, { ...input, contextId, now, launch: launchFor(config, principal, input) });
    await notify(result.task.eligibleSlots);
    return result;
  }
  const task = await loadTask(db, input.taskId, (row) => row.contextId === contextId);
  if (op === "get") return controllerSnapshot(db, task);
  if (op === "download") {
    const artifact = task.result?.artifacts?.find(({ name }) => name === input.name);
    if (!artifact) throw failure(404, "Unknown Factory artifact");
    const bytes = await objects.download(artifact);
    if (bytes.length !== artifact.size || hash(bytes) !== artifact.sha256) throw new Error("Artifact integrity failure");
    return { artifact, bytes: bytes.toString("base64") };
  }
  const action = op === "answer" ? answerQuestion : cancelTask;
  const result = await action(db, { ...input, contextId, now });
  await notify(task.eligibleSlots);
  return result;
}

async function controllerSnapshot(db, task) {
  const [question, receipt] = await Promise.all([
    task.questionId ? messageRef(db, task.id, task.questionId).get().then((doc) => doc.data()) : null,
    task.lastAttempt && !task.attempt ? db.doc(receiptPath(task.id)).get().then((doc) => doc.data()) : null,
  ]);
  return { task, question, ...(receipt ? { receipt } : {}) };
}

async function heartbeat(db, { hostId, slotId }, input, now) {
  const slot = db.doc(`factorySlots/${slotId}`);
  await db.runTransaction(async (tx) => {
    const prior = (await tx.get(slot)).data();
    if (prior && prior.hostId !== hostId) throw failure(409, "Factory slot belongs to another host");
    tx.set(slot, { hostId, available: input.available, capacity: input.capacity, observedAt: now,
      quota: input.quota ?? null }, { merge: true });
  });
  if (!input.available) return { tasks: [] };
  const queued = await db.collection("factoryTasks").where("queuedSlots", "array-contains", slotId).limit(16).get();
  return { tasks: queued.docs.map(({ id }) => id) };
}

async function upload(objects, input) {
  const bytes = Buffer.from(input.bytes, "base64");
  if (bytes.length > maxBytes) throw failure(413, "Factory artifact is too large");
  const descriptor = { name: input.name, objectName: objectName(input), type: input.type, size: bytes.length, sha256: hash(bytes) };
  return objects.put(descriptor, bytes);
}

async function storedResult(objects, input) {
  if (!input.result) return null;
  const names = input.result.artifacts ?? [];
  if (new Set(names).size !== names.length) throw failure(400, "Duplicate Factory artifact name");
  const artifacts = await Promise.all(names.map((name) => objects.metadata(objectName({ ...input, name }))));
  if (artifacts.some((file) => !file || !digest.test(file.sha256))) throw failure(400, "Missing Factory artifact");
  return { summary: input.result.summary, artifacts };
}

function attemptOwner(attempt, { attemptId, hostId, slotId }) {
  return attempt?.id === attemptId && attempt.hostId === hostId && attempt.slotId === slotId;
}

async function finishAttempt(db, binding, task, objects) {
  if (task.lastAttempt && !task.attempt) return { settled: true };
  const result = binding.cleanupVerified ? await storedResult(objects, binding) : null;
  return { settled: await settleAttempt(db, { ...binding, result }) };
}

async function withAnswer(db, task) {
  const answer = task.answerId ? (await messageRef(db, task.id, task.answerId).get()).data() : null;
  return { task, answer };
}

async function handleWorker(op, input, { db, principal, objects, now, config, log }) {
  const { hostId, slotId } = principal;
  if (op === "heartbeat") return heartbeat(db, principal, input, now);
  const binding = { ...input, hostId, slotId, now, leaseMs, maxAgeMs };
  const owns = (task) => attemptOwner(task.attempt, binding);
  if (op === "claim") {
    const result = await claimTask(db, binding);
    if (!result.attempt) return result;
    return { ...result, task: await loadTask(db, input.taskId, owns) };
  }
  const task = await loadTask(db, input.taskId, (task) => owns(task) ||
    ((op === "finish" || op === "inspect") && attemptOwner(task.lastAttempt, binding)));
  if (op === "inspect") return withAnswer(db, task);
  if (op === "renew") return { renewed: await renewAttempt(db, binding) };
  if (op === "upload") {
    if (task.cancelRequestedAt != null || task.attempt.leaseUntil <= now) throw failure(409, "Factory attempt cannot publish artifacts");
    return upload(objects, input);
  }
  const result = op === "question" ? await askQuestion(db, binding) : await finishAttempt(db, binding, task, objects);
  await signal(db, Object.keys(config.users).filter((uid) => config.users[uid].role === "controller"), log);
  return result;
}

async function parseBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > bodyLimit) throw failure(413, "Factory request is too large");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks)); }
  catch { throw failure(400, "Invalid Factory JSON request"); }
}

async function authenticate(request, verifyToken, config) {
  const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
  if (!token) throw failure(401, "Factory authentication required");
  const identity = await verifyToken(token).catch(() => null);
  if (!identity || !id.safeParse(identity.uid).success) throw failure(401, "Invalid Factory identity");
  const { uid } = identity;
  const principal = Object.hasOwn(config.users, uid) && config.users[uid];
  if (!principal) throw failure(403, "Factory identity is not enrolled");
  return { uid, principal };
}

function parseOperation(body, role) {
  const schemas = role === "controller" ? controller : worker;
  const op = body?.op;
  if (typeof op !== "string" || !Object.hasOwn(schemas, op)) throw failure(403, "Factory operation is outside this role");
  const input = schemas[op].safeParse(body);
  if (!input.success) throw failure(400, "Invalid Factory operation fields");
  return { op, input: input.data };
}

export function createFleetApi({ db, verifyToken, config, objects, clock = Date.now, log = console.error }) {
  return async function api(request, response) {
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    try {
      if (request.method !== "POST" || request.url !== "/v1") throw failure(404, "Unknown Factory endpoint");
      const { uid, principal } = await authenticate(request, verifyToken, config);
      const { op, input } = parseOperation(await parseBody(request), principal.role);
      const handle = principal.role === "controller" ? handleController : handleWorker;
      response.end(JSON.stringify(await handle(op, input, { db, config, principal, uid, objects, log, now: clock() })));
    } catch (error) {
      if (!error.status) log("Factory request failed", error.code ?? error.name);
      response.statusCode = error.status ?? 500;
      response.end(JSON.stringify({ error: error.status ? error.message : "Factory operation failed" }));
    }
  };
}
