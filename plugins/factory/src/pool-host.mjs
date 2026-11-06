import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hostname } from "node:os";
import { StringDecoder } from "node:string_decoder";
import { z } from "zod";
import { codexEnv, codexPermission, home, subscriptionEnv } from "./config.mjs";
import { atomic, initStore, readJSON, runDir } from "./store.mjs";
import { checkClaude, claudeArgs } from "./claude.mjs";
import { checkCodex, codexArgs } from "./codex-exec.mjs";
import { identity, identityStatus, ownedProcessState, stopOrphan } from "./processes.mjs";
import { canonical, ENVELOPE, inside, judgeQuota, loadHost, PROFILE_NAME, sanitizeQuota, sha256 } from "./pool-config.mjs";
export { ENVELOPE };
import { Manager } from "./service.mjs";

// One provider turn on this host, owned by the controller's pool runner through this
// process's stdin. Line one is the envelope; later lines are heartbeats, answers and
// stop. EOF means the runner or SSH is gone, and the turn stops. Stdout carries only
// JSON lines: accepted/refused, every provider event, session, quota and a receipt.
export const EXIT = { ok: 0, refused: 75, config: 78, stopped: 124, unknown: 125 };
const envelopeSchema = z
  .object({
    schema: z.literal(ENVELOPE),
    runUuid: z.string().regex(/^[0-9a-f]{32}$/),
    profile: z.string().regex(PROFILE_NAME),
    bindingSha256: z.string().regex(/^[0-9a-f]{64}$/),
    conversationId: z.string().uuid(),
    turn: z.number().int().min(1).max(10000),
    session: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).nullable(),
    prompt: z.string().min(1).max(2 * 1024 * 1024),
    paperclipRunId: z.string().uuid().nullable(),
  })
  .strict();
const receiptPath = (runUuid) => join(home(), "pool-runs", `${runUuid}.json`);
const lockDir = (workspace) => join(home(), "pool-locks", sha256(workspace).slice(0, 32));
const fixed = (message) => String(message).split("\n")[0].slice(0, 240);
export async function poolHandoff(provider, prompt, resumed) {
  if (resumed) return `Follow-up from the coordinator in this same session:\n\n${prompt}`;
  const text = await readFile(new URL("../prompts/pool-handoff.md", import.meta.url), "utf8");
  const questions =
    provider === "claude"
      ? "If you need clarification, call AskUserQuestion. The coordinator may answer routine, reversible questions with a recorded reason; tool permission requests go to the user."
      : "You cannot ask mid-turn. If you genuinely need clarification, stop and report outcome needs_input with the question.";
  return `${text.replace("{questions}", questions)}\n\nTask:\n${prompt}`;
}
export function tokenUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const tokens = Object.fromEntries(
    Object.entries(usage).filter(([key, value]) => /^[a-z_]{1,48}$/.test(key) && Number.isFinite(value) && value >= 0),
  );
  return Object.keys(tokens).length ? tokens : null;
}
export function nativeEnv(config, env = process.env) {
  // Built from nothing: no PAPERCLIP_*, provider keys or controller variables.
  const out = { PATH: config.path, LANG: env.LANG || "en_US.UTF-8", TMPDIR: env.TMPDIR || "/tmp" };
  for (const key of ["HOME", "USER", "LOGNAME"]) if (env[key]) out[key] = env[key];
  return out;
}
export async function readQuota(quota, cwd, env, timeoutSeconds = quota.timeoutSeconds) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(quota.command[0], quota.command.slice(1), { cwd, env, stdio: ["ignore", "pipe", "ignore"], detached: true });
    } catch {
      return resolve({ snapshot: null, error: "quota reader could not start" });
    }
    let text = "";
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
      resolve({ snapshot: null, error: "quota read timed out" });
    }, timeoutSeconds * 1000);
    child.stdout.on("data", (b) => {
      text += b;
      if (text.length > 65536) child.kill("SIGKILL");
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ snapshot: null, error: "quota reader could not start" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve({ snapshot: null, error: "quota read failed" });
      try {
        resolve({ snapshot: JSON.parse(text), error: null });
      } catch {
        resolve({ snapshot: null, error: "quota read returned malformed output" });
      }
    });
  });
}
// The admission receipt, or the verdict when there is none to judge.
async function receiptOrTombstone(runUuid) {
  const receipt = await readJSON(receiptPath(runUuid), null);
  if (receipt) return { receipt };
  // Never admitted here. Admission creates this same path exclusively before it can
  // lock or launch, so claiming it first as a tombstone proves no launch can follow:
  // a late envelope with this id is refused as a duplicate. Losing that race means a
  // real admission exists, which is judged below like any other receipt.
  try {
    await writeFile(receiptPath(runUuid), JSON.stringify({ runUuid, state: "tombstoned", termination: "not-started", tombstonedAt: Date.now() }) + "\n", { flag: "wx", mode: 0o600 });
    return { state: "terminated" };
  } catch (error) {
    if (error.code !== "EEXIST") return { state: "unknown" };
    const raced = await readJSON(receiptPath(runUuid), null).catch(() => null);
    return raced ? { receipt: raced } : { state: "unknown" };
  }
}
// An unreadable process table, or a live pid whose identity was never captured, is
// not proof the admitting process is gone: it may still launch. Only an absent pid or
// a different process may go on to the no-launch proof (null).
async function admittingProcessVerdict(receipt) {
  if (!receipt.poolPid) return null;
  const seen = await identityStatus(receipt.poolPid);
  if (seen.state === "unknown") return "unknown";
  if (seen.state === "alive" && !receipt.poolIdentity) return "unknown";
  if (seen.state === "alive" && seen.identity === receipt.poolIdentity) return "active";
  return null;
}
// "active" or "unknown" when the launched process may still run; otherwise whether its end is proven.
async function launchedProcessProof(receipt) {
  const owned = await readJSON(join(runDir(receipt.bridgeRunId), "process.json"), null);
  if (owned?.state === "exited") return true;
  if (!owned) return false;
  const state = await ownedProcessState(owned);
  if (state === "live") return "active";
  if (state === "unknown") return "unknown";
  return stopOrphan(owned);
}
// A previous turn is over only when its receipt or a process census proves it.
export async function reconcileRun(runUuid) {
  const found = await receiptOrTombstone(runUuid);
  if (!found.receipt) return found.state;
  const { receipt } = found;
  if (["verified", "not-started"].includes(receipt.termination)) return "terminated";
  const admitting = await admittingProcessVerdict(receipt);
  if (admitting) return admitting;
  // bridgeRunId is persisted before the guardian starts, so its absence proves no launch.
  if (!receipt.bridgeRunId) {
    await atomic(receiptPath(runUuid), { ...receipt, termination: "not-started", state: "reconciled" });
    return "terminated";
  }
  const proven = await launchedProcessProof(receipt);
  if (proven === "active" || proven === "unknown") return proven;
  if (!proven) return "unknown";
  await atomic(receiptPath(runUuid), { ...receipt, termination: "verified", state: receipt.state === "running" ? "reconciled" : receipt.state, reconciledAt: Date.now() });
  return "terminated";
}
async function acquireWorkspace(workspace, owner) {
  await mkdir(join(home(), "pool-locks"), { recursive: true, mode: 0o700 });
  const dir = lockDir(workspace);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await mkdir(dir, { mode: 0o700 });
      await atomic(join(dir, "owner.json"), owner);
      return null;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const previous = await readJSON(join(dir, "owner.json"), null);
    if (!previous?.runUuid) return "workspace lock has no readable owner; inspect it before replacement";
    const state = await reconcileRun(previous.runUuid);
    if (state === "active") return "another pool turn owns this workspace";
    if (state !== "terminated") return "the previous turn's termination is unknown; workspace quarantined";
    await rm(dir, { recursive: true, force: true });
  }
  return "workspace lock contention";
}
export async function releaseWorkspace(workspace, runUuid) {
  const dir = lockDir(workspace);
  const owner = await readJSON(join(dir, "owner.json"), null);
  if (owner?.runUuid === runUuid) await rm(dir, { recursive: true, force: true });
}
// Feeds the existing tick loop's raw events to the controller before folding them.
class HostManager extends Manager {
  constructor(onEvent) {
    super();
    this.onEvent = onEvent;
  }
  async event(run, event) {
    this.onEvent(run, event);
    return super.event(run, event);
  }
}
function lineReader(input, onLine, onEnd) {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  input.on("data", (chunk) => {
    buffer += decoder.write(chunk);
    if (buffer.length > 4 * 1024 * 1024) {
      buffer = "";
      onLine(null);
      return;
    }
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (line.trim()) onLine(line);
    }
  });
  input.on("end", onEnd);
  input.on("close", onEnd);
  input.on("error", onEnd);
}
// One admitted turn on this host: envelope, receipt, workspace lock, provider run and
// the controller's control stream. Each step records to the receipt before it acts.
class HostTurn {
  handler = null;
  ended = false;
  onEnd = () => {};
  // Lines that arrive during admission are kept, so a stop cannot be lost before launch.
  early = [];
  locked = false;
  stopReason = null;
  sessionSeen = null;
  constructor(config, env, emit) {
    this.config = config;
    this.env = env;
    this.emit = emit;
  }
  readFirstLine(input) {
    let resolveFirst;
    const first = new Promise((r) => (resolveFirst = r));
    let gotFirst = false;
    lineReader(
      input,
      (line) => {
        if (!gotFirst) {
          gotFirst = true;
          resolveFirst(line);
        } else if (this.handler) this.handler(line);
        else this.early.push(line);
      },
      () => {
        if (this.ended) return;
        this.ended = true;
        resolveFirst(undefined);
        this.onEnd();
      },
    );
    return first;
  }
  // True when the envelope parses and matches this host's staged binding; otherwise refused.
  acceptEnvelope(line) {
    try {
      this.envelope = envelopeSchema.parse(JSON.parse(line ?? ""));
    } catch {
      this.emit({ pool: "refused", category: "envelope", detail: "missing or malformed envelope" });
      return false;
    }
    const entry = this.config.profiles[this.envelope.profile];
    if (!entry || entry.bindingSha256 !== this.envelope.bindingSha256) {
      this.emit({ pool: "refused", category: "binding", detail: "envelope does not match this host's staged profile binding" });
      return false;
    }
    // The host's staged entry, not the envelope, decides provider, workspace and selection.
    this.entry = entry;
    return true;
  }
  // Creates the receipt exclusively; the refusal code when this run uuid was already admitted.
  async createReceipt() {
    const { envelope, config } = this;
    const { provider, workspace, model, effort, permission } = this.entry;
    this.poolIdentity = await identity(process.pid);
    this.receipt = {
      schema: "factory-pool-receipt/1", runUuid: envelope.runUuid, hostId: config.hostId,
      profile: envelope.profile, provider, workspace, model, effort, permission,
      conversationId: envelope.conversationId, turn: envelope.turn, paperclipRunId: envelope.paperclipRunId,
      requestedSession: envelope.session, poolPid: process.pid, poolIdentity: this.poolIdentity,
      state: "admitting", termination: "pending", createdAt: Date.now(),
    };
    try {
      await writeFile(receiptPath(envelope.runUuid), JSON.stringify(this.receipt, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      this.emit({ pool: "refused", category: "duplicate", detail: "this run uuid was already admitted on this host" });
      return EXIT.refused;
    }
    return undefined;
  }
  save() {
    return atomic(receiptPath(this.envelope.runUuid), this.receipt);
  }
  async finish(fields, code) {
    const { receipt, envelope } = this;
    const { workspace } = this.entry;
    Object.assign(receipt, fields, { code, endedAt: Date.now() });
    await this.save();
    if (this.locked && ["verified", "not-started"].includes(receipt.termination)) await releaseWorkspace(workspace, envelope.runUuid);
    else if (this.locked) await atomic(join(lockDir(workspace), "owner.json"), { runUuid: envelope.runUuid, quarantined: true });
    const { poolPid: _pid, poolIdentity: _, ...visible } = receipt;
    this.emit({ pool: "receipt", ...visible });
    return code;
  }
  refuse(category, detail, code = EXIT.refused) {
    this.emit({ pool: "refused", category, detail: fixed(detail) });
    return this.finish({ state: "refused", termination: "not-started", stopReason: `${category}: ${fixed(detail)}` }, code);
  }
  // Re-checked at launch: the directory could have been replaced since the file loaded.
  async workspaceGate() {
    const { workspace } = this.entry;
    const info = await lstat(workspace).catch(() => null);
    if (!info?.isDirectory()) return this.refuse("workspace", "workspace is not a real directory", EXIT.config);
    try {
      await canonical(workspace, "Pool workspace");
    } catch (error) {
      return this.refuse("workspace", error.message, EXIT.config);
    }
    if (inside(home(), workspace)) return this.refuse("workspace", "bridge state must be outside the workspace", EXIT.config);
    const busy = await acquireWorkspace(workspace, { runUuid: this.envelope.runUuid, pid: process.pid, identity: this.poolIdentity, at: Date.now() });
    if (busy) return this.refuse("workspace_busy", busy);
    this.locked = true;
    if (this.ended) return this.refuse("transport", "controller connection closed before launch");
    return undefined;
  }
  async admissionGate() {
    const { provider, workspace } = this.entry;
    const native = nativeEnv(this.config, this.env);
    this.native = native;
    // Auth checks read process.env; replace it so nothing from the transport leaks in.
    for (const name of Object.keys(process.env)) if (name !== "FACTORY_HOME") delete process.env[name];
    Object.assign(process.env, native);
    try {
      if (provider === "claude") await checkClaude(workspace);
      else await checkCodex(workspace);
    } catch (error) {
      return this.refuse("native_auth_unavailable", error.message);
    }
    const quota = this.config.quota[provider];
    this.quota = quota;
    if (!quota) return this.refuse("quota_unavailable", "no native quota command is configured for this provider on this host");
    const before = await readQuota(quota, workspace, native);
    const admission = before.snapshot ? judgeQuota(before.snapshot, quota) : { decision: "unknown", detail: before.error };
    this.receipt.quotaBefore = sanitizeQuota(before.snapshot);
    this.receipt.quotaDecision = admission;
    if (admission.decision !== "admit")
      return this.refuse(admission.decision === "refuse" ? "quota_exhausted" : "quota_unknown", admission.detail);
    if (this.ended) return this.refuse("transport", "controller connection closed before launch");
    if (this.early.some((raw) => { try { return JSON.parse(raw)?.type === "stop"; } catch { return raw == null; } }))
      return this.refuse("stopped", "stop requested before launch");
    return undefined;
  }
  stop(reason) {
    this.stopReason ??= reason;
    return this.manager.cancel(this.id).catch(() => {});
  }
  onEvent(event) {
    const { provider } = this.entry;
    const { receipt, envelope } = this;
    this.emit({ pool: "event", event });
    if (provider === "claude" && event.type === "system" && event.subtype === "init" && typeof event.model === "string")
      receipt.observed.model = event.model.slice(0, 120);
    const tokens = (event.type === "result" || event.type === "turn.completed") && tokenUsage(event.usage);
    // Provider-reported tokens are evidence of work done, not subscription quota.
    if (tokens) receipt.usage = { source: "provider-reported", tokens };
    const reported = provider === "claude" ? event.session_id : event.type === "thread.started" ? event.thread_id : null;
    if (!reported || this.sessionSeen) return;
    this.sessionSeen = reported;
    const drift = this.resumed && reported !== envelope.session;
    receipt.session = reported;
    this.emit({ pool: "session", session: reported, resumed: envelope.session, drift });
    if (drift) {
      this.stopReason = "native session drift";
      this.manager.cancel(this.id).catch(() => {});
    }
  }
  async launch() {
    const { config, envelope, receipt, native } = this;
    const { provider, workspace, model, effort, permission } = this.entry;
    const id = randomUUID();
    this.id = id;
    receipt.bridgeRunId = id;
    receipt.state = "launching";
    await this.save();
    await mkdir(runDir(id), { mode: 0o700 });
    const selection = { model, effort };
    this.resumed = envelope.session != null;
    const argv =
      provider === "claude"
        ? claudeArgs(envelope.session, selection, permission)
        : codexArgs(envelope.session, selection, codexPermission(permission === "read-only" ? "plan" : "acceptEdits"));
    // Requested is what this host passed to the CLI. Observed is only what the provider
    // stream itself names; Codex exec reports no serving model and neither reports effort.
    receipt.requested = { model, effort };
    receipt.observed = { model: "unknown", effort: "unknown", basis: provider === "claude" ? "Claude init event" : "codex exec --json does not report the serving model" };
    this.manager = new HostManager((run, event) => this.onEvent(event));
    await this.manager.launch(
      {
        id, executor: provider, threadId: `pool_${envelope.conversationId}`, cwd: workspace,
        host: hostname(), selection, permissions: permission, background: false, createdAt: Date.now(),
        state: "starting", terminal: false, question: null, result: null,
        claudeSession: provider === "claude" ? envelope.session : null,
        codexSession: provider === "codex" ? envelope.session : null,
      },
      {
        runId: id, argv, cwd: workspace, prompt: await poolHandoff(provider, envelope.prompt, this.resumed),
        ...(provider === "codex" ? { input: "text" } : {}), background: false,
        graceSeconds: config.graceSeconds, maxRunSeconds: config.maxRunSeconds, maxLogBytes: config.maxLogBytes,
      },
      provider === "claude" ? subscriptionEnv(native) : codexEnv(native),
      { disconnectGraceSeconds: config.graceSeconds },
    );
    receipt.state = "running";
    await this.save();
    this.emit({ pool: "accepted", runUuid: envelope.runUuid, hostId: config.hostId, profile: envelope.profile, provider, model, effort, permission, workspace, session: envelope.session });
    this.manager.begin(id);
  }
  control(raw) {
    const run = this.manager.runs.get(this.id);
    let message;
    try {
      message = raw == null ? null : JSON.parse(raw);
    } catch {}
    if (!message) return this.stop("malformed control line");
    if (message.type === "heartbeat") {
      if (run) run.lastLease = Date.now();
    } else if (message.type === "stop") this.stop(message.reason === "cancel" ? "cancelled" : "stop requested");
    else if (message.type === "answer") this.answer(run, message);
  }
  answer(run, message) {
    const requestId = message.message?.response?.request_id;
    // Stale protection is enforced here as well as by the coordinator.
    if (!run?.question || message.message?.type !== "control_response" || requestId !== run.question.id) {
      this.emit({ pool: "answer_refused", questionId: requestId ?? null, reason: "stale or unknown question" });
      return;
    }
    this.manager.send(run, { type: "input", message: message.message });
    this.emit({ pool: "answered", questionId: requestId });
    run.question = null;
    run.state = "running";
  }
  // Unknown mid-run telemetry stops the turn as firmly as a breach.
  startMeter() {
    const { quota, native, receipt } = this;
    const { workspace } = this.entry;
    if (!(quota.meterSeconds > 0)) return null;
    let meter = null;
    return setInterval(async () => {
      if (meter) return;
      meter = readQuota(quota, workspace, native, Math.min(quota.timeoutSeconds, 30));
      const reading = await meter;
      meter = null;
      const verdict = reading.snapshot ? judgeQuota(reading.snapshot, quota, Date.now(), "hardAt") : { decision: "unknown", detail: reading.error };
      (receipt.meter ??= []).push({ ...verdict, at: Date.now() });
      this.emit({ pool: "quota", ...verdict, quota: sanitizeQuota(reading.snapshot) });
      if (verdict.decision !== "admit") this.stop(`meter ${verdict.decision}: ${verdict.detail}`);
    }, quota.meterSeconds * 1000);
  }
  async awaitEnd(pollMs) {
    while (true) {
      const run = this.manager.runs.get(this.id);
      if (!run) return readJSON(join(runDir(this.id), "run.json"), {});
      if (run.state === "cleanup_pending") return { ...this.manager.public(run) };
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }
  async settle(final) {
    const { stopReason } = this;
    const owned = await readJSON(join(runDir(this.id), "process.json"), null);
    const termination = owned?.state === "exited" && final.state !== "cleanup_pending" ? "verified" : "unknown";
    const stopped = !!stopReason || final.state === "interrupted";
    const code = termination !== "verified" ? EXIT.unknown : stopped ? EXIT.stopped : EXIT.ok;
    return this.finish(
      {
        state: final.state, termination, exitCode: owned?.exitCode ?? null, interrupted: owned?.interrupted ?? null,
        stopReason: stopReason ?? (final.state === "interrupted" ? owned?.reason ?? "interrupted" : null),
        session: this.sessionSeen ?? this.envelope.session, result: final.result ?? null, error: final.error ?? null,
      },
      code,
    );
  }
}
export async function runHost({ configPath, input = process.stdin, output = process.stdout, env = process.env, pollMs = 100 }) {
  const emit = (value) => output.write(JSON.stringify(value) + "\n");
  process.env.FACTORY_HOME = dirname(configPath);
  let config;
  try {
    config = await loadHost(configPath);
  } catch (error) {
    emit({ pool: "refused", category: "host_config", detail: fixed(error.message) });
    return EXIT.config;
  }
  await initStore();
  await mkdir(join(home(), "pool-runs"), { recursive: true, mode: 0o700 });
  const turn = new HostTurn(config, env, emit);
  const line = await turn.readFirstLine(input);
  if (!turn.acceptEnvelope(line)) return EXIT.config;
  const duplicate = await turn.createReceipt();
  if (duplicate !== undefined) return duplicate;
  const workspaceRefusal = await turn.workspaceGate();
  if (workspaceRefusal !== undefined) return workspaceRefusal;
  const admissionRefusal = await turn.admissionGate();
  if (admissionRefusal !== undefined) return admissionRefusal;
  await turn.launch();
  turn.handler = (raw) => turn.control(raw);
  for (const raw of turn.early.splice(0)) turn.handler(raw);
  turn.onEnd = () => turn.stop("controller connection lost");
  if (turn.ended) turn.stop("controller connection lost");
  const meterTimer = turn.startMeter();
  const final = await turn.awaitEnd(pollMs);
  if (meterTimer) clearInterval(meterTimer);
  return turn.settle(final);
}
export async function reconcileHost({ configPath, runUuid }) {
  process.env.FACTORY_HOME = dirname(configPath);
  const config = await loadHost(configPath);
  if (!/^[0-9a-f]{32}$/.test(runUuid ?? "")) throw new Error("Invalid run uuid");
  await mkdir(join(home(), "pool-runs"), { recursive: true, mode: 0o700 });
  const state = await reconcileRun(runUuid);
  if (state === "terminated") {
    const receipt = await readJSON(receiptPath(runUuid), null);
    const entry = Object.values(config.profiles).find((p) => p.workspace === receipt?.workspace);
    if (entry) await releaseWorkspace(entry.workspace, runUuid);
  }
  return { runUuid, state };
}
