import { randomUUID } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { atomic, readJSON, configRead } from "./store.mjs";
import { applyClaudeEvent } from "./claude.mjs";
import { applyCodexEvent } from "./codex-exec.mjs";
import { bindingDigest, loadPool, readToken, sha256 } from "./pool-config.mjs";
import { paperclipClient } from "./pool-paperclip.mjs";
import { identity } from "./processes.mjs";
import {
  UUID, answersDir, claimPath, controlDir, conversationDir, cursorPath, initPool, issueIndex,
  linkIssue, marker, parseMarker, poolHome, readConversation, requestId, runPath, sessionPath,
  threadIndex, turnPath, pruneAccount,
} from "./pool-store.mjs";

// Coordinator-side pool operations. The desktop bridge only journals intent, submits it
// to Paperclip, reads the Paperclip run log and writes answer/stop controls. It never
// renews a worker lease: the Paperclip-owned runner does, so losing this process loses
// nothing but the view.
const TASK_ID = /^[a-zA-Z0-9_-]{1,100}$/;
const LOG_PAGE = 256 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const firstLine = (text) => text.trim().split("\n")[0].slice(0, 80);
export class Pool {
  constructor({ fetchImpl = globalThis.fetch, waitStepMs = 500 } = {}) {
    this.fetchImpl = fetchImpl;
    this.waitStepMs = waitStepMs;
  }
  async context() {
    const pool = await loadPool();
    const token = await readToken(pool.controller.tokenFile);
    return { pool, api: paperclipClient({ baseUrl: pool.controller.baseUrl, token, fetchImpl: this.fetchImpl }) };
  }
  async conversation(id) {
    const conversation = await readConversation(id);
    if (!conversation) throw new Error("Unknown pool conversation");
    return conversation;
  }
  async profiles() {
    const pool = await loadPool();
    return Object.entries(pool.profiles).map(([name, p]) => ({
      name, provider: p.provider, model: p.model, effort: p.effort, permission: p.permission,
      host: p.host.transport === "ssh" ? p.host.target : "local", workspace: p.workspace, account: p.account,
      capabilities: capabilities(p.provider),
    }));
  }
  async assertEnabled() {
    if ((await configRead()).mode === "off") throw new Error("Delegation disabled");
  }
  async assertProfileIdle(name, except) {
    for (const id of await readdir(join(poolHome(), "conversations")).catch(() => [])) {
      if (id === except || !UUID.test(id)) continue;
      const other = await readConversation(id);
      if (other?.profile !== name) continue;
      const s = await this.status({ conversationId: id });
      if (!s.terminal)
        throw new Error(`Pool profile ${name} already has an active turn in conversation ${id}; wait, stop or reattach it.`);
    }
  }
  async start(args) {
    await this.assertEnabled();
    if (!TASK_ID.test(args.threadId ?? "")) throw new Error("Invalid Codex task id");
    if (typeof args.prompt !== "string" || !args.prompt.trim() || args.prompt.length > 200000)
      throw new Error("A bounded prompt is required");
    const { pool, api } = await this.context();
    const profile = pool.profiles[args.profile];
    if (!profile) throw new Error("Unknown pool profile");
    await initPool();
    await this.assertProfileIdle(args.profile);
    const id = randomUUID();
    const dir = conversationDir(id);
    await mkdir(join(dir, "turns"), { recursive: true, mode: 0o700 });
    await mkdir(controlDir(id), { mode: 0o700 });
    await mkdir(answersDir(id), { mode: 0o700 });
    const conversation = {
      version: 1, id, threadId: args.threadId, profile: args.profile, provider: profile.provider,
      agentId: profile.agentId, bindingSha256: bindingDigest(args.profile, profile), createdAt: Date.now(),
      issueId: null, turns: 1, supervisionReplies: 0,
    };
    await atomic(join(dir, "conversation.json"), conversation);
    const threads = await readJSON(threadIndex(args.threadId), { conversations: [] });
    threads.conversations.push(id);
    await atomic(threadIndex(args.threadId), threads);
    // Journal before the external mutation; an unknown outcome is observed, never reposted.
    const turn = { n: 1, kind: "start", prompt: args.prompt, promptSha256: sha256(args.prompt), state: "posting", createdAt: Date.now() };
    await atomic(turnPath(id, 1), turn);
    await this.submitIssue(pool, api, conversation, turn);
    return this.status({ conversationId: id });
  }
  issueBody(pool, conversation, turn) {
    return {
      title: `Pool ${conversation.profile}: ${firstLine(turn.prompt)}`,
      description: `${turn.prompt}\n\n${marker(conversation.id, 1, turn.prompt)}`,
      status: "todo", priority: "medium", assigneeAgentId: conversation.agentId,
      ...(pool.controller.projectId ? { projectId: pool.controller.projectId } : {}),
      idempotencyKey: `codex-claude-pool-${conversation.id}-1`,
    };
  }
  async submitIssue(pool, api, conversation, turn) {
    try {
      const created = await api.post(`/companies/${pool.controller.companyId}/issues`, this.issueBody(pool, conversation, turn));
      if (!UUID.test(created?.id ?? "")) throw Object.assign(new Error("Paperclip returned no issue id"), { unknown: true });
      await linkIssue(conversation.id, created.id, "coordinator");
      await atomic(join(conversationDir(conversation.id), "conversation.json"), { ...conversation, issueId: created.id });
      Object.assign(turn, { state: "submitted", submittedAt: Date.now(), error: null });
    } catch (error) {
      Object.assign(turn, { state: rejected(error) ? "rejected" : "unknown", error: error.message });
    }
    await atomic(turnPath(conversation.id, 1), turn);
  }
  async submitComment(api, conversation, turn) {
    try {
      await api.post(`/issues/${conversation.issueId}/comments`, {
        body: `${turn.prompt}\n\n${marker(conversation.id, turn.n, turn.prompt)}`,
        clientRequestId: requestId(conversation.id, turn.n),
        reopen: true,
      });
      Object.assign(turn, { state: "submitted", submittedAt: Date.now(), error: null });
    } catch (error) {
      Object.assign(turn, { state: rejected(error) ? "rejected" : "unknown", error: error.message });
    }
    await atomic(turnPath(conversation.id, turn.n), turn);
  }
  async status({ conversationId }) {
    const c = await this.conversation(conversationId);
    const n = c.turns;
    const turn = await readJSON(turnPath(c.id, n), null);
    let run = await readJSON(runPath(c.id, n), null);
    const session = await readJSON(sessionPath(c.id), null);
    const cursor = await readJSON(cursorPath(c.id), null);
    const fold = cursor?.turn === n ? cursor.fold : null;
    // A runner that died without finishing cannot renew the remote lease; the remote
    // stops itself, and the next admission on this account reconciles it over SSH.
    let runnerLost = false;
    if (run && !run.finished && run.runnerPid && (await identity(run.runnerPid)) !== run.runnerIdentity) runnerLost = true;
    let state;
    if (!turn) state = "unknown";
    else if (run?.finished) state = run.state;
    else if (runnerLost) state = "runner_lost";
    else if (run) state = run.question ? "needs_input" : run.state === "claimed" || run.state === "starting" ? "starting" : "running";
    else state = { submitted: "queued", rejected: "rejected" }[turn.state] ?? "submission_unknown";
    // A rejected submission created nothing upstream, so nothing can still launch.
    const terminal = !!run?.finished || runnerLost || (!run && turn?.state === "rejected");
    return {
      conversationId: c.id, threadId: c.threadId, profile: c.profile, provider: c.provider, issueId: c.issueId,
      turn: n, submission: turn?.state ?? null, submissionError: turn?.error ?? null, state, terminal,
      paperclipRunId: run?.paperclipRunId ?? null, remoteRun: run?.runUuid ?? null,
      host: run?.remote?.hostId ?? null, model: run?.remote?.model ?? null, effort: run?.remote?.effort ?? null,
      termination: runnerLost ? "unknown" : run?.termination ?? null, stopReason: run?.stopReason ?? null,
      category: run?.category ?? null,
      question: run && !run.finished && run.question ? { id: run.question.id, toolName: run.question.toolName, input: run.question.input } : null,
      result: run?.result ?? fold?.result ?? null,
      nativeSession: session?.session ?? null, sessionDrift: session?.drift === true,
      progress: fold?.progress ?? "", sequence: fold?.sequence ?? 0,
      log: cursor ? { runId: cursor.runId, offset: cursor.offset, source: cursor.source ?? "paperclip" } : null,
      supervisionReplies: c.supervisionReplies, capabilities: capabilities(c.provider),
    };
  }
  // Read the current turn's Paperclip run log from the persisted cursor and fold it.
  async pull(c, api) {
    const n = c.turns;
    const run = await readJSON(runPath(c.id, n), null);
    if (!run?.paperclipRunId) return;
    let cursor = await readJSON(cursorPath(c.id), null);
    if (!cursor || cursor.turn !== n || cursor.runId !== run.paperclipRunId)
      cursor = { turn: n, runId: run.paperclipRunId, offset: 0, stdout: "", fold: { progress: "", sequence: 0 } };
    for (let page = 0; page < 16; page++) {
      let response;
      try {
        response = await api.get(`/heartbeat-runs/${cursor.runId}/log?offset=${cursor.offset}&limitBytes=${LOG_PAGE}`);
        cursor.source = "paperclip";
      } catch (error) {
        cursor.source = `unavailable: ${error.message}`;
        break;
      }
      const content = typeof response?.content === "string" ? response.content : "";
      const complete = content.lastIndexOf("\n");
      if (complete < 0) break;
      // Consume whole NDJSON records only; a record cut by the byte range is read again.
      const consumed = content.slice(0, complete + 1);
      cursor.offset += Buffer.byteLength(consumed);
      for (const record of consumed.split("\n")) {
        if (!record.trim()) continue;
        let entry;
        try {
          entry = JSON.parse(record);
        } catch {
          continue;
        }
        if (entry.stream !== "stdout" || typeof entry.chunk !== "string") continue;
        cursor.stdout += entry.chunk;
        let end;
        while ((end = cursor.stdout.indexOf("\n")) >= 0) {
          const line = cursor.stdout.slice(0, end);
          cursor.stdout = cursor.stdout.slice(end + 1);
          foldLine(cursor.fold, c.provider, line);
        }
        if (cursor.stdout.length > 4 * 1024 * 1024) cursor.stdout = "";
      }
      if (response?.nextOffset == null) break;
    }
    await atomic(cursorPath(c.id), cursor);
  }
  async wait({ conversationId, seconds = 25 }) {
    const c = await this.conversation(conversationId);
    const { api } = await this.context();
    const until = Date.now() + Math.min(30, Math.max(0, seconds)) * 1000;
    let s;
    do {
      await this.pull(c, api);
      s = await this.status({ conversationId });
      if (s.terminal || s.question || s.state === "submission_unknown") return s;
      await sleep(this.waitStepMs);
    } while (Date.now() < until);
    return s;
  }
  async logs({ conversationId, turn, offset = 0, limitBytes = 65536 }) {
    const c = await this.conversation(conversationId);
    const run = await readJSON(runPath(c.id, turn ?? c.turns), null);
    if (!run?.paperclipRunId) throw new Error("This turn has no Paperclip run yet");
    const { api } = await this.context();
    const limit = Math.min(Math.max(1024, limitBytes), LOG_PAGE);
    const response = await api.get(`/heartbeat-runs/${run.paperclipRunId}/log?offset=${Math.max(0, offset)}&limitBytes=${limit}`);
    const lines = [];
    for (const record of String(response?.content ?? "").split("\n")) {
      try {
        const entry = JSON.parse(record);
        if (entry.stream === "stdout") lines.push(...String(entry.chunk).split("\n").filter(Boolean).map(summarize));
      } catch {}
    }
    return { runId: run.paperclipRunId, offset, nextOffset: response?.nextOffset ?? null, lines };
  }
  async answer(args) {
    if (!["codex", "user"].includes(args.source)) throw new Error("Invalid answer source");
    const c = await this.conversation(args.conversationId);
    const n = c.turns;
    const run = await readJSON(runPath(c.id, n), null);
    if (!run || run.finished || !run.question)
      throw new Error("No live question; for a needs_input result, send a follow-up with replySource and replyReason.");
    if (run.question.id !== args.questionId) throw new Error("Stale question id");
    if (run.question.toolName !== "AskUserQuestion" && args.source !== "user")
      throw new Error("Tool permission requests require user approval; this bridge only delegates clarification judgment.");
    const config = await configRead();
    if (args.source === "codex" && c.supervisionReplies >= config.maxSupervisionReplies)
      throw new Error("Supervision limit reached. Escalate to the user.");
    if (args.source === "codex" && !args.reason) throw new Error("Record why this clarification does not require the user.");
    try {
      await writeFile(
        join(answersDir(c.id), `q-${sha256(`${n}:${args.questionId}`).slice(0, 32)}.json`),
        JSON.stringify({ turn: n, questionId: args.questionId, source: args.source, reason: args.reason, answers: args.answers, allow: args.allow !== false, at: Date.now() }),
        { flag: "wx", mode: 0o600 },
      );
    } catch (error) {
      if (error.code === "EEXIST") throw new Error("This question was already answered");
      throw error;
    }
    const response = {
      behavior: args.allow === false ? "deny" : "allow",
      ...(args.allow === false
        ? { message: args.reason || "Denied" }
        : { updatedInput: { ...run.question.input, ...(args.answers ? { answers: args.answers } : {}) } }),
    };
    await writeFile(
      join(controlDir(c.id), `${String(Date.now()).padStart(15, "0")}-${randomUUID().slice(0, 8)}.json`),
      JSON.stringify({ type: "answer", turn: n, message: { type: "control_response", response: { subtype: "success", request_id: args.questionId, response } } }),
      { flag: "wx", mode: 0o600 },
    );
    await atomic(join(conversationDir(c.id), "conversation.json"), {
      ...(await readJSON(join(conversationDir(c.id), "conversation.json"))),
      supervisionReplies: args.source === "user" ? 0 : c.supervisionReplies + 1,
    });
    return this.status({ conversationId: c.id });
  }
  async followup(args) {
    await this.assertEnabled();
    if (typeof args.prompt !== "string" || !args.prompt.trim() || args.prompt.length > 200000)
      throw new Error("A bounded prompt is required");
    const c = await this.conversation(args.conversationId);
    const previous = await this.status({ conversationId: c.id });
    if (!previous.terminal)
      throw new Error("The current turn is still active. Follow-ups are delivered at a turn boundary: wait for it, answer its question, or stop it first.");
    if (previous.sessionDrift) throw new Error("Native session drift was recorded; start a new pool conversation.");
    if (!c.issueId) throw new Error("The conversation's Paperclip issue is not linked; reattach to observe it first.");
    const { pool, api } = await this.context();
    const profile = pool.profiles[c.profile];
    if (!profile || bindingDigest(c.profile, profile) !== c.bindingSha256)
      throw new Error("The pool profile changed since this conversation started; start a new conversation.");
    const continuation = previous.state === "needs_input" || previous.result?.outcome === "needs_input";
    if (continuation && (!["codex", "user"].includes(args.replySource) || !args.replyReason))
      throw new Error("Resuming a question requires replySource and replyReason.");
    const replies = continuation && args.replySource === "codex" ? c.supervisionReplies + 1 : 0;
    if (replies > (await configRead()).maxSupervisionReplies) throw new Error("Supervision limit reached. Escalate to the user.");
    await this.assertProfileIdle(c.profile, c.id);
    const n = c.turns + 1;
    const turn = {
      n, kind: "followup", prompt: args.prompt, promptSha256: sha256(args.prompt), state: "posting",
      replySource: args.replySource ?? null, replyReason: args.replyReason ?? null, createdAt: Date.now(),
    };
    await atomic(turnPath(c.id, n), turn);
    const stored = await readJSON(join(conversationDir(c.id), "conversation.json"));
    await atomic(join(conversationDir(c.id), "conversation.json"), { ...stored, turns: n, supervisionReplies: replies });
    await this.submitComment(api, { ...c, turns: n }, turn);
    return this.status({ conversationId: c.id });
  }
  async stop({ conversationId }) {
    const c = await this.conversation(conversationId);
    const n = c.turns;
    try {
      // Not launched yet: take the claim so no runner can ever launch this turn.
      await mkdir(claimPath(c.id, n), { mode: 0o700 });
      await atomic(runPath(c.id, n), { conversationId: c.id, turn: n, state: "cancelled", finished: true, termination: "not-started", stopReason: "stopped before launch", endedAt: Date.now() });
      return { ...(await this.status({ conversationId })), stopping: false };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const run = await readJSON(runPath(c.id, n), null);
    if (!run || run.finished) return { ...(await this.status({ conversationId })), stopping: false };
    await writeFile(
      join(controlDir(c.id), `${String(Date.now()).padStart(15, "0")}-${randomUUID().slice(0, 8)}.json`),
      JSON.stringify({ type: "stop", turn: n }),
      { flag: "wx", mode: 0o600 },
    );
    let cancel = "requested";
    try {
      const { api } = await this.context();
      if (run.paperclipRunId) await api.post(`/heartbeat-runs/${run.paperclipRunId}/cancel`, {});
    } catch (error) {
      // The spool stop is exact on its own; the Paperclip record is best effort.
      cancel = `paperclip cancel failed: ${error.message}`;
    }
    return { ...(await this.status({ conversationId })), stopping: true, paperclipCancel: cancel };
  }
  async reattach(args) {
    if (!args.conversationId) {
      if (!TASK_ID.test(args.threadId ?? "")) throw new Error("Pass conversationId or the current Codex task id");
      const { conversations } = await readJSON(threadIndex(args.threadId), { conversations: [] });
      return { threadId: args.threadId, conversations: await Promise.all(conversations.slice(-10).reverse().map((id) => this.status({ conversationId: id }))) };
    }
    const c = await this.conversation(args.conversationId);
    if (args.threadId && args.threadId !== c.threadId) throw new Error("Conversation belongs to another Codex task");
    const { pool, api } = await this.context();
    const n = c.turns;
    const turn = await readJSON(turnPath(c.id, n), null);
    const claimed = await readJSON(runPath(c.id, n), null);
    let observed = null;
    if (turn && ["posting", "unknown"].includes(turn.state) && !claimed) {
      observed = await this.observe(pool, api, c, turn);
      if (!observed && args.retry === true) {
        // An explicit retry reuses the same idempotency key / request id, and the turn
        // claim still admits at most one provider launch.
        if (n === 1) await this.submitIssue(pool, api, c, turn);
        else if (c.issueId) await this.submitComment(api, c, turn);
      }
    }
    await this.pull(await this.conversation(c.id), api);
    return { ...(await this.status({ conversationId: c.id })), observed };
  }
  async observe(pool, api, c, turn) {
    try {
      if (turn.n === 1) {
        const list = await api.get(`/companies/${pool.controller.companyId}/issues?assigneeAgentId=${c.agentId}`);
        const issues = Array.isArray(list) ? list : list?.items ?? [];
        const found = issues.filter((issue) => {
          const mark = parseMarker(issue?.description);
          return mark?.conversationId === c.id && mark.turn === 1 && mark.promptSha256 === turn.promptSha256;
        });
        if (found.length !== 1) return found.length ? "ambiguous" : null;
        await linkIssue(c.id, found[0].id, "coordinator");
        await atomic(join(conversationDir(c.id), "conversation.json"), { ...(await readJSON(join(conversationDir(c.id), "conversation.json"))), issueId: found[0].id });
      } else {
        const list = await api.get(`/issues/${c.issueId}/comments`);
        const comments = Array.isArray(list) ? list : list?.items ?? [];
        if (!comments.some((comment) => {
          const mark = parseMarker(comment?.body);
          return mark?.conversationId === c.id && mark.turn === turn.n && mark.promptSha256 === turn.promptSha256;
        })) return null;
      }
      Object.assign(turn, { state: "submitted", observedAt: Date.now(), error: null });
      await atomic(turnPath(c.id, turn.n), turn);
      return "submitted";
    } catch (error) {
      return `unavailable: ${error.message}`;
    }
  }
  // The master off switch stops active pool turns as it stops local runs.
  async stopAll() {
    for (const id of await readdir(join(poolHome(), "conversations")).catch(() => [])) {
      if (!UUID.test(id)) continue;
      const s = await this.status({ conversationId: id }).catch(() => null);
      if (s && !s.terminal) await this.stop({ conversationId: id }).catch(() => {});
    }
  }
  // Operator repair: prune account reservations whose turns are proven ended.
  async reconcile() {
    const { remoteCommand } = await import("./pool-runner.mjs");
    const pool = await loadPool();
    const report = [];
    for (const account of new Set(Object.values(pool.profiles).map((p) => p.account))) {
      await pruneAccount(account, async (entry) => {
        const profile = pool.profiles[entry.profile];
        const state = profile ? (await remoteCommand(profile, ["reconcile", entry.runUuid]))?.state ?? "unknown" : "unknown";
        report.push({ account, runUuid: entry.runUuid, conversationId: entry.conversationId, turn: entry.turn, state });
        return state;
      }).catch((error) => report.push({ account, error: error.message }));
    }
    return report;
  }
  async dispatch(method, args = {}) {
    if (method === "profiles") return this.profiles();
    if (method === "start") return this.start(args);
    if (method === "status") return this.status(args);
    if (method === "wait") return this.wait(args);
    if (method === "logs") return this.logs(args);
    if (method === "answer") return this.answer(args);
    if (method === "followup") return this.followup(args);
    if (method === "stop") return this.stop(args);
    if (method === "reattach") return this.reattach(args);
    if (method === "reconcile") return this.reconcile();
    throw new Error("Unknown pool operation");
  }
}
// 4xx means Paperclip refused the request, so nothing was created; 409 can mean an
// idempotent replay of something that was, so it stays unknown.
const rejected = (error) => error.status >= 400 && error.status < 500 && error.status !== 409;
export function capabilities(provider) {
  return {
    liveQuestions: provider === "claude",
    followups: "turn-boundary",
    nativeMidTurnSteering: false,
    clarification: provider === "claude" ? "AskUserQuestion via permission-control stream" : "needs_input result, then a follow-up",
  };
}
export function foldLine(fold, provider, line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.pool === "event" && message.event && typeof message.event === "object") {
    if (provider === "claude") applyClaudeEvent(fold, message.event);
    else applyCodexEvent(fold, message.event);
    // Folding is a view only; the runner record decides which question is live.
    delete fold.question;
  } else if (message.pool === "receipt") fold.receipt = { state: message.state, termination: message.termination, code: message.code };
  else if (message.pool === "refused") fold.refused = { category: message.category, detail: message.detail };
  else if (message.pool === "quota") fold.quota = { decision: message.decision, detail: message.detail };
  else if (message.pool === "runner") fold.runner = { kind: message.kind, reason: message.reason ?? message.detail ?? null };
}
function summarize(line) {
  try {
    const message = JSON.parse(line);
    if (message.pool !== "event") return message;
    const event = message.event ?? {};
    return { pool: "event", type: event.type, subtype: event.subtype ?? event.item?.type ?? null };
  } catch {
    return { text: line.slice(0, 500) };
  }
}
