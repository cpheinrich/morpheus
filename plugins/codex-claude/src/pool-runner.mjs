import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { atomic, readJSON } from "./store.mjs";
import { identity } from "./processes.mjs";
import { bindingDigest, ENVELOPE, loadPool, sha256, transportArgv, transportEnv } from "./pool-config.mjs";
import { paperclipClient } from "./pool-paperclip.mjs";
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
    // The coordinator may not know this issue's id (an unknown POST outcome). Accept it
    // only through the marker of a journaled turn assigned to this exact agent.
    const mark = parseMarker(issue.description);
    if (!mark || issue.assigneeAgentId !== profile.agentId) continue;
    const conversation = await readConversation(mark.conversationId);
    if (!conversation || conversation.profile !== profileName || (conversation.issueId && conversation.issueId !== issueId)) continue;
    const turn = await readJSON(turnPath(conversation.id, mark.turn), null);
    if (turn?.promptSha256 !== mark.promptSha256) continue;
    await linkIssue(conversation.id, issueId, "runner");
    return { conversation: { ...conversation, issueId }, issue };
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
export async function runTurn({
  env = process.env, out = process.stdout, err = process.stderr, fetchImpl = globalThis.fetch,
  spawnImpl = spawn, signals = process, heartbeatMs, pollMs = 200, stopGraceMs = 12000,
} = {}) {
  const say = (kind, extra = {}) => out.write(JSON.stringify({ pool: "runner", kind, ...extra }) + "\n");
  const runId = env.PAPERCLIP_RUN_ID;
  const agentId = env.PAPERCLIP_AGENT_ID;
  if (!UUID.test(runId ?? "") || !UUID.test(agentId ?? "") || !env.PAPERCLIP_API_URL || !env.PAPERCLIP_API_KEY) {
    say("refused", { category: "paperclip_env", detail: "Paperclip run, agent, API URL and run key are required" });
    return RUNNER_EXIT.config;
  }
  let pool;
  try {
    pool = await loadPool();
  } catch (error) {
    say("refused", { category: "profile_config", detail: error.message });
    return RUNNER_EXIT.config;
  }
  const named = Object.entries(pool.profiles).filter(([, p]) => p.agentId === agentId);
  if (named.length !== 1) {
    say("refused", { category: "binding", detail: "this agent is not bound to exactly one pool profile" });
    return RUNNER_EXIT.config;
  }
  const [profileName, profile] = named[0];
  await initPool();
  const api = paperclipClient({ baseUrl: env.PAPERCLIP_API_URL, token: env.PAPERCLIP_API_KEY, runId, fetchImpl });
  let conversation, issue, turn, evidence;
  try {
    ({ conversation, issue } = await locate(api, runId, profileName, profile));
    turn = conversation && (await readJSON(turnPath(conversation.id, conversation.turns), null));
    evidence = turn && PENDING.has(turn.state) && (await committed(api, conversation, issue, turn, profile));
  } catch (error) {
    say("refused", { category: "paperclip_lookup", detail: error.message });
    return RUNNER_EXIT.refused;
  }
  const noop = async (reason) => {
    const disposition = await observeNoop(api, conversation, issue).catch(() => "unobserved");
    say("noop", { reason, conversationId: conversation?.id ?? null, turn: conversation?.turns ?? null, disposition });
    return RUNNER_EXIT.ok;
  };
  if (!conversation) return noop("no pool turn is linked to this run's issue");
  const n = conversation.turns;
  if (!turn || !PENDING.has(turn.state)) return noop("no pending pool turn");
  if (!evidence) return noop("the pending turn is not committed upstream yet");
  // The single launch attempt for this turn. A duplicate wake, a recovery wake or an
  // explicitly resent request finds the claim and never reaches a provider.
  try {
    await mkdir(claimPath(conversation.id, n), { mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return noop("turn already claimed");
  }
  const runnerIdentity = await identity(process.pid);
  const record = {
    conversationId: conversation.id, turn: n, profile: profileName, paperclipRunId: runId,
    runnerPid: process.pid, runnerIdentity, claimedAt: Date.now(), state: "claimed", finished: false,
  };
  const save = () => atomic(runPath(conversation.id, n), record);
  await save();
  say("claimed", { conversationId: conversation.id, turn: n, profile: profileName });
  const refuse = async (category, detail, code = RUNNER_EXIT.refused) => {
    Object.assign(record, { state: "refused", termination: "not-started", category, stopReason: `${category}: ${detail}`, endedAt: Date.now() });
    await save();
    record.disposition = (await dispose(api, conversation, issue.id, record, runId)).state;
    record.finished = true;
    await save();
    say("refused", { category, detail, disposition: record.disposition });
    return code;
  };
  const binding = bindingDigest(profileName, profile);
  if (conversation.bindingSha256 !== binding)
    return refuse("binding_drift", "the pool profile changed after this conversation started", RUNNER_EXIT.config);
  if (sha256(turn.prompt ?? "") !== turn.promptSha256)
    return refuse("intent", "turn prompt does not match its journaled digest", RUNNER_EXIT.config);
  const session = await readJSON(sessionPath(conversation.id), null);
  if (session?.drift) return refuse("session_drift", "native session drift was recorded; start a new conversation");
  const runUuid = randomBytes(16).toString("hex");
  record.runUuid = runUuid;
  const reconcile = async (entry) => {
    const entryProfile = pool.profiles[entry.profile];
    if (!entryProfile) return "unknown";
    const result = await remoteCommand(entryProfile, ["reconcile", entry.runUuid], { spawnImpl, env });
    // Attach the later host proof beside, never over, that turn's original evidence.
    if (result?.state === "terminated" && UUID.test(entry.conversationId ?? "") && Number.isInteger(entry.turn))
      await atomic(reconcilePath(entry.conversationId, entry.turn), { state: "terminated", runUuid: entry.runUuid, provenAt: Date.now(), via: "admission" }).catch(() => {});
    return result?.state ?? "unknown";
  };
  const reserved = await reserveAccount(profile.account, {
    runUuid, profile: profileName, conversationId: conversation.id, turn: n, paperclipRunId: runId,
    runnerPid: process.pid, runnerIdentity, at: Date.now(),
  }, reconcile);
  if (!reserved) return refuse("account_reserved", "another turn on this account is active or not yet proven stopped");
  record.state = "starting";
  await save();

  const argv = transportArgv(profile, "run");
  const child = spawnImpl(argv[0], argv.slice(1), { env: transportEnv(env), stdio: ["pipe", "pipe", "pipe"] });
  const write = (message) => {
    if (!child.stdin.destroyed && child.stdin.writable) child.stdin.write(JSON.stringify(message) + "\n");
  };
  child.stdin.on("error", () => {});
  child.on("error", () => {});
  write({
    schema: ENVELOPE, runUuid, profile: profileName, bindingSha256: binding, conversationId: conversation.id,
    turn: n, session: session?.session ?? null, prompt: turn.prompt, paperclipRunId: runId,
  });
  const seen = { receipt: null, refused: null };
  const decoder = new StringDecoder("utf8");
  let partial = "";
  let pending = Promise.resolve();
  const handle = async (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.pool === "accepted") {
      Object.assign(record, { state: "running", remote: message, startedAt: Date.now() });
      await save();
    } else if (message.pool === "session") {
      await atomic(sessionPath(conversation.id), { session: message.session, drift: message.drift === true, turn: n, at: Date.now() });
      record.session = message.session;
      await save();
    } else if (message.pool === "event" && message.event?.type === "control_request") {
      const request = message.event.request ?? {};
      record.question = { id: message.event.request_id, toolName: request.tool_name ?? null, input: request.input ?? {} };
      await save();
    } else if (message.pool === "answered") {
      if (record.question?.id === message.questionId) record.question = null;
      await save();
    } else if (message.pool === "refused") seen.refused = message;
    else if (message.pool === "receipt") seen.receipt = message;
  };
  child.stdout.on("data", (chunk) => {
    partial += decoder.write(chunk);
    let end;
    while ((end = partial.indexOf("\n")) >= 0) {
      const line = partial.slice(0, end);
      partial = partial.slice(end + 1);
      if (!line.trim()) continue;
      out.write(line + "\n");
      pending = pending.then(() => handle(line)).catch(() => {});
    }
  });
  child.stderr.on("data", (chunk) => err.write(chunk));
  const heartbeat = setInterval(() => write({ type: "heartbeat" }), heartbeatMs ?? pool.heartbeatSeconds * 1000);
  const sent = new Set();
  let relaying = false;
  const relay = setInterval(async () => {
    if (relaying) return;
    relaying = true;
    try {
      const dir = controlDir(conversation.id);
      for (const name of (await readdir(dir).catch(() => [])).sort()) {
        if (!name.endsWith(".json") || sent.has(name)) continue;
        sent.add(name);
        const control = await readJSON(join(dir, name), null);
        if (control?.turn !== n) continue;
        if (control.type === "answer") write({ type: "answer", message: control.message });
        else if (control.type === "stop") write({ type: "stop", reason: "stop" });
        await rename(join(dir, name), join(dir, `${name}.sent`)).catch(() => {});
      }
    } finally {
      relaying = false;
    }
  }, pollMs);
  let killTimer = null;
  const onSignal = () => {
    if (record.stopRequested) return;
    record.stopRequested = "paperclip cancel or controller shutdown";
    write({ type: "stop", reason: "cancel" });
    killTimer = setTimeout(() => child.kill("SIGKILL"), stopGraceMs);
  };
  for (const name of ["SIGTERM", "SIGINT", "SIGHUP"]) signals.on(name, onSignal);
  const exitCode = await new Promise((resolve) => child.on("close", (code) => resolve(code)));
  clearInterval(heartbeat);
  clearInterval(relay);
  clearTimeout(killTimer);
  for (const name of ["SIGTERM", "SIGINT", "SIGHUP"]) signals.off(name, onSignal);
  if (partial.trim()) {
    out.write(partial + "\n");
    pending = pending.then(() => handle(partial));
  }
  await pending;
  let code;
  const receipt = seen.receipt;
  if (receipt && receipt.runUuid === runUuid) {
    Object.assign(record, {
      state: receipt.state, termination: receipt.termination, exitCode: receipt.exitCode ?? null,
      stopReason: receipt.stopReason ?? null, result: receipt.result ?? null, error: receipt.error ?? null,
      requested: receipt.requested ?? null, observed: receipt.observed ?? null, usage: receipt.usage ?? null,
      category: seen.refused?.category ?? null,
    });
    code = Number.isInteger(receipt.code) ? receipt.code : RUNNER_EXIT.unknown;
  } else if (seen.refused) {
    // Refused before the host wrote any receipt (configuration or binding).
    Object.assign(record, { state: "refused", termination: "not-started", category: seen.refused.category, stopReason: `${seen.refused.category}: ${seen.refused.detail}` });
    code = Number.isInteger(exitCode) ? exitCode : RUNNER_EXIT.refused;
  } else {
    // The transport ended without a receipt. Ask the host once; never assume.
    const reconciled = await remoteCommand(profile, ["reconcile", runUuid], { spawnImpl, env });
    const state = reconciled?.state;
    Object.assign(record, {
      state: "transport_lost",
      termination: state === "terminated" ? "verified" : "unknown",
      stopReason: "transport ended without a receipt",
    });
    code = record.termination === "verified" ? RUNNER_EXIT.stopped : RUNNER_EXIT.unknown;
  }
  record.question = null;
  record.endedAt = Date.now();
  record.code = code;
  await save();
  // Disposed before `finished`, so no follow-up can be journaled in between.
  record.disposition = (await dispose(api, conversation, issue.id, record, runId)).state;
  record.finished = true;
  await save();
  if (["verified", "not-started"].includes(record.termination)) await releaseAccount(profile.account, runUuid);
  say("finished", { state: record.state, termination: record.termination, code, disposition: record.disposition });
  return code;
}
