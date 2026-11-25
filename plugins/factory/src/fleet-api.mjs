import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { fleetModel, fleetProvider, workerSpeed } from "./config.mjs";
import { claimTask, fleetQueueReason, leaseMs, renewAttempt, requeueUnstartedTask, settleAttempt } from "./fleet-claims.mjs";
import { answerQuestion, askQuestion, cancelTask, claudeQueueKey, inputQueueKey, submitTask } from "./fleet-mailbox.mjs";
import { fleetDiagnostic, invocationReceipt, receiptPath } from "./fleet-receipt.mjs";
import { workspaceIntent, workspaceLaunch } from "./fleet-workspace.mjs";
import { dashboardMetadata, reportedPullRequests } from "./fleet-display.mjs";
import { readFleetWork } from "./fleet-work.mjs";
import { fleetReadiness } from "./fleet-readiness.mjs";
import { hasClaudeHeadroom, quotaObservation } from "./fleet-quota.mjs";
import { assertInputBytes, inputManifest, inputName, inputUploadFields, uploadInput, validateStoredInputs } from "./fleet-inputs.mjs";

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
  heartbeat: z.object({ available: z.boolean(), capacity: z.number().int().min(0).max(1048576), quota: quotaObservation.optional(), privateInputs: z.boolean().optional() }),
  claim: z.object({ ...attemptFields, privateInputs: z.boolean().optional() }),
  inspect: z.object(attemptFields),
  input: z.object({ ...attemptFields, name: inputName }),
  renew: z.object(attemptFields),
  question: z.object({ ...attemptFields, questionId: id, text: message }),
  finish: z.object({
    ...attemptFields,
    outcome: z.enum(["TASK_STATE_COMPLETED", "TASK_STATE_FAILED", "TASK_STATE_CANCELED", "TASK_STATE_SUBMITTED"]),
    result: z.object({ summary: shortText, diagnosticCode: fleetDiagnostic.optional(), artifacts: z.array(name).max(8).optional(), pullRequests: reportedPullRequests.optional() }).nullable(),
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
  submit: z.object({ rootId: id, messageId: id, text: message, project: id, revision, workspace: workspaceIntent.optional(), provider: fleetProvider.optional(), model: fleetModel.optional(), speed: workerSpeed.optional(), display: dashboardMetadata.optional(), inputs: inputManifest.optional() }),
  upload_input: z.object({ rootId: id, messageId: id, project: id, ...inputUploadFields }),
  get: z.object(scope),
  readiness: z.object({ rootId: id, project: id, provider: fleetProvider.optional() }),
  answer: z.object({ ...scope, attemptId: id, questionId: id, messageId: id, text: message }),
  cancel: z.object(scope),
  download: z.object({ ...scope, name }),
};

function validFinishReceipt(input) {
  if (input.outcome === "TASK_STATE_SUBMITTED")
    return input.cleanupVerified && input.admissionId === undefined && input.invocation?.launch === "never-launched" && input.invocation.admissionId === null;
  if (!input.invocation) return input.admissionId === undefined;
  if (!input.cleanupVerified || input.invocation.admissionId !== (input.admissionId ?? null)) return false;
  return input.invocation.launch !== "never-launched" || input.outcome !== "TASK_STATE_COMPLETED";
}

const hash = (value) => createHash("sha256").update(value).digest("hex");
const objectName = ({ taskId, attemptId, name }) => `factory/${taskId}/${attemptId}/${name}`;
const taskRef = (db, id) => db.doc(`factoryTasks/${id}`);
const messageRef = (db, task, id) => db.doc(`factoryTasks/${task}/messages/${id}`);
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

function projectSelection(config, project, provider, model, replay = false) {
  const claude = config.claudeSelection;
  const useClaude = provider === "claude" || (!provider && claude && model === claude.model);
  if (!useClaude) return project?.selection;
  if (project?.revision !== "git") return undefined;
  return replay || Object.values(config.users).some(user => user.role === "worker" && project.eligibleSlots.includes(user.slotId)) ? claude : undefined;
}

// Standard stays the legacy selection without a speed field, so existing submissions replay
// unchanged. A new submission without a speed takes the service's Codex default; a replay keeps
// its recorded speed and rejects a conflicting explicit speed before replay comparison. Fast
// is admitted only once the operator enables it for compatible workers, and never for Claude.
function selectionSpeed(config, selection, requested, prior) {
  const admitted = prior?.selection?.speed ?? "standard";
  if (prior && requested != null && requested !== admitted)
    throw failure(409, `Fleet message ID was already submitted at ${admitted} speed`);
  if (selection.provider !== "codex") {
    if (requested === "fast") throw failure(403, "Fleet Claude workers run at Standard speed");
    return selection;
  }
  const speed = prior ? admitted : requested ?? config.codexSpeed ?? "standard";
  if (speed === "standard") return selection;
  if (!prior && config.codexSpeed !== "fast") throw failure(403, "Codex Fast is not enabled for this Fleet enrollment");
  return { ...selection, speed };
}

export const taskWorkspaceLeaseError = "Task workspace leases require single-repository Git enrollment";

export function validTaskWorkspaceLease({ workspaceLease, revision, workspace }) {
  return workspaceLease === undefined || (workspaceLease === "task" && revision === "git" && !workspace);
}

function launchFor(config, principal, input, prior) {
  const project = enrolledProject(config, principal, input.project);
  const enrolled = projectSelection(config, project, input.provider, input.model, Boolean(prior));
  const fetchSource = project?.revision === "git";
  if (!project || !enrolled || (!fetchSource && project.revision !== input.revision) || (input.model && input.model !== enrolled.model))
    throw failure(403, "Project revision or model is outside the pilot enrollment");
  const selection = selectionSpeed(config, enrolled, input.speed, prior);
  if (!validTaskWorkspaceLease(project)) throw failure(403, taskWorkspaceLeaseError);
  let workspace;
  if (input.workspace || project.workspace) {
    try { workspace = workspaceLaunch(config, principal, input, project); }
    catch { throw failure(403, "Workspace intent is outside enrollment"); }
    if (!fetchSource) throw failure(403, "Workspace requires Git enrollment");
  }
  return {
    workspaceKey: project.workspaceKey, workspaceLease: project.workspaceLease, eligibleSlots: project.eligibleSlots,
    source: { project: input.project, revision: input.revision, ...(fetchSource ? { checkout: "git" } : {}), ...(workspace ? { workspace } : {}) },
    selection,
  };
}

async function signal(db, uids, log) {
  await Promise.all(uids.map(async (uid) => {
    try { await db.doc(`factorySignals/${uid}`).set({ version: randomUUID() }); }
    catch { log("Factory wake failed; clients reconcile from Firestore"); }
  }));
}

function inspectReadiness(db, config, principal, { project: projectName, provider }, now) {
  const project = enrolledProject(config, principal, projectName);
  if (!project) throw failure(403, "Project is outside enrollment");
  const selection = projectSelection(config, project, provider);
  if (!selection) throw failure(403, "Worker provider is outside enrollment");
  return fleetReadiness(db, config.users, projectName, { ...project, selection }, now, maxAgeMs);
}

async function handleController(op, input, { db, config, principal, uid, objects, log, now }) {
  if (op === "readiness") return inspectReadiness(db, config, principal, input, now);
  const contextId = hash(`${uid}\0${input.rootId}`);
  const inputScope = { ...input, contextId };
  if (op === "upload_input") {
    if (!enrolledProject(config, principal, input.project)) throw failure(403, "Project is outside enrollment");
    return uploadInput(objects, inputScope, input);
  }
  const notify = (slots) => signal(db, Object.keys(config.users).filter((key) =>
    slots.includes(config.users[key].slotId)), log);
  if (op === "submit") {
    const result = await submitTask(db, { ...inputScope, now,
      resolveLaunch: prior => launchFor(config, principal, input, prior),
      validateInputs: () => validateStoredInputs(objects, inputScope, input.inputs ?? []) });
    await notify(result.task.eligibleSlots);
    return result;
  }
  const task = await loadTask(db, input.taskId, (row) => row.contextId === contextId);
  if (op === "get") return controllerSnapshot(db, task, now);
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

async function controllerSnapshot(db, task, now) {
  const [question, receipt, queueReason] = await Promise.all([
    task.questionId ? messageRef(db, task.id, task.questionId).get().then((doc) => doc.data()) : null,
    task.lastAttempt && !task.attempt ? db.doc(receiptPath(task.id)).get().then((doc) => doc.data()) : null,
    task.state === "TASK_STATE_SUBMITTED" ? fleetQueueReason(db, task, now, maxAgeMs) : null,
  ]);
  const snapshot = { task, question, ...(queueReason ? { queueReason } : {}) };
  if (receipt && receipt.attemptId === task.lastAttempt?.id) {
    const key = receipt.state === "TASK_STATE_SUBMITTED" ? "previousAttemptReceipt" : "receipt";
    snapshot[key] = receipt;
  }
  return snapshot;
}

async function heartbeat(db, { hostId, slotId }, input, now) {
  const slot = db.doc(`factorySlots/${slotId}`);
  const previous = await db.runTransaction(async (tx) => {
    const prior = (await tx.get(slot)).data();
    if (prior && prior.hostId !== hostId) throw failure(409, "Factory slot belongs to another host");
    tx.set(slot, { hostId, available: input.available, capacity: input.capacity, observedAt: now,
      quota: input.quota ?? null, privateInputs: input.privateInputs === true }, { merge: true });
    return prior;
  });
  if (!input.available) return { tasks: [] };
  const providers = ["codex"];
  if (hasClaudeHeadroom(input.quota, now)) providers.push("claude");
  if (previous?.lastProvider === "codex") providers.reverse();
  const queues = providers.flatMap(provider => {
    const legacy = provider === "codex" ? slotId : claudeQueueKey(slotId);
    if (!input.privateInputs) return [legacy];
    const withInputs = inputQueueKey(legacy);
    return previous?.lastClaimHadInputs?.[provider] === false ? [withInputs, legacy] : [legacy, withInputs];
  });
  const pending = await Promise.all(queues.map(key => db.collection("factoryTasks").where("queuedSlots", "array-contains", key).limit(16).get()));
  return { tasks: Array.from({ length: 16 }, (_, i) => pending.flatMap(({ docs }) => docs[i]?.id ?? [])).flat() };
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
  return { summary: input.result.summary, artifacts, ...(input.result.diagnosticCode ? { diagnosticCode: input.result.diagnosticCode } : {}), ...(input.result.pullRequests?.length && { pullRequests: input.result.pullRequests }) };
}

function attemptOwner(attempt, { attemptId, hostId, slotId, uid }) {
  return attempt?.id === attemptId && attempt.hostId === hostId && attempt.slotId === slotId &&
    (!attempt.inputWorkerUid || attempt.inputWorkerUid === uid);
}

async function finishAttempt(db, binding, objects) {
  if (binding.outcome === "TASK_STATE_SUBMITTED") return { settled: await requeueUnstartedTask(db, binding) };
  const task = await loadTask(db, binding.taskId, task => attemptOwner(task.attempt, binding) || attemptOwner(task.lastAttempt, binding));
  if (task.lastAttempt && !task.attempt) return { settled: true };
  const result = binding.cleanupVerified ? await storedResult(objects, binding) : null;
  return { settled: await settleAttempt(db, { ...binding, result }) };
}

async function withAnswer(db, task) {
  const answer = task.answerId ? (await messageRef(db, task.id, task.answerId).get()).data() : null;
  return { task, answer };
}

async function workerInput(db, objects, binding, clock) {
  const load = () => loadTask(db, binding.taskId, task =>
    attemptOwner(task.attempt, binding) && task.attempt.inputWorkerUid === binding.uid);
  const read = async () => {
    const task = await load();
    if (task.state !== "TASK_STATE_WORKING" || task.cancelRequestedAt != null || task.attempt.leaseUntil <= clock())
      throw failure(409, "Factory attempt cannot read inputs");
    const file = task.inputs?.find(({ name }) => name === binding.name);
    if (!file) throw failure(404, "Unknown Factory input");
    return file;
  };
  const file = await read();
  const bytes = assertInputBytes(file, await objects.download(file));
  await read();
  return { input: file, bytes: bytes.toString("base64") };
}

async function handleWorker(op, input, { db, principal, uid, objects, now, clock, config, log }) {
  const { hostId, slotId } = principal;
  if (op === "heartbeat") return heartbeat(db, principal, input, now);
  const binding = { ...input, hostId, slotId, uid, now, leaseMs, maxAgeMs };
  if (op === "input") return workerInput(db, objects, binding, clock);
  const notify = () => signal(db, Object.keys(config.users).filter((uid) => config.users[uid].role === "controller"), log);
  if (op === "finish") {
    const result = await finishAttempt(db, binding, objects);
    await notify();
    return result;
  }
  const owns = (task) => attemptOwner(task.attempt, binding);
  if (op === "claim") {
    const result = await claimTask(db, binding);
    if (!result.attempt) return result;
    return { ...result, task: await loadTask(db, input.taskId, owns) };
  }
  const task = await loadTask(db, input.taskId, (task) => owns(task) ||
    (op === "inspect" && attemptOwner(task.lastAttempt, binding)));
  if (op === "inspect") return withAnswer(db, task);
  if (op === "renew") return { renewed: await renewAttempt(db, binding), leaseMs };
  if (op === "upload") {
    if (task.cancelRequestedAt != null || task.attempt.leaseUntil <= now) throw failure(409, "Factory attempt cannot publish artifacts");
    return upload(objects, input);
  }
  const result = await askQuestion(db, binding);
  await notify();
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

const roles = { controller, worker, viewer: { work: z.strictObject({ op: z.literal("work") }) } };

function parseOperation(body, role) {
  const schemas = Object.hasOwn(roles, role) ? roles[role] : {};
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
      if (principal.role === "viewer") {
        if (!Object.hasOwn(config.projects, principal.project))
          throw failure(403, "Factory viewer project is not enrolled");
        response.end(JSON.stringify(await readFleetWork(db, principal, clock())));
        return;
      }
      const handle = principal.role === "controller" ? handleController : handleWorker;
      response.end(JSON.stringify(await handle(op, input, { db, config, principal, uid, objects, log, clock, now: clock() })));
    } catch (error) {
      if (!error.status) log("Factory request failed", error.code ?? error.name);
      response.statusCode = error.status ?? 500;
      response.end(JSON.stringify({ error: error.status ? error.message : "Factory operation failed" }));
    }
  };
}
