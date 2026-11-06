import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { atomic, readJSON } from "./store.mjs";
import { identity } from "./processes.mjs";
import { bindingDigest, ENVELOPE, loadPool, sha256, transportArgv, transportEnv } from "./pool-config.mjs";
import { paperclipClient } from "./pool-paperclip.mjs";
import { verifyHQBinding } from "./pool-hq.mjs";
import {
  UUID, claimPath, controlDir, dispositionMarker, dispositionPath, initPool, issueIndex, linkIssue,
  observeDisposition, parseMarker, readConversation, reconcilePath, releaseAccount, reserveAccount, runPath, sessionPath,
  turnPath,
} from "./pool-store.mjs";

// Paperclip's process adapter runs this on the controller host for every pool agent
// run. It owns the turn: it claims it, reserves the account, holds the SSH session whose
// stdin is the remote lease, relays answers and stops, and passes the host's JSON lines
// to stdout, which Paperclip keeps as the run log.
export const RUNNER_EXIT = { ok: 0, refused: 75, config: 78, stopped: 124, unknown: 125 };
const PENDING = new Set(["posting", "unknown", "submitted"]);
export function remoteCommand(profile, args, { spawnImpl = spawn, env = process.env, timeoutMs = 45000 } = {}) {
  return new Promise((resolve) => {
    const argv = transportArgv(profile, ...args);
    let child;
    try {
      child = spawnImpl(argv[0], argv.slice(1), { env: transportEnv(env), stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return resolve(null);
    }
    let text = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (b) => (text = (text + b).slice(-65536)));
    child.on("error", () => {});
    child.on("close", () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(text.trim().split("\n").at(-1)));
      } catch {
        resolve(null);
      }
    });
  });
}
const list = (value) => (Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : []);
// The coordinator may not know this issue's id (an unknown POST outcome). Accept it
// only through the marker of a journaled turn assigned to this exact agent.
async function markedConversation(issue, issueId, profileName, profile) {
  const mark = parseMarker(issue.description);
  if (!mark || issue.assigneeAgentId !== profile.agentId) return null;
  const conversation = await readConversation(mark.conversationId);
  if (!conversation || conversation.profile !== profileName || (conversation.issueId && conversation.issueId !== issueId)) return null;
  const turn = await readJSON(turnPath(conversation.id, mark.turn), null);
  if (turn?.promptSha256 !== mark.promptSha256) return null;
  await linkIssue(conversation.id, issueId, "runner");
  return { ...conversation, issueId };
}
async function locate(api, runId, profileName, profile) {
  const issues = await api.get(`/heartbeat-runs/${runId}/issues`);
  if (!Array.isArray(issues)) throw new Error("Paperclip returned no issue list for this run");
  let first = null;
  for (const entry of issues.slice(0, 20)) {
    const issueId = entry?.issueId ?? entry?.id;
    if (!UUID.test(issueId ?? "")) continue;
    const issue = await api.get(`/issues/${issueId}`);
    if (issue?.id !== issueId) continue;
    first ??= issue;
    const indexed = await readJSON(issueIndex(issueId), null);
    if (indexed) {
      const conversation = await readConversation(indexed.conversationId);
      if (conversation?.profile === profileName) return { conversation, issue };
      continue;
    }
    const conversation = await markedConversation(issue, issueId, profileName, profile);
    if (conversation) return { conversation, issue };
  }
  return { conversation: null, issue: first };
}
// Only a submission Paperclip actually accepted may run. A local journal entry whose
// POST was refused, or is still in flight, has no marker upstream, so a late repair or
// recovery wake cannot execute intent that was never committed.
async function committed(api, conversation, issue, turn, profile) {
  if (issue.assigneeAgentId !== profile.agentId) return false;
  const matches = (mark) => mark?.conversationId === conversation.id && mark.turn === turn.n && mark.promptSha256 === turn.promptSha256;
  if (turn.n === 1) return matches(parseMarker(issue.description));
  return list(await api.get(`/issues/${issue.id}/comments`)).some((comment) => matches(parseMarker(comment?.body)));
}
// Paperclip expects a successful run to leave a run-attributed comment and, for its own
// issue, a disposition other than todo/in_progress. Done is operational status only.
export function dispositionStatus(record) {
  return record.state === "completed" && record.termination === "verified" ? "done" : "blocked";
}
function dispositionText(record) {
  const lines = [`Pool turn ${record.turn}: ${record.state}${record.termination ? ` (termination ${record.termination})` : ""}.`];
  if (record.result?.summary) lines.push(`Summary: ${String(record.result.summary).slice(0, 1500)}`);
  if (record.result?.question) lines.push(`Question: ${String(record.result.question).slice(0, 1000)}`);
  if (record.stopReason) lines.push(`Stop reason: ${String(record.stopReason).slice(0, 300)}`);
  lines.push("Paperclip status is operational only; Git review, CI and acceptance stay separate.");
  return lines.join("\n");
}
// Journal, then one atomic comment+status update. Paperclip ignores comment request ids
// from agents, so an unknown outcome is settled later by observing the marker.
async function dispose(api, conversation, issueId, record, runId) {
  const path = dispositionPath(conversation.id, record.turn);
  const journal = { turn: record.turn, runId, status: dispositionStatus(record), state: "posting", at: Date.now() };
  await atomic(path, journal);
  // Never settle an older turn over a newer journaled one.
  const latest = await readConversation(conversation.id);
  const body = `${dispositionText(record)}\n\n${dispositionMarker(conversation.id, record.turn, runId)}`;
  try {
    if (latest?.turns !== record.turn) {
      await api.post(`/issues/${issueId}/comments`, { body });
      Object.assign(journal, { state: "superseded", status: null });
    } else {
      await api.patch(`/issues/${issueId}`, {
        status: journal.status,
        comment: body,
        // The pinned API refuses blocked without a first-class unblock route.
        // Agent actors can name only themselves; the action directs the operator
        // back to the controlling conversation without granting another owner access.
        unblockDescriptor: journal.status === "blocked" ? {
          owner: { agentId: conversation.agentId },
          action: "Review this turn in the controlling Codex conversation. Resolve its question or preflight refusal, then send an authorized follow-up.",
        } : null,
      });
      journal.state = "applied";
    }
  } catch (error) {
    Object.assign(journal, { state: error.status >= 400 && error.status < 500 ? "rejected" : "unknown", error: error.message });
  }
  journal.at = Date.now();
  await atomic(path, journal);
  return journal;
}
// A wake that launches nothing writes nothing to Paperclip: an old duplicate or recovery
// wake must never change a newer turn's status or re-send an uncertain disposition. It
// only observes, which can settle an unknown disposition on exact positive evidence.
async function observeNoop(api, conversation, issue) {
  if (!conversation || !issue) return null;
  return observeDisposition(api, conversation.id, issue.id);
}
async function stopRequested(conversationId, n) {
  const dir = controlDir(conversationId);
  for (const name of await readdir(dir).catch(() => [])) {
    if (!name.endsWith(".json")) continue;
    const control = await readJSON(join(dir, name), null).catch(() => null);
    if (control?.type === "stop" && control.turn === n) return true;
  }
  return false;
}
function adoptReceipt(record, receipt, refused) {
  Object.assign(record, {
    state: receipt.state, termination: receipt.termination, exitCode: receipt.exitCode ?? null,
    stopReason: receipt.stopReason ?? null, result: receipt.result ?? null, error: receipt.error ?? null,
    requested: receipt.requested ?? null, observed: receipt.observed ?? null, usage: receipt.usage ?? null,
    category: refused?.category ?? null,
  });
  return Number.isInteger(receipt.code) ? receipt.code : RUNNER_EXIT.unknown;
}
// The pool profile bound to this Paperclip agent, or a refusal code already reported.
async function boundProfile(env, say) {
  const runId = env.PAPERCLIP_RUN_ID;
  const agentId = env.PAPERCLIP_AGENT_ID;
  if (!UUID.test(runId ?? "") || !UUID.test(agentId ?? "") || !env.PAPERCLIP_API_URL || !env.PAPERCLIP_API_KEY) {
    say("refused", { category: "paperclip_env", detail: "Paperclip run, agent, API URL and run key are required" });
    return { code: RUNNER_EXIT.config };
  }
  let pool;
  try {
    pool = await loadPool();
  } catch (error) {
    say("refused", { category: "profile_config", detail: error.message });
    return { code: RUNNER_EXIT.config };
  }
  const named = Object.entries(pool.profiles).filter(([, p]) => p.agentId === agentId);
  if (named.length !== 1) {
    say("refused", { category: "binding", detail: "this agent is not bound to exactly one pool profile" });
    return { code: RUNNER_EXIT.config };
  }
  const [profileName, profile] = named[0];
  return { pool, profileName, profile, runId };
}
// One Paperclip run of the pool runner: find its committed turn, claim it once, admit it
// on the account, relay it to the host and record the receipt and disposition.
class RunnerTurn {
  seen = { receipt: null, refused: null };
  constructor({ env, out, err, say, spawnImpl, signals, heartbeatMs, pollMs, stopGraceMs }, bound, api) {
    Object.assign(this, { env, out, err, say, spawnImpl, signals, heartbeatMs, pollMs, stopGraceMs, api });
    Object.assign(this, bound);
  }
  // The refusal code when the run's issue, turn or commitment cannot be read.
  async locate() {
    const { api, runId, profileName, profile } = this;
    try {
      ({ conversation: this.conversation, issue: this.issue } = await locate(api, runId, profileName, profile));
      const { conversation, issue } = this;
      this.turn = conversation && (await readJSON(turnPath(conversation.id, conversation.turns), null));
      this.evidence = this.turn && PENDING.has(this.turn.state) && (await committed(api, conversation, issue, this.turn, profile));
    } catch (error) {
      this.say("refused", { category: "paperclip_lookup", detail: error.message });
      return RUNNER_EXIT.refused;
    }
    return undefined;
  }
  async noop(reason) {
    const { conversation } = this;
    const disposition = await observeNoop(this.api, conversation, this.issue).catch(() => "unobserved");
    this.say("noop", { reason, conversationId: conversation?.id ?? null, turn: conversation?.turns ?? null, disposition });
    return RUNNER_EXIT.ok;
  }
  // Why this run launches nothing, or null when it holds a committed pending turn.
  noopReason() {
    if (!this.conversation) return "no pool turn is linked to this run's issue";
    if (!this.turn || !PENDING.has(this.turn.state)) return "no pending pool turn";
    if (!this.evidence) return "the pending turn is not committed upstream yet";
    return null;
  }
  // The single launch attempt for this turn. A duplicate wake, a recovery wake or an
  // explicitly resent request finds the claim and never reaches a provider.
  async claim() {
    const { conversation, profileName, runId } = this;
    const n = conversation.turns;
    try {
      await mkdir(claimPath(conversation.id, n), { mode: 0o700 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      return false;
    }
    this.n = n;
    this.runnerIdentity = await identity(process.pid);
    this.record = {
      conversationId: conversation.id, turn: n, profile: profileName, paperclipRunId: runId,
      runnerPid: process.pid, runnerIdentity: this.runnerIdentity, claimedAt: Date.now(), state: "claimed", finished: false,
    };
    await this.save();
    this.say("claimed", { conversationId: conversation.id, turn: n, profile: profileName });
    return true;
  }
  save() {
    return atomic(runPath(this.conversation.id, this.n), this.record);
  }
  async refuse(category, detail, code = RUNNER_EXIT.refused) {
    const { record } = this;
    Object.assign(record, { state: "refused", termination: "not-started", category, stopReason: `${category}: ${detail}`, endedAt: Date.now() });
    await this.save();
    record.disposition = (await dispose(this.api, this.conversation, this.issue.id, record, this.runId)).state;
    record.finished = true;
    await this.save();
    this.say("refused", { category, detail, disposition: record.disposition });
    return code;
  }
  // HQ pins include controller/repository identity and executable fields outside the
  // legacy desktop binding. Revalidate before account reconciliation or host effects.
  async bindingRefusal() {
    const { conversation, profileName, pool, turn } = this;
    if (conversation.hq) {
      try {
        await verifyHQBinding(profileName, conversation, { executionPool: pool, apiUrl: this.env.PAPERCLIP_API_URL, issue: this.issue });
      } catch {
        return this.refuse("hq_binding_drift", "the installed HQ mapping changed or is unavailable", RUNNER_EXIT.config);
      }
    }
    this.binding = bindingDigest(profileName, this.profile);
    if (conversation.bindingSha256 !== this.binding)
      return this.refuse("binding_drift", "the pool profile changed after this conversation started", RUNNER_EXIT.config);
    if (sha256(turn.prompt ?? "") !== turn.promptSha256)
      return this.refuse("intent", "turn prompt does not match its journaled digest", RUNNER_EXIT.config);
    this.session = await readJSON(sessionPath(conversation.id), null);
    if (this.session?.drift) return this.refuse("session_drift", "native session drift was recorded; start a new conversation");
    return undefined;
  }
  async reconcileEntry(entry) {
    const entryProfile = this.pool.profiles[entry.profile];
    if (!entryProfile) return "unknown";
    const result = await remoteCommand(entryProfile, ["reconcile", entry.runUuid], { spawnImpl: this.spawnImpl, env: this.env });
    // Attach the later host proof beside, never over, that turn's original evidence.
    if (result?.state === "terminated" && UUID.test(entry.conversationId ?? "") && Number.isInteger(entry.turn))
      await atomic(reconcilePath(entry.conversationId, entry.turn), { state: "terminated", runUuid: entry.runUuid, provenAt: Date.now(), via: "admission" }).catch(() => {});
    return result?.state ?? "unknown";
  }
  async reserve() {
    const { profile, conversation, n } = this;
    const runUuid = randomBytes(16).toString("hex");
    this.runUuid = runUuid;
    this.record.runUuid = runUuid;
    let reserved;
    try {
      reserved = await reserveAccount(profile.account, {
        runUuid, profile: this.profileName, conversationId: conversation.id, turn: n, paperclipRunId: this.runId,
        runnerPid: process.pid, runnerIdentity: this.runnerIdentity, at: Date.now(),
      }, (entry) => this.reconcileEntry(entry));
    } catch (error) {
      // Nothing launched; record it so the turn is never left claimed and unrecorded.
      return this.refuse("runner_error", String(error.message).split("\n")[0]);
    }
    if (!reserved) return this.refuse("account_reserved", "another turn on this account is active or not yet proven stopped");
    const stopped = await stopRequested(conversation.id, n).catch(() => false);
    if (stopped) {
      await releaseAccount(profile.account, runUuid);
      return this.refuse("stopped", "stop requested before launch");
    }
    this.record.state = "starting";
    await this.save();
    return undefined;
  }
  write(message) {
    const { child } = this;
    if (!child.stdin.destroyed && child.stdin.writable) child.stdin.write(JSON.stringify(message) + "\n");
  }
  async spawnHost() {
    const argv = transportArgv(this.profile, "run");
    try {
      this.child = this.spawnImpl(argv[0], argv.slice(1), { env: transportEnv(this.env), stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      await releaseAccount(this.profile.account, this.runUuid);
      return this.refuse("transport", String(error.message).split("\n")[0]);
    }
    this.child.stdin.on("error", () => {});
    this.child.on("error", () => {});
    this.write({
      schema: ENVELOPE, runUuid: this.runUuid, profile: this.profileName, bindingSha256: this.binding, conversationId: this.conversation.id,
      turn: this.n, session: this.session?.session ?? null, prompt: this.turn.prompt, paperclipRunId: this.runId,
    });
    return undefined;
  }
  async handle(line) {
    const { record } = this;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.pool === "accepted") {
      Object.assign(record, { state: "running", remote: message, startedAt: Date.now() });
      await this.save();
    } else if (message.pool === "session") {
      await atomic(sessionPath(this.conversation.id), { session: message.session, drift: message.drift === true, turn: this.n, at: Date.now() });
      record.session = message.session;
      await this.save();
    } else if (message.pool === "event" && message.event?.type === "control_request") {
      const request = message.event.request ?? {};
      record.question = { id: message.event.request_id, toolName: request.tool_name ?? null, input: request.input ?? {} };
      await this.save();
    } else if (message.pool === "answered") {
      if (record.question?.id === message.questionId) record.question = null;
      await this.save();
    } else if (message.pool === "refused") this.seen.refused = message;
    else if (message.pool === "receipt") this.seen.receipt = message;
  }
  // Forward the host's stdout and fold each whole line, in order.
  readHost() {
    const decoder = new StringDecoder("utf8");
    this.partial = "";
    this.pending = Promise.resolve();
    this.child.stdout.on("data", (chunk) => {
      this.partial += decoder.write(chunk);
      let end;
      while ((end = this.partial.indexOf("\n")) >= 0) {
        const line = this.partial.slice(0, end);
        this.partial = this.partial.slice(end + 1);
        if (!line.trim()) continue;
        this.out.write(line + "\n");
        this.pending = this.pending.then(() => this.handle(line)).catch(() => {});
      }
    });
    this.child.stderr.on("data", (chunk) => this.err.write(chunk));
  }
  // Relay journaled answer/stop controls for this turn to the host.
  startRelay() {
    const sent = new Set();
    let relaying = false;
    return setInterval(async () => {
      if (relaying) return;
      relaying = true;
      try {
        await this.relayControls(sent);
      } catch {
        // Never let one poll reject; the next poll retries.
      } finally {
        relaying = false;
      }
    }, this.pollMs);
  }
  async relayControls(sent) {
    const dir = controlDir(this.conversation.id);
    for (const name of (await readdir(dir).catch(() => [])).sort()) {
      if (!name.endsWith(".json") || sent.has(name)) continue;
      // A control that cannot be read yet is retried on the next poll, never dropped,
      // and never allowed to take the relay (or the runner) down.
      let control;
      try {
        control = await readJSON(join(dir, name), null);
      } catch {
        continue;
      }
      sent.add(name);
      if (control?.turn !== this.n) continue;
      if (control.type === "answer") this.write({ type: "answer", message: control.message });
      else if (control.type === "stop") this.write({ type: "stop", reason: "stop" });
      await rename(join(dir, name), join(dir, `${name}.sent`)).catch(() => {});
    }
  }
  async awaitHost() {
    this.readHost();
    const heartbeat = setInterval(() => this.write({ type: "heartbeat" }), this.heartbeatMs ?? this.pool.heartbeatSeconds * 1000);
    const relay = this.startRelay();
    let killTimer = null;
    const onSignal = () => {
      if (this.record.stopRequested) return;
      this.record.stopRequested = "paperclip cancel or controller shutdown";
      this.write({ type: "stop", reason: "cancel" });
      killTimer = setTimeout(() => this.child.kill("SIGKILL"), this.stopGraceMs);
    };
    for (const name of ["SIGTERM", "SIGINT", "SIGHUP"]) this.signals.on(name, onSignal);
    const exitCode = await new Promise((resolve) => this.child.on("close", (code) => resolve(code)));
    clearInterval(heartbeat);
    clearInterval(relay);
    clearTimeout(killTimer);
    for (const name of ["SIGTERM", "SIGINT", "SIGHUP"]) this.signals.off(name, onSignal);
    if (this.partial.trim()) {
      this.out.write(this.partial + "\n");
      const rest = this.partial;
      this.pending = this.pending.then(() => this.handle(rest));
    }
    await this.pending;
    return exitCode;
  }
  // Record what the host reported, or ask it once when the transport ended without a receipt.
  async outcome(exitCode) {
    const { record, seen, runUuid } = this;
    const receipt = seen.receipt;
    if (receipt && receipt.runUuid === runUuid) return adoptReceipt(record, receipt, seen.refused);
    if (seen.refused) {
      // Refused before the host wrote any receipt (configuration or binding).
      Object.assign(record, { state: "refused", termination: "not-started", category: seen.refused.category, stopReason: `${seen.refused.category}: ${seen.refused.detail}` });
      return Number.isInteger(exitCode) ? exitCode : RUNNER_EXIT.refused;
    }
    const reconciled = await remoteCommand(this.profile, ["reconcile", runUuid], { spawnImpl: this.spawnImpl, env: this.env });
    const state = reconciled?.state;
    Object.assign(record, {
      state: "transport_lost",
      termination: state === "terminated" ? "verified" : "unknown",
      stopReason: "transport ended without a receipt",
    });
    return record.termination === "verified" ? RUNNER_EXIT.stopped : RUNNER_EXIT.unknown;
  }
  async finish(code) {
    const { record } = this;
    record.question = null;
    record.endedAt = Date.now();
    record.code = code;
    await this.save();
    // Disposed before `finished`, so no follow-up can be journaled in between.
    record.disposition = (await dispose(this.api, this.conversation, this.issue.id, record, this.runId)).state;
    record.finished = true;
    await this.save();
    if (["verified", "not-started"].includes(record.termination)) await releaseAccount(this.profile.account, this.runUuid);
    this.say("finished", { state: record.state, termination: record.termination, code, disposition: record.disposition });
    return code;
  }
}
function runnerOptions({
  env = process.env, out = process.stdout, err = process.stderr, fetchImpl = globalThis.fetch,
  spawnImpl = spawn, signals = process, heartbeatMs, pollMs = 200, stopGraceMs = 12000,
} = {}) {
  return { env, out, err, fetchImpl, spawnImpl, signals, heartbeatMs, pollMs, stopGraceMs };
}
export async function runTurn(options = {}) {
  const { env, out, err, fetchImpl, spawnImpl, signals, heartbeatMs, pollMs, stopGraceMs } = runnerOptions(options);
  const say = (kind, extra = {}) => out.write(JSON.stringify({ pool: "runner", kind, ...extra }) + "\n");
  const bound = await boundProfile(env, say);
  if (bound.code !== undefined) return bound.code;
  await initPool();
  const api = paperclipClient({ baseUrl: env.PAPERCLIP_API_URL, token: env.PAPERCLIP_API_KEY, runId: bound.runId, fetchImpl });
  const run = new RunnerTurn({ env, out, err, say, spawnImpl, signals, heartbeatMs, pollMs, stopGraceMs }, bound, api);
  const lookupRefusal = await run.locate();
  if (lookupRefusal !== undefined) return lookupRefusal;
  const reason = run.noopReason();
  if (reason) return run.noop(reason);
  if (!(await run.claim())) return run.noop("turn already claimed");
  // Each admission step either passes (undefined) or has already recorded its refusal.
  for (const step of [() => run.bindingRefusal(), () => run.reserve(), () => run.spawnHost()]) {
    const refused = await step();
    if (refused !== undefined) return refused;
  }
  return run.finish(await run.outcome(await run.awaitHost()));
}
