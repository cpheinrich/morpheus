import http from "node:http";
import { StringDecoder } from "node:string_decoder";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  open,
  chmod,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";
import {
  home,
  route,
  modelSelection,
  permissionMode,
  codexSelection,
  codexRootEffort,
  codexWorkerEffort,
  modelIdPattern,
  MOVING_MODEL_ALIASES,
  codexPermission,
  assertPoolAuthority,
  readGatewayQuota,
  resolveAdminCredentials,
  delegates,
  withoutReferencedSecrets,
} from "./config.mjs";
import {
  atomic,
  initStore,
  configRead,
  configWrite,
  taskRead,
  taskWrite,
  projectIdentity,
  runDir,
  readJSON,
} from "./store.mjs";
import { Codex } from "./codex.mjs";
import {
  checkClaude,
  handoff,
  claudeArgs,
  applyClaudeEvent,
} from "./claude.mjs";
import {
  checkCodex,
  codexHandoff,
  codexArgs,
  applyCodexEvent,
} from "./codex-exec.mjs";
import { identity, ownedProcessState, stopOrphan } from "./processes.mjs";
import { Viewer } from "./viewer.mjs";
import { memoryContext, codexMemoryEnabled } from "./memory.mjs";
import { installationId } from "./installation.mjs";
import { Pool } from "./pool.mjs";
import { HQPool } from "./pool-hq.mjs";
import {
  editTargets,
  canonical,
  within,
  readiness,
} from "./dispatch.mjs";
import {
  checkouts,
  claimCheckouts,
  extraRoots,
  legacyMap,
  overlaps,
  resolveWorkspace,
  workspaceNote,
} from "./workspace.mjs";

export function previewSelection(config, snapshot) {
  try {
    return modelSelection(config, snapshot);
  } catch (error) {
    return { error: error.message };
  }
}
const DEFAULT_WORKER_MODELS = { codex: "gpt-6.1-sol", claude: "claude-opus-5-5" };
function explicitModelProvider(model) {
  if (/^(claude-|(?:opus|sonnet|haiku)$)/i.test(model ?? "")) return "claude";
  if (/^(gpt-|codex-|o[1-9](?:-|$))/i.test(model ?? "")) return "codex";
  return undefined;
}
function factoryWorkerSelection(worker, config, rootKind, rootEffort, args = {}) {
  const model = args.model ?? DEFAULT_WORKER_MODELS[worker];
  if (!modelIdPattern.test(model) || MOVING_MODEL_ALIASES.has(model.toLowerCase()))
    throw new Error("Name a fixed worker model or an approved Claude family alias.");
  const inheritedEffort = args.effort ?? rootEffort;
  // A controller can use a model with no reasoning; the pinned Sol model starts at low.
  const requestedEffort = model === DEFAULT_WORKER_MODELS.codex && inheritedEffort === "none"
    ? "low"
    : inheritedEffort;
  const effort = worker === "claude"
    ? config.effortMap[requestedEffort ?? "high"]
    : rootKind === "claude"
      ? codexWorkerEffort(config, requestedEffort)
      : codexRootEffort(requestedEffort);
  if (requestedEffort && !effort) throw new Error("Unsupported Factory worker effort.");
  return { model, effort, speed: args.speed ?? "standard" };
}
const RECENT_RUN_LIMIT = 5;
// The route is pinned once per root session, and so is the primary conversation's working
// directory: Claude resumes a session only from the directory that created it. The key keeps its
// pre-workspace form, `primary:<that directory>`, so saved conversations resume unchanged; other
// repositories join the conversation's task-owned workspace rather than starting a new one. A
// fresh run deliberately gets no reusable key and never replaces the primary conversation.
export const sessionKeyFor = (cwd) => `primary:${cwd}`;
const overlapping = (a, b) => a.some((x) => b.some((y) => overlaps(x, y)));
const runDirs = (run) => run.dirs ?? [run.cwd];
// Global and per-repository `off` cover every repository a delegation would write.
function disabledRepository(config, task, map) {
  if (config.mode === "off" || task.disabled) return "Delegation is disabled for this task.";
  const off = [task.project, ...Object.keys(map)].find((project) => config.projects[project] === "off");
  return off ? `Delegation is disabled for repository ${off}.` : null;
}
const legacySessionKeyFor = (cwd, gateway) =>
  gateway ? `${cwd}#gateway:${gateway.name}` : cwd;
const bindingFor = (decision) => ({
  executor: decision.executor,
  gateway: decision.gateway?.name ?? null,
});
const sameBinding = (a, b) =>
  a?.executor === b?.executor && (a?.gateway ?? null) === (b?.gateway ?? null);
const describeBinding = (binding) =>
  binding.gateway
    ? `${binding.executor} through gateway "${binding.gateway}"`
    : `native ${binding.executor}`;
function pinnedRoute(config, task, gateways, operation, primary) {
  if (!task.workerBinding) return route(config, task, gateways, operation, primary);
  if (operation && operation !== task.workerBinding.executor)
    throw new Error(
      `This root session is already pinned to ${describeBinding(task.workerBinding)}; start a new root session to choose ${operation}.`,
    );
  if (!task.workerBinding.gateway)
    return {
      executor: task.workerBinding.executor,
      reason: `Pinned primary worker: ${describeBinding(task.workerBinding)}`,
      pinned: true,
    };
  const gateway = gateways.find((candidate) => candidate.name === task.workerBinding.gateway);
  if (!gateway || gateway.provider !== task.workerBinding.executor)
    return {
      executor: task.workerBinding.executor,
      reason: `Pinned gateway "${task.workerBinding.gateway}" is missing or changed provider; no silent reroute is allowed`,
      pinned: true,
      unavailable: true,
    };
  if (gateway.usedPercent == null || gateway.usedPercent >= config.threshold)
    return {
      executor: task.workerBinding.executor,
      gateway,
      reason:
        gateway.usedPercent == null
          ? `Pinned gateway "${gateway.name}" quota is unreadable; no silent reroute is allowed`
          : `Pinned gateway "${gateway.name}" is at ${gateway.usedPercent}% used, at or above the ${config.threshold}% reserve threshold; no silent reroute is allowed`,
      pinned: true,
      unavailable: true,
    };
  return {
    executor: task.workerBinding.executor,
    gateway,
    reason: `Pinned primary worker: ${describeBinding(task.workerBinding)}`,
    pinned: true,
  };
}
const routeChanged = (previous, decision) =>
  `Run ${previous.id} asked its question on ${previous.gateway ? `the ${previous.gateway} gateway (${previous.executor})` : `native ${previous.executor}`}, but routing now chooses: ${decision.reason}. Reply once that route is chosen again, or start a new handoff without replySource.`;
// The provider conversation a run resumes: the previous run's, else (for the primary
// slot) the one recorded for this checkout, under its current or legacy key.
function resumedSessions(worker, previous, fresh, task, sessionKey, legacySessionKey) {
  const recorded = (sessions) => (!fresh ? sessions?.[sessionKey] || sessions?.[legacySessionKey] || null : null);
  return {
    claude: worker === "claude" ? previous?.claudeSession ?? recorded(task.sessions) : null,
    codex: worker === "codex" ? previous?.codexSession ?? recorded(task.codexSessions) : null,
  };
}
// Supervision replies after this run; a reply resumes the conversation that asked, so it
// must take the same route and say who answered and why.
function continuationReplies({ previous, continuation, worker, decision, args, task, config }) {
  if (previous && !previous.terminal)
    throw new Error(
      "This task already has an active run. Resume monitoring it instead.",
    );
  if (
    continuation &&
    (previous.executor !== worker ||
      (previous.gateway ?? null) !== (decision.gateway?.name ?? null))
  )
    throw new Error(routeChanged(previous, decision));
  if (
    continuation &&
    (!["codex", "user"].includes(args.replySource) || !args.replyReason)
  )
    throw new Error(
      "Resuming a question requires replySource and replyReason.",
    );
  const replies =
    continuation && args.replySource === "codex"
      ? task.supervisionReplies + 1
      : 0;
  if (replies > config.maxSupervisionReplies)
    throw new Error("Supervision limit reached. Escalate to the user.");
  return replies;
}
// A Codex worker runs the coordinator's own model and effort; the sandbox follows the
// same approval mapping, never wider (full access only for a never-approve task).
function workerSelection(worker, config, snapshot, args) {
  if (args.factoryDefaults)
    return factoryWorkerSelection(worker, config, "codex", snapshot.reasoningEffort, args);
  return worker === "claude"
    ? modelSelection(config, snapshot, { model: args.model, effort: args.effort })
    : {
        model: args.model ?? snapshot.model,
        effort: codexRootEffort(args.effort ?? snapshot.reasoningEffort),
      };
}
async function workerEnv(worker, task, decision, config) {
  return withoutReferencedSecrets(
    (worker === "claude"
      ? await checkClaude(task.cwd, undefined, decision.gateway ?? null)
      : await checkCodex(task.cwd, undefined, decision.gateway ?? null)
    ).env,
    config,
  );
}
function workerArgv({ worker, task, codexSession, selection, permissions, roots, codexSandbox, decision }) {
  return worker === "claude"
    ? claudeArgs(task.claudeSession, selection, permissions, roots)
    : codexArgs(codexSession, selection, codexSandbox, decision.gateway ?? null);
}
function runRecord({ id, worker, task, workspace, sessionKey, fresh, decision, selection, permissions, codexSandbox, codexSession, args }) {
  return {
    id,
    executor: worker,
    threadId: task.id,
    cwd: task.cwd,
    workspace: workspace.map,
    dirs: workspace.dirs,
    sessionKey,
    workerSlot: fresh ? "fresh" : "primary",
    fresh,
    gateway: decision.gateway?.name ?? null,
    host: hostname(),
    selection,
    permissions: codexSandbox?.name ?? permissions,
    background: args.background === true,
    createdAt: Date.now(),
    state: "starting",
    terminal: false,
    question: null,
    result: null,
    claudeSession: task.claudeSession,
    codexSession,
    replySource: args.replySource,
    replyReason: args.replyReason,
    dispatch: args.dispatch ?? null,
  };
}
const sameRouteAs = (worker, decision, cwd, fresh) => (run) =>
  run.executor === worker &&
  (run.gateway ?? null) === (decision.gateway?.name ?? null) &&
  run.cwd === cwd &&
  run.fresh === fresh;
// A resumable provider conversation only for a resumed isolated run or the primary slot.
function claudeRootSessions(worker, previous, fresh, task, sessionKey, legacySessionKey) {
  const resumable = previous?.fresh === true || !fresh;
  return {
    codexSession:
      worker === "codex" && resumable
        ? (previous?.codexSession ??
          task.codexSessions?.[sessionKey] ??
          task.codexSessions?.[legacySessionKey] ??
          null)
        : null,
    claudeSession:
      worker === "claude" && resumable
        ? (previous?.claudeSession ??
          task.sessions?.[sessionKey] ??
          task.sessions?.[legacySessionKey] ??
          null)
        : null,
  };
}
// Codex exec cannot ask mid-run, so its every question arrives as needs_input; a
// Claude worker can also ask live, answered through codex.answer.
function claudeRootReplies(previous, args, task, config) {
  const continuation = previous?.state === "needs_input";
  if (
    continuation &&
    (!["claude", "user"].includes(args.replySource) || !args.replyReason)
  )
    throw new Error(
      "Resuming a question requires replySource and replyReason.",
    );
  const priorReplies =
    task.supervisionRepliesByCwd?.[task.cwd] ??
    task.supervisionReplies ??
    0;
  const replies =
    continuation && args.replySource === "claude"
      ? priorReplies + 1
      : 0;
  if (replies > config.maxSupervisionReplies)
    throw new Error("Supervision limit reached. Escalate to the user.");
  return replies;
}
// A Claude worker inherits the session's own model, effort and permission mode, so
// it can never be wider than the coordinator.
function claudeRootSelection(worker, config, session, args) {
  if (args.factoryDefaults)
    return factoryWorkerSelection(worker, config, "claude", session.effort, args);
  return worker === "codex"
    ? codexSelection(config, session, { model: args.model, effort: args.effort })
    : {
        model: args.model ?? session.model ?? config.modelFallback ?? "opus",
        effort:
          config.effortMap[args.effort ?? session.effort] ??
          session.effort ??
          "high",
      };
}
async function claudeRootPrompt(worker, config, task, args, workspace) {
  // Claude's own memory switches are checked inside memoryContext.
  task.memoryEnabled = config.memorySharing;
  // Shared memory is the other agent's store, so a same-provider worker gets none.
  const memories =
    worker === "codex" ? await memoryContext(config, task, "claude") : [];
  const brief = withWorkspace(args.prompt, workspace.map, task.cwd);
  return worker === "codex"
    ? codexHandoff(brief, memories, "Claude Code")
    : handoff(brief, memories, "Claude Code");
}
function claudeRootRecord({ id, worker, task, args, workspace, sessionKey, fresh, decision, selection, permission, codexSession, claudeSession }) {
  return {
    id,
    executor: worker,
    threadId: task.id,
    sessionId: args.sessionId,
    cwd: task.cwd,
    workspace: workspace.map,
    dirs: workspace.dirs,
    sessionKey,
    workerSlot: fresh ? "fresh" : "primary",
    fresh,
    gateway: decision.gateway?.name ?? null,
    host: hostname(),
    selection,
    permissions: permission.name,
    background: args.background === true,
    createdAt: Date.now(),
    state: "starting",
    terminal: false,
    question: null,
    result: null,
    codexSession,
    claudeSession,
    replySource: args.replySource,
    replyReason: args.replyReason,
    dispatch: args.dispatch ?? null,
  };
}
function recordClaudeRootStart(current, { id, config, replies, task, fresh, decision, workspace }) {
  current.runId = id;
  current.runIds = [...new Set([...(current.runIds ?? []), id])];
  current.memoryEnabled = config.memorySharing;
  current.supervisionReplies = replies;
  current.supervisionRepliesByCwd = {
    ...current.supervisionRepliesByCwd,
    [task.cwd]: replies,
  };
  if (!fresh) {
    current.workerBinding ??= bindingFor(decision);
    current.primaryCwd ??= task.cwd;
    current.workspace = workspace.map;
  }
}
function verifiedSession(task) {
  const session = task.session;
  if (!session?.cwd || !session.permissionMode)
    throw new Error(
      "No verified Claude session settings yet. The plugin's hooks record them; trust the hooks and send a message first.",
    );
  return session;
}
// A reply must take the route of the run that asked; otherwise the primary slot resumes
// the latest run on the same route.
function sameRouteRun(previous, runs, sameRoute, fresh, decision) {
  if (previous && previous.state === "needs_input" && !sameRoute(previous))
    throw new Error(routeChanged(previous, decision));
  if (!fresh)
    previous ??= [...runs.active, ...runs.recent].find(sameRoute);
  return previous;
}
async function claudeRootEnv(worker, task, decision, config) {
  return withoutReferencedSecrets(
    (worker === "codex"
      ? await checkCodex(task.cwd, undefined, decision.gateway ?? null)
      : await checkClaude(task.cwd, undefined, decision.gateway ?? null)
    ).env,
    config,
  );
}
function claudeRootArgv({ worker, codexSession, claudeSession, selection, permission, decision, roots }) {
  return worker === "codex"
    ? codexArgs(codexSession, selection, permission, decision.gateway ?? null)
    : claudeArgs(claudeSession, selection, permission.name, roots);
}
// Bridge operations by method name. A Map, so an inherited name such as "constructor" is unknown.
const BRIDGE_OPERATIONS = new Map([
  ["config", (m, args) => m.configure(args)],
  ["codex.view", async (m, args) => m.viewer.open(await m.codexRunId(args))],
  ["codex.status", async (m, args) => m.status(await m.codexRunId(args))],
  ["codex.wait", async (m, args) => m.wait(await m.codexRunId(args), args.seconds)],
  ["codex.stop", async (m, args) => m.cancel(await m.codexRunId(args))],
  ["view", (m, args) => m.viewer.open(args.runId)],
  ["ping", () => ({ ready: true, installationId })],
  ["shutdown", (m) => m.shutdown()],
  ["factory.inspect", (m, args) => m.factoryInspect(args)],
  ["factory.delegate", (m, args) => m.factoryDelegate(args)],
  ["factory.status", (m, args) => m.factoryRun(args)],
  ["factory.wait", (m, args) => m.factoryWait(args)],
  ["factory.answer", (m, args) => m.factoryAnswer(args)],
  ["factory.stop", (m, args) => m.factoryStop(args)],
  ["inspect", (m, args) => m.inspect(args.threadId, args.operation)],
  ["start", (m, args) => m.start(args)],
  ["status", (m, args) => m.status(args.runId)],
  ["wait", (m, args) => m.wait(args.runId, args.seconds)],
  ["answer", (m, args) => m.answer(args)],
  ["stop", (m, args) => m.cancel(args.runId)],
  ["override", (m, args) => m.setOverride(args.threadId, args.executor)],
  ["codex.inspect", (m, args) => m.claudeInspect(args.sessionId, args.operation)],
  ["codex.start", (m, args) => m.codexStart(args)],
  ["codex.answer", (m, args) => m.claudeAnswer(args)],
  ["codex.hook", (m, args) => m.codexHook(args)],
  ["codex.override", (m, args) => m.setOverride(claudeTaskId(args.sessionId), args.executor)],
  ["codex.memories", (m, args) => m.claudeMemories(args)],
  ["memories", (m, args) => m.codexMemories(args)],
  ["hook", (m, args) => m.rootHook(args)],
]);
// The working directory a slot is pinned to (null for a new fresh slot) and its checkout map:
// the primary map, a resumed fresh run's own map, or an empty one.
async function slotWorkspace(task, fresh, previous, primaryMap) {
  if (!fresh) return { anchor: task.primaryCwd ?? null, map: primaryMap };
  if (previous?.fresh !== true) return { anchor: null, map: {} };
  return { anchor: previous.cwd, map: previous.workspace ?? (await legacyMap(previous.cwd)) };
}
// Without an anchor the first target is the working directory; with one, the root's own
// checkout is never added implicitly, so a moved root cannot widen the workspace silently.
function workspaceTargets(anchor, cwd, rootCwd, repos) {
  const first = anchor ? (cwd ? [cwd] : []) : [cwd || rootCwd];
  return [...first, ...repos];
}
export class Manager {
  runs = new Map();
  taskMutations = new Map();
  codex = null;
  busy = false;
  draining = false;
  processOwnership = ownedProcessState;
  viewer = new Viewer(this);
  pool = new Pool({
    admit: (threadId, permission, conversation) =>
      this.poolAdmission(threadId, permission, conversation),
    control: (threadId, conversation) =>
      this.poolControl(threadId, conversation),
  });
  hq = new HQPool(this.pool, { draining: () => this.draining });
  async client() {
    if (!this.codex) {
      this.codex = await new Codex().connect();
      this.codex.on("disconnected", () => {
        this.codex = null;
      });
    }
    return this.codex;
  }
  async snapshot(id) {
    return (await this.client()).snapshot(id);
  }
  async taskTransaction(id, transaction) {
    const previous = this.taskMutations.get(id) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
      const task = await taskRead(id);
      if (await transaction(task)) await taskWrite(task);
      return task;
    });
    this.taskMutations.set(id, current);
    try {
      return await current;
    } finally {
      if (this.taskMutations.get(id) === current) this.taskMutations.delete(id);
    }
  }
  async mutateTask(id, mutation) {
    return this.taskTransaction(id, async (task) => {
      await mutation(task);
      return true;
    });
  }
  async taskRuns(task, includeMissing = false) {
    const ids = new Set([...(task.runIds ?? []), task.runId].filter(Boolean));
    for (const run of this.runs.values())
      if (run.threadId === task.id) ids.add(run.id);
    const records = await Promise.all(
      [...ids].map(async (id) => [id, await this.status(id).catch(() => null)]),
    );
    const runs = records
      .map(([, run]) => run)
      .filter(Boolean)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const view = {
      active: runs.filter((run) => !run.terminal),
      recent: runs.filter((run) => run.terminal).slice(0, RECENT_RUN_LIMIT),
    };
    if (includeMissing)
      view.missing = records
        .filter(([, run]) => !run)
        .map(([id]) => id)
        .slice(-RECENT_RUN_LIMIT);
    return view;
  }
  async codexRunId(args) {
    if (args.runId) return args.runId;
    const task = await taskRead(claudeTaskId(args.sessionId));
    const runs = await this.taskRuns(task);
    if (runs.active.length > 1)
      throw new Error(
        `runId is required because this session has multiple active runs: ${runs.active.map((run) => run.id).join(", ")}`,
      );
    const run = runs.active[0] ?? runs.recent[0];
    if (!run) throw new Error("This session has no delegated runs.");
    return run.id;
  }
  async inspect(id, operation) {
    const config = await configRead();
    const snapshot = await this.snapshot(id);
    const identity = await projectIdentity(snapshot.cwd);
    const task = await this.mutateTask(id, (current) => {
      Object.assign(current, identity);
    });
    const gateways = await readGatewayQuota(
      config.gateways,
      await resolveAdminCredentials(config),
    );
    return {
      task,
      snapshot,
      gateways,
      binding: task.workerBinding ?? null,
      workspace: workspaceView(task),
      route: pinnedRoute(config, task, gateways, operation, "codex"),
      // What a start without overrides would run, including fallback provenance, so the
      // coordinator can report it before launching; a refusal is reported, not thrown.
      selection: previewSelection(config, snapshot),
    };
  }
  async start(args) {
    if (this.draining)
      throw new Error("Bridge upgrade is in progress; retry afterward.");
    if (this.busy)
      throw new Error("Another delegation is starting; retry shortly.");
    this.busy = true;
    try {
      return await this.startRun(args);
    } finally {
      this.busy = false;
    }
  }
  // runId is a compatibility pointer to the latest run of either slot. An ordinary
  // delegation must not inherit a fresh run unless the coordinator selected it explicitly.
  async previousRun(task, args) {
    if (args.runId) return this.statusFor(task.id, args.runId);
    const previous = !args.fresh && task.runId ? await this.status(task.runId) : null;
    return previous?.fresh ? null : previous;
  }
  // Fails when delegation was switched off, for this task or a target repository, or the
  // bridge began draining, while preflight ran.
  async assertStillEnabled(task, workspace) {
    const latestTask = await taskRead(task.id);
    const disabled = disabledRepository(await configRead(), { ...latestTask, project: task.project }, workspace.map);
    if (disabled)
      throw new Error(`Delegation was disabled during preflight: ${disabled}`);
    if (this.draining)
      throw new Error("Bridge upgrade is in progress; retry afterward.");
  }
  async workerPrompt(worker, config, task, args, workspace) {
    task.memoryEnabled =
      config.memorySharing &&
      (await codexMemoryEnabled(await this.client(), task));
    // Shared memory is the other agent's store, so a same-provider worker gets none.
    const memories =
      worker === "claude" ? await memoryContext(config, task, "codex") : [];
    const brief = withWorkspace(args.prompt, workspace.map, task.cwd);
    return worker === "claude"
      ? handoff(brief, memories, "Codex")
      : codexHandoff(brief, memories, "Codex");
  }
  async startRun(args) {
    const config = await configRead();
    const {
      task,
      snapshot,
      route: decision,
    } = await this.inspect(args.threadId, args.operation);
    if (decision.unavailable) throw new Error(decision.reason);
    if (!delegates(decision, "codex")) throw new Error(decision.reason);
    // A Codex task delegates to Claude (native or gateway) or to Codex behind a gateway.
    const worker = decision.executor;
    const previous = await this.previousRun(task, args);
    const continuation =
      previous?.state === "needs_input" || !!previous?.question;
    // A reply to an isolated run inherits its checkout and provider conversation. The
    // coordinator need not repeat fresh=true, and omitting it must never promote the reply.
    const fresh = args.fresh === true || previous?.fresh === true;
    if (fresh && !task.workerBinding)
      throw new Error(
        "A fresh worker requires an established primary worker binding; delegate once without fresh=true first.",
      );
    // Targets are explicit: the root's own checkout (or `cwd`) and `repos`. Each resolves to
    // a checkout this task owns; the root's starting repository no longer limits the others.
    const id = randomUUID();
    const workspace = await this.workspace(task, {
      fresh,
      previous,
      cwd: args.cwd || previous?.cwd,
      repos: args.repos,
      rootCwd: snapshot.cwd,
      runId: id,
    });
    task.cwd = workspace.cwd;
    const sessionKey = fresh ? null : sessionKeyFor(task.cwd);
    const sessions = resumedSessions(worker, previous, fresh, task, sessionKey, legacySessionKeyFor(task.cwd, decision.gateway));
    task.claudeSession = sessions.claude;
    const codexSession = sessions.codex;
    const replies = continuationReplies({ previous, continuation, worker, decision, args, task, config });
    this.assertOneWriter(workspace.dirs, config);
    await this.recoverOrphans(task, workspace.dirs);
    const permissions = permissionMode(snapshot);
    const selection = workerSelection(worker, config, snapshot, args);
    const roots = extraRoots(workspace.map, task.cwd);
    const codexSandbox = worker === "codex" ? codexPermission(permissions, roots) : null;
    const env = await workerEnv(worker, task, decision, config);
    await this.assertStillEnabled(task, workspace);
    await mkdir(runDir(id), { mode: 0o700 });
    const prompt = await this.workerPrompt(worker, config, task, args, workspace);
    const record = runRecord({ id, worker, task, workspace, sessionKey, fresh, decision, selection, permissions, codexSandbox, codexSession, args });
    await this.launch(
      record,
      {
        runId: id,
        argv: workerArgv({ worker, task, codexSession, selection, permissions, roots, codexSandbox, decision }),
        cwd: task.cwd,
        prompt,
        ...(worker === "codex" ? { input: "text" } : {}),
        background: record.background,
        graceSeconds: config.disconnectGraceSeconds,
        maxRunSeconds: config.maxRunSeconds,
      },
      env,
      config,
    );
    // Starts are serialized (busy), so nothing can claim these between check and claim.
    await claimCheckouts(task.id, workspace.claims);
    await this.mutateTask(task.id, (current) => {
      current.runId = id;
      current.runIds = [...new Set([...(current.runIds ?? []), id])];
      current.supervisionReplies = replies;
      if (!fresh) {
        current.workerBinding ??= bindingFor(decision);
        current.primaryCwd ??= task.cwd;
        current.workspace = workspace.map;
      }
    });
    return this.begin(id);
  }
  // Pool admission keeps the bridge's local invariants: no launch while draining or
  // disabled (globally, for the task, or for its project), verified live settings of
  // the calling task, and no permission wider than that task's own sandbox.
  async poolAdmission(threadId, permission, conversation = null) {
    if (this.draining)
      throw new Error("Bridge upgrade is in progress; retry afterward.");
    await this.poolControl(threadId, conversation);
    const config = await configRead();
    const snapshot = await this.snapshot(threadId);
    const identity = await projectIdentity(snapshot.cwd);
    const task = await this.mutateTask(threadId, (current) => {
      Object.assign(current, identity);
    });
    if (task.disabled || config.projects[task.project] === "off")
      throw new Error("Delegation disabled for this task or project");
    assertPoolAuthority(snapshot, permission);
    return { project: task.project };
  }
  // Answers act on an admitted turn; they need no live snapshot, but off still wins.
  async poolControl(threadId, conversation = null) {
    const config = await configRead();
    if (config.mode === "off") throw new Error("Delegation disabled");
    const caller = await taskRead(threadId);
    if (caller.disabled || (caller.project && config.projects[caller.project] === "off"))
      throw new Error("Delegation disabled for this task or project");
    if (conversation) {
      const owner = await taskRead(conversation.threadId);
      if (owner.disabled || (conversation.project && config.projects[conversation.project] === "off"))
        throw new Error("Delegation is disabled for this conversation's task or project");
    }
  }
  async recoverOrphans(task, dirs = [task.cwd]) {
    // Never launch over an orphan after a service restart. Guardian will expire its lease.
    for (const id of (await readdir(join(home(), "runs"))).filter((id) =>
      /^[0-9a-f-]{36}$/.test(id),
    )) {
      const p = await readJSON(join(runDir(id), "process.json"), null);
      if (p?.state !== "running" && p?.state !== "starting") continue;
      const record = await readJSON(join(runDir(id), "run.json"), null);
      if (
        record &&
        (record.threadId === task.id || overlapping(runDirs(record), dirs)) &&
        !this.runs.has(id)
      ) {
        await writeFile(join(runDir(id), "cancel"), "recovery", {
          mode: 0o600,
        });
        throw new Error(
          "An interrupted run is being cleaned up. Check status before retrying.",
        );
      }
    }
  }
  // Shared by both directions: one guardian owns one worker process group.
  async launch(record, job, env, config) {
    await atomic(join(runDir(record.id), "run.json"), record);
    await atomic(join(runDir(record.id), "job.json"), job);
    const guardian = spawn(
      "python3",
      [
        fileURLToPath(new URL("./guardian.py", import.meta.url)),
        join(runDir(record.id), "job.json"),
      ],
      { env, stdio: ["pipe", "ignore", "pipe"], detached: true },
    );
    const run = {
      ...record,
      guardian,
      offset: 0,
      partial: "",
      decoder: new StringDecoder("utf8"),
      progress: "",
      sequence: 0,
      lastLease: Date.now(),
      grace: config.disconnectGraceSeconds * 1000,
    };
    this.runs.set(record.id, run);
    guardian.stdin.on("error", () => {});
    guardian.stderr.on("data", () => {});
    guardian.on("error", (e) => {
      run.error = e.message;
      run.state = "failed";
      run.terminal = true;
      run.guardianExited = true;
    });
    guardian.on("exit", () => {
      run.guardianExited = true;
    });
    return run;
  }
  begin(id) {
    const run = this.runs.get(id);
    run.timer = setInterval(
      () =>
        this.tick(run).catch((e) => {
          run.error = e.message;
          this.cancel(id).catch(() => {});
        }),
      250,
    );
    this.send(run, { type: "heartbeat" });
    return this.public(run);
  }
  send(run, message) {
    if (!run.guardian.stdin.destroyed)
      run.guardian.stdin.write(JSON.stringify(message) + "\n");
  }
  async tick(run) {
    if (run.ticking) return;
    run.ticking = true;
    try {
      if (
        !run.terminal &&
        (run.background || Date.now() - run.lastLease < run.grace)
      )
        this.send(run, { type: "heartbeat" });
      await this.readEvents(run);
      const processState = await readJSON(
        join(runDir(run.id), "process.json"),
        null,
      );
      if (run.guardianExited && processState?.state === "running" && !(await this.cleanOrphan(run, processState))) return;
      if (processState?.state === "exited" || run.guardianExited) await this.settleRun(run, processState);
    } finally {
      run.ticking = false;
    }
  }
  // Fold the next chunk of the guardian's event log into the run.
  async readEvents(run) {
    let file;
    try {
      file = await open(join(runDir(run.id), "events.jsonl"), "r");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      return;
    }
    try {
      const buffer = Buffer.alloc(65536);
      const { bytesRead } = await file.read(
        buffer,
        0,
        buffer.length,
        run.offset,
      );
      run.offset += bytesRead;
      run.partial += run.decoder.write(buffer.subarray(0, bytesRead));
      if (run.partial.length > 4 * 1024 * 1024)
        throw new Error("Claude emitted an oversized event");
      let end;
      while ((end = run.partial.indexOf("\n")) >= 0) {
        const line = run.partial.slice(0, end);
        run.partial = run.partial.slice(end + 1);
        if (line.trim()) await this.event(run, JSON.parse(line));
      }
    } finally {
      await file.close();
    }
  }
  // The guardian died with its group still recorded as running: clean it, or block
  // replacement (false) when cleanup cannot be verified.
  async cleanOrphan(run, processState) {
    if (!(await stopOrphan(processState))) {
      run.state = "cleanup_pending";
      run.error = "Could not verify orphan cleanup; replacement is blocked";
      clearInterval(run.timer);
      await atomic(join(runDir(run.id), "run.json"), this.public(run));
      return false;
    }
    await atomic(join(runDir(run.id), "process.json"), {
      ...processState,
      state: "exited",
      reason: "Guardian lost; owned group cleaned",
    });
    return true;
  }
  async settleRun(run, processState) {
    // Wait for the last file bytes to be consumed before assigning the final outcome.
    const size = await import("node:fs/promises").then((fs) =>
      fs
        .stat(join(runDir(run.id), "events.jsonl"))
        .then((s) => s.size)
        .catch(() => 0),
    );
    if (run.offset < size) return;
    run.terminal = true;
    if (run.stopping || processState?.interrupted)
      run.state = "interrupted";
    else if (
      !run.result ||
      (processState?.exitCode && processState.exitCode !== 0)
    )
      run.state = "failed";
    clearInterval(run.timer);
    run.guardian.stdin.destroy();
    await atomic(join(runDir(run.id), "run.json"), this.public(run));
    this.runs.delete(run.id);
  }
  async event(run, event) {
    if (run.executor === "codex") return this.codexEvent(run, event);
    const effects = applyClaudeEvent(run, event);
    if (effects.overage) await this.cancel(run.id);
    if (effects.session) {
      await this.mutateTask(run.threadId, (task) => {
        if (!run.fresh) {
          const key = run.sessionKey ?? sessionKeyFor(run.cwd);
          task.claudeSession = effects.session;
          task.sessions = {
            ...task.sessions,
            [key]: effects.session,
          };
        }
      });
    }
    if (effects.ended) this.send(run, { type: "close" });
    if (run.state === "starting") run.state = "running";
    await atomic(join(runDir(run.id), "run.json"), this.public(run));
  }
  async codexEvent(run, event) {
    const ended = applyCodexEvent(run, event);
    if (run.newSession && !run.codexSession) {
      run.codexSession = run.newSession;
      await this.mutateTask(run.threadId, (task) => {
        if (!run.fresh) {
          const key = run.sessionKey ?? sessionKeyFor(run.cwd);
          task.codexSessions = {
            ...task.codexSessions,
            [key]: run.newSession,
          };
        }
      });
    }
    if (ended) this.send(run, { type: "close" });
    if (run.state === "starting") run.state = "running";
    await atomic(join(runDir(run.id), "run.json"), this.public(run));
  }
  public(run) {
    const {
      id,
      executor,
      codexSession,
      threadId,
      cwd,
      workspace,
      dirs,
      sessionKey,
      workerSlot,
      fresh,
      gateway,
      host,
      selection,
      permissions,
      background,
      createdAt,
      state,
      terminal,
      question,
      result,
      claudeSession,
      error,
      progress,
      sequence,
      replySource,
      replyReason,
      dispatch,
    } = run;
    return {
      id,
      executor,
      codexSession,
      threadId,
      cwd,
      workspace: workspace ?? null,
      dirs: dirs ?? [cwd],
      sessionKey,
      workerSlot: workerSlot ?? "primary",
      fresh: fresh === true,
      gateway: gateway ?? null,
      host,
      selection,
      permissions,
      background,
      createdAt,
      state,
      terminal,
      question,
      result,
      claudeSession,
      error,
      progress,
      sequence,
      replySource,
      replyReason,
      dispatch: dispatch ?? null,
    };
  }
  async status(id) {
    const run = this.runs.get(id);
    if (run && run.state !== "cleanup_pending") return this.public(run);
    if (run) this.runs.delete(id);
    const record = await readJSON(join(runDir(id), "run.json"), null);
    if (!record) throw new Error("Unknown run");
    const p = await readJSON(join(runDir(id), "process.json"), null);
    if (
      !record.terminal &&
      p &&
      p.state !== "exited" &&
      p.guardianIdentity &&
      (await identity(p.guardianPid)) !== p.guardianIdentity
    ) {
      if (!(await stopOrphan(p)))
        return {
          ...record,
          state: "cleanup_pending",
          terminal: false,
          error: "Could not verify orphan cleanup; replacement is blocked",
        };
      await atomic(join(runDir(id), "process.json"), {
        ...p,
        state: "exited",
        reason: "Guardian lost; verified child cleanup attempted",
      });
    }
    const current = await readJSON(join(runDir(id), "process.json"), null);
    if (!record.terminal && current?.state === "exited") {
      const recovered = { ...record, state: "interrupted", terminal: true };
      await atomic(join(runDir(id), "run.json"), recovered);
      return recovered;
    }
    return record;
  }
  async statusFor(taskId, id) {
    const run = await this.status(id);
    if (run.threadId !== taskId)
      throw new Error("The requested run belongs to another root session.");
    return run;
  }
  async wait(id, seconds = 25) {
    const run = this.runs.get(id);
    if (!run) return this.status(id);
    const until = Date.now() + Math.min(30, Math.max(0, seconds)) * 1000;
    do {
      run.lastLease = Date.now();
      if (run.terminal || run.question) return this.public(run);
      await new Promise((r) => setTimeout(r, 200));
    } while (Date.now() < until);
    return this.public(run);
  }
  async answer(args) {
    // The coordinator answers as itself (codex or claude) or attests a user's answer.
    if (!["codex", "claude", "user"].includes(args.source))
      throw new Error("Invalid answer source");
    const run = this.runs.get(args.runId);
    if (!run || !run.question)
      throw new Error(
        "No live question; use start with the same task to resume a completed question turn.",
      );
    const task = await taskRead(run.threadId);
    const config = await configRead();
    const autonomous = args.source !== "user";
    if (autonomous && task.supervisionReplies >= config.maxSupervisionReplies)
      throw new Error("Supervision limit reached. Escalate to the user.");
    if (run.question.id !== args.questionId)
      throw new Error("Stale question id");
    if (
      run.question.request?.tool_name !== "AskUserQuestion" &&
      args.source !== "user"
    )
      throw new Error(
        "Tool permission requests require user approval; this bridge only delegates clarification judgment.",
      );
    if (autonomous && !args.reason)
      throw new Error(
        "Record why this clarification does not require the user.",
      );
    const response = {
      behavior: args.allow === false ? "deny" : "allow",
      ...(args.allow === false
        ? { message: args.reason || "Denied" }
        : {
            updatedInput: {
              ...run.question.request.input,
              ...(args.answers ? { answers: args.answers } : {}),
            },
          }),
    };
    this.send(run, {
      type: "input",
      message: {
        type: "control_response",
        response: { subtype: "success", request_id: args.questionId, response },
      },
    });
    const updated = await this.mutateTask(run.threadId, (current) => {
      current.supervisionReplies =
        args.source === "user" ? 0 : current.supervisionReplies + 1;
      current.answerSequence = (current.answerSequence || 0) + 1;
    });
    await writeFile(
      join(runDir(run.id), `answer-${updated.answerSequence}.json`),
      JSON.stringify({
        source: args.source,
        reason: args.reason,
        answers: args.answers,
        questionId: args.questionId,
      }),
      { mode: 0o600 },
    );
    run.question = null;
    run.state = "running";
    run.lastLease = Date.now();
    return this.public(run);
  }
  async cancel(id) {
    await writeFile(join(runDir(id), "cancel"), "stop", { mode: 0o600 });
    const run = this.runs.get(id);
    if (run) {
      run.stopping = true;
      this.send(run, { type: "stop" });
    }
    return { stopping: id };
  }
  // Claude-coordinated sessions: Claude is primary and Codex is the delegate.
  async claudeInspect(sessionId, operation) {
    const config = await configRead();
    const taskId = claudeTaskId(sessionId);
    const gateways = await readGatewayQuota(
      config.gateways,
      await resolveAdminCredentials(config),
    );
    let runs;
    const task = await this.taskTransaction(taskId, async (current) => {
      let changed = false;
      if (current.session?.cwd) {
        const identity = await projectIdentity(current.session.cwd);
        if (current.cwd !== identity.cwd || current.project !== identity.project) {
          Object.assign(current, identity);
          changed = true;
        }
      }
      runs = await this.taskRuns(current, true);
      const known = [...runs.active, ...runs.recent].map((run) => run.id);
      const retained = [...new Set([...known, ...runs.missing])];
      if (
        retained.length !== (current.runIds ?? []).length ||
        retained.some((id, index) => id !== current.runIds[index])
      ) {
        current.runIds = retained;
        changed = true;
      }
      const runId = known.includes(current.runId) ? current.runId : known[0] ?? null;
      if (current.runId !== runId) {
        current.runId = runId;
        changed = true;
      }
      return changed;
    });
    delete runs.missing;
    return {
      task,
      session: task.session ?? null,
      runs,
      gateways,
      binding: task.workerBinding ?? null,
      workspace: workspaceView(task),
      route: pinnedRoute(config, task, gateways, operation, "claude"),
    };
  }
  async codexStart(args) {
    if (this.draining)
      throw new Error("Bridge upgrade is in progress; retry afterward.");
    if (this.busy)
      throw new Error("Another delegation is starting; retry shortly.");
    this.busy = true;
    try {
      return await this.claudeRootStart(args);
    } finally {
      this.busy = false;
    }
  }
  // The run a Claude-rooted delegation continues: the named run, or for a reply the one
  // run awaiting input.
  async claudeReplyTarget(args, task, runs) {
    const replying = args.replySource != null || args.replyReason != null;
    let previous = null;
    if (args.runId) {
      previous = await this.status(args.runId);
      if (previous.threadId !== task.id)
        throw new Error("The requested run belongs to another Claude session.");
      if (args.cwd && (await projectIdentity(args.cwd)).cwd !== previous.cwd)
        throw new Error("The requested run belongs to a different working directory.");
    }
    if (!replying) return previous;
    const awaiting = [...runs.active, ...runs.recent].filter(
      (run) => run.state === "needs_input",
    );
    if (previous && previous.state !== "needs_input")
      throw new Error(`Run ${previous.id} is not awaiting input.`);
    if (!previous && awaiting.length === 0)
      throw new Error("no run is awaiting input.");
    if (!previous && awaiting.length > 1)
      throw new Error(
        `runId is required because multiple runs are awaiting input: ${awaiting.map((run) => run.id).join(", ")}`,
      );
    return previous ?? awaiting[0];
  }
  async claudeRootStart(args) {
    const config = await configRead();
    const { task, runs, route: decision } = await this.claudeInspect(
      args.sessionId,
      args.operation,
    );
    if (decision.unavailable) throw new Error(decision.reason);
    if (!delegates(decision, "claude")) throw new Error(decision.reason);
    // A Claude session delegates to Codex (native or gateway) or to Claude behind a gateway.
    const worker = decision.executor;
    const session = verifiedSession(task);
    let previous = await this.claudeReplyTarget(args, task, runs);
    // A reply to an isolated run stays isolated even when the caller omits fresh=true.
    // It may resume that run's provider conversation, but never promote it into or replace
    // the root session's primary worker conversation.
    const fresh = args.fresh === true || previous?.fresh === true;
    if (fresh && !task.workerBinding)
      throw new Error(
        "A fresh worker requires an established primary worker binding; delegate once without fresh=true first.",
      );
    const id = randomUUID();
    const workspace = await this.workspace(task, {
      fresh,
      previous,
      cwd: args.cwd || previous?.cwd,
      repos: args.repos,
      rootCwd: session.cwd,
      runId: id,
    });
    task.cwd = workspace.cwd;
    const sessionKey = fresh ? null : sessionKeyFor(task.cwd);
    previous = sameRouteRun(previous, runs, sameRouteAs(worker, decision, task.cwd, fresh), fresh, decision);
    const { codexSession, claudeSession } = claudeRootSessions(worker, previous, fresh, task, sessionKey, legacySessionKeyFor(task.cwd, decision.gateway));
    const replies = claudeRootReplies(previous, args, task, config);
    this.assertOneWriter(workspace.dirs, config);
    await this.recoverOrphans(task, workspace.dirs);
    const roots = extraRoots(workspace.map, task.cwd);
    const selection = claudeRootSelection(worker, config, session, args);
    const permission =
      worker === "codex"
        ? codexPermission(session.permissionMode, roots)
        : { name: session.permissionMode };
    const env = await claudeRootEnv(worker, task, decision, config);
    await this.assertStillEnabled(task, workspace);
    await mkdir(runDir(id), { mode: 0o700 });
    const prompt = await claudeRootPrompt(worker, config, task, args, workspace);
    const record = claudeRootRecord({ id, worker, task, args, workspace, sessionKey, fresh, decision, selection, permission, codexSession, claudeSession });
    await this.launch(
      record,
      {
        runId: id,
        argv: claudeRootArgv({ worker, codexSession, claudeSession, selection, permission, decision, roots }),
        cwd: task.cwd,
        prompt,
        ...(worker === "codex" ? { input: "text" } : {}),
        background: record.background,
        graceSeconds: config.disconnectGraceSeconds,
        maxRunSeconds: config.maxRunSeconds,
      },
      env,
      config,
    );
    // Starts are serialized (busy), so nothing can claim these between check and claim.
    await claimCheckouts(task.id, workspace.claims);
    await this.mutateTask(task.id, (current) => recordClaudeRootStart(current, { id, config, replies, task, fresh, decision, workspace }));
    return this.begin(id);
  }
  // Resolves this delegation's checkouts. The primary conversation keeps one working directory
  // and a persistent map of task-owned checkouts; adding or naming another repository joins that
  // conversation instead of starting a new worker. A fresh conversation gets its own map, kept on
  // its run record, and never shares a checkout of the primary map. A record that predates the
  // map is migrated from its primary directory, preserving its saved conversation.
  async workspace(task, { fresh, previous, cwd, repos = [], rootCwd, runId }) {
    const primaryMap =
      task.workspace ?? (task.primaryCwd ? await legacyMap(task.primaryCwd) : {});
    const { anchor, map } = await slotWorkspace(task, fresh, previous, primaryMap);
    const targets = workspaceTargets(anchor, cwd, rootCwd, repos);
    const resolved = await resolveWorkspace({
      taskId: task.id,
      slot: fresh ? `fresh-${runId.slice(0, 8)}` : "primary",
      map,
      targets,
      avoid: fresh ? checkouts(primaryMap) : [],
    });
    const workCwd = anchor ?? resolved.first;
    return {
      cwd: workCwd,
      map: resolved.map,
      claims: resolved.claims,
      dirs: [...new Set([workCwd, ...checkouts(resolved.map)])],
    };
  }
  // One writer per checkout across every task: no two active runs may share or nest a directory.
  assertOneWriter(dirs, config) {
    const active = [...this.runs.values()].filter((r) => !r.terminal);
    const owner = active.find((run) => overlapping(runDirs(run), dirs));
    if (owner)
      throw new Error(
        `Run ${owner.id} already owns this working directory (${runDirs(owner).join(", ")}). Wait for or stop that run before starting another writer here.`,
      );
    if (active.length >= config.maxConcurrent)
      throw new Error("Delegation concurrency limit reached.");
  }
  // Hooks never decide whether a user turn should be delegated. They only expose the active
  // tool contract and preserve verified session metadata and edit-race protection.
  sessionHook(primary, args, advice, active) {
    if (!active || args.event !== "SessionStart") return advice;
    return {
      ...advice,
      systemMessage: readiness(active.mode, active.inspected?.route, primary, active.failure),
    };
  }
  // Refuses the coordinator's native edits inside a checkout its own worker is writing. It
  // prevents an accidental race; shell commands and unknown tools are not inspected.
  async guard(taskId, args) {
    const targets = editTargets(args.tool, args.toolInput, args.cwd);
    if (!targets) return {};
    const { active } = await this.taskRuns(await taskRead(taskId));
    for (const run of active) {
      for (const target of targets) {
        const path = await canonical(target);
        const dir = runDirs(run).find((candidate) => within(path, candidate));
        if (dir)
          return {
            deny: `Factory run ${run.id} (${run.executor}) is writing in ${dir}. Wait for it, or stop it and wait until it is terminal, before editing files there.`,
          };
      }
    }
    return {};
  }
  // Factory's mode for this task, or null when it is off.
  active(config, task, detail) {
    if (config.mode === "off") return null;
    const mode = config.projects[task.project] ?? config.mode;
    return mode === "off" ? null : { mode, ...detail };
  }
  async codexHook(args) {
    const config = await configRead();
    if (config.mode === "off") return {};
    const taskId = claudeTaskId(args.sessionId);
    if (args.event === "PreToolUse") return this.guard(taskId, args);
    const task = await taskRead(taskId);
    if (args.event === "SessionEnd") {
      for (const run of (await this.taskRuns(task)).active)
        if (!run.background) await this.cancel(run.id);
      return {};
    }
    // Hook input is Claude's own report of the session, so it is the settings source.
    await this.mutateTask(taskId, (current) => {
      const previous = current.session ?? {};
      current.session = {
        cwd: args.cwd ?? previous.cwd,
        permissionMode: args.permissionMode ?? previous.permissionMode,
        model: args.model ?? previous.model,
        effort: args.effort ?? previous.effort,
        updatedAt: Date.now(),
      };
    });
    // Claude's SessionStart payload can omit permission_mode (notably in the CLI).
    // UserPromptSubmit reports the live mode before a model can call Factory, so use it only
    // to refresh verified settings. It never dispatches work or adds per-turn model context.
    if (args.event === "UserPromptSubmit") return {};
    let s;
    try {
      s = await this.claudeInspect(args.sessionId);
    } catch (e) {
      return this.sessionHook(
        "claude",
        args,
        { additionalContext: `Codex delegation unavailable: ${e.message}. Do not infer permissions or allowance.` },
        this.active(config, await taskRead(taskId), { failure: e.message }),
      );
    }
    return this.sessionHook(
      "claude",
      args,
      { additionalContext: `Factory tools are available for this Claude root session. Use factory_inspect and factory_delegate when delegation is useful or the user requests it; do not call them when the user requests local work. The root remains responsible for the brief, supervision and verification. Current binding/availability: ${JSON.stringify({ binding: s.binding, route: s.route })}.` },
      this.active(config, s.task, { inspected: s }),
    );
  }
  rootTaskId(rootKind, rootId) {
    if (rootKind === "codex") return rootId;
    if (rootKind === "claude") return claudeTaskId(rootId);
    throw new Error("Unknown Factory root kind.");
  }
  async factoryInspect(args) {
    const codex = args.rootKind === "codex";
    const status = await (codex
      ? this.inspect(args.rootId, args.provider)
      : this.claudeInspect(args.rootId, args.provider));
    const rootEffort = codex ? status.snapshot?.reasoningEffort : status.session?.effort;
    const worker = status.route?.executor;
    if (worker) status.selection = factoryWorkerSelection(worker, await configRead(), args.rootKind, rootEffort);
    return status;
  }
  async factoryDelegate(args) {
    const modelProvider = explicitModelProvider(args.model);
    if (modelProvider && args.provider && modelProvider !== args.provider)
      throw new Error("The requested model belongs to a different worker provider.");
    const common = {
      prompt: args.prompt,
      runId: args.runId,
      cwd: args.cwd,
      repos: args.repos,
      operation: args.provider ?? modelProvider,
      model: args.model,
      effort: args.effort,
      speed: args.speed,
      factoryDefaults: true,
      background: args.background,
      fresh: args.fresh,
      replySource:
        args.replySource === "root"
          ? args.rootKind
          : args.replySource,
      replyReason: args.replyReason,
    };
    return args.rootKind === "codex"
      ? this.start({ ...common, threadId: args.rootId })
      : this.codexStart({ ...common, sessionId: args.rootId });
  }
  async factoryRun(args) {
    return this.statusFor(this.rootTaskId(args.rootKind, args.rootId), args.runId);
  }
  async factoryWait(args) {
    await this.factoryRun(args);
    return this.wait(args.runId, args.seconds);
  }
  async factoryAnswer(args) {
    await this.factoryRun(args);
    return this.answer({
      ...args,
      source: args.source === "root" ? args.rootKind : args.source,
    });
  }
  async factoryStop(args) {
    await this.factoryRun(args);
    return this.cancel(args.runId);
  }
  async setOverride(taskId, executor) {
    if (!["auto", "codex", "claude", "off"].includes(executor))
      throw new Error("Invalid override");
    return this.mutateTask(taskId, (task) => {
      if (
        task.workerBinding &&
        !["auto", "off", task.workerBinding.executor].includes(executor)
      )
        throw new Error(
          `This root session is pinned to ${describeBinding(task.workerBinding)}; start a new root session to choose ${executor}.`,
        );
      task.disabled = executor === "off";
      if (!task.workerBinding)
        task.override = executor === "off" ? "auto" : executor;
    });
  }
  async dispatch(method, args = {}) {
    const handler = BRIDGE_OPERATIONS.get(method);
    if (handler) return handler(this, args);
    // Remote pool turns are owned by Paperclip's runner, not this service.
    if (method.startsWith("hq.")) return this.hq.dispatch(method.slice(3), args);
    if (method.startsWith("pool.")) return this.pool.dispatch(method.slice(5), args);
    throw new Error("Unknown bridge operation");
  }
  async configure(args) {
    if (!args.value) return configRead();
    const value = await configWrite(args.value);
    if (value.mode === "off") {
      for (const run of this.runs.values())
        if (!run.terminal) await this.cancel(run.id);
      await this.pool.stopAll().catch(() => {});
    }
    return value;
  }
  // Drain for an upgrade only when nothing owned by this service can still be running.
  async shutdown() {
    this.draining = true;
    try {
      if (this.busy)
        throw new Error("A Claude delegation is starting; retry the upgrade.");
      if ([...this.runs.values()].some((run) => !run.terminal))
        throw new Error("Active Claude runs prevent a bridge upgrade.");
      await this.retireRecordedProcesses();
      return { stopping: true };
    } catch (error) {
      this.draining = false;
      throw error;
    }
  }
  async retireRecordedProcesses() {
    for (const id of (await readdir(join(home(), "runs"))).filter((id) =>
      /^[0-9a-f-]{36}$/.test(id),
    )) {
      const path = join(runDir(id), "process.json");
      const owned = await readJSON(path, null);
      if (!["starting", "running"].includes(owned?.state)) continue;
      const ownership = await this.processOwnership(owned);
      if (ownership === "live")
        throw new Error("An owned Claude process prevents a bridge upgrade.");
      if (ownership === "unknown")
        throw new Error(
          "Claude process ownership could not be verified; bridge upgrade refused.",
        );
      await atomic(path, {
        ...owned,
        state: "exited",
        reason: "Recorded process identities are no longer live",
      });
    }
  }
  // A gateway Claude worker can ask live; its Claude coordinator answers here.
  async claudeAnswer(args) {
    const runId = await this.codexRunId(args);
    const run = await this.status(runId);
    if (run.threadId !== claudeTaskId(args.sessionId))
      throw new Error("The requested run belongs to another Claude session.");
    return this.answer({ ...args, runId });
  }
  async claudeMemories(args) {
    const { task } = await this.claudeInspect(args.sessionId);
    task.memoryEnabled = (await configRead()).memorySharing;
    return memoryContext(await configRead(), task, args.owner);
  }
  async codexMemories(args) {
    const { task } = await this.inspect(args.threadId);
    task.memoryEnabled = await codexMemoryEnabled(await this.client(), task);
    return memoryContext(await configRead(), task, args.owner);
  }
  async rootHook(args) {
    const config = await configRead();
    if (config.mode === "off") return {};
    if (args.event === "PreToolUse") return this.guard(args.threadId, args);
    const task = await taskRead(args.threadId);
    if (["Interrupt", "SessionEnd"].includes(args.event)) {
      if (task.runId) {
        const r = await this.status(task.runId);
        if (!r.terminal && (args.event === "Interrupt" || !r.background))
          await this.cancel(task.runId);
      }
      return {};
    }
    let s;
    try {
      s = await this.inspect(args.threadId);
    } catch (e) {
      return this.sessionHook(
        "codex",
        args,
        { additionalContext: `Factory tools are unavailable: ${e.message}. Do not infer permissions or allowance.` },
        this.active(config, task, { failure: e.message }),
      );
    }
    return this.sessionHook(
      "codex",
      args,
      { additionalContext: `Factory tools are available for this Codex root task. Use factory_inspect and factory_delegate when delegation is useful or the user requests it; do not call them when the user requests local work. The root remains responsible for the brief, supervision and verification. Current binding/availability: ${JSON.stringify({ binding: s.binding, route: s.route })}.` },
      this.active(config, s.task, { inspected: s }),
    );
  }

}
const workspaceView = (task) => ({
  cwd: task.primaryCwd ?? null,
  repositories: task.workspace ?? null,
});
function withWorkspace(prompt, map, cwd) {
  const note = workspaceNote(map, cwd);
  return note ? `${note}\n\n${prompt}` : prompt;
}
const briefRun = (run) => ({
  id: run.id,
  executor: run.executor,
  gateway: run.gateway ?? null,
  cwd: run.cwd,
  state: run.state,
  question: run.result?.question || run.result?.summary || null,
});
export function claudeTaskId(sessionId) {
  if (!/^[a-zA-Z0-9-]{1,90}$/.test(sessionId ?? ""))
    throw new Error("Invalid Claude session id");
  return `claude_${sessionId}`;
}
export async function serve() {
  await initStore();
  const manager = new Manager();
  let lastRequest = Date.now();
  const server = http.createServer(async (req, res) => {
    try {
      lastRequest = Date.now();
      if (req.method !== "POST" || req.url !== "/rpc") {
        res.writeHead(404);
        return res.end();
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1024 * 1024) throw new Error("Request too large");
      }
      const { method, args } = JSON.parse(body);
      const result = await manager.dispatch(method, args);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result }));
      if (method === "shutdown") setImmediate(stop);
    } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: e.message }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(join(home(), "bridge.sock"), resolve);
  });
  await chmod(join(home(), "bridge.sock"), 0o600);
  const stop = async () => {
    for (const r of manager.runs.values())
      if (!r.terminal) await manager.cancel(r.id);
    server.close();
    manager.viewer.close();
    manager.codex?.close();
    setTimeout(() => process.exit(), 11000).unref();
  };
  const idle = setInterval(() => {
    if (manager.runs.size === 0 && Date.now() - lastRequest > 300000) {
      clearInterval(idle);
      stop();
    }
  }, 30000);
  idle.unref();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  return { server, manager };
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  serve().catch((e) => {
    process.stderr.write(e.message + "\n");
    process.exitCode = 1;
  });
