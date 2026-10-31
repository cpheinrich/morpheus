import { link, mkdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { home } from "./config.mjs";
import { atomic, readJSON, key } from "./store.mjs";
import { sha256 } from "./pool-config.mjs";
import { identity } from "./processes.mjs";

// Coordinator and runner share this tree on the controller host. Each file has one
// writer: the coordinator owns conversation.json and turns/<n>.json (intent and
// submission); the runner owns turns/<n>.claim, turns/<n>.run.json and session.json.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const poolHome = () => join(home(), "pool");
export function conversationDir(id) {
  if (!UUID.test(id ?? "")) throw new Error("Invalid pool conversation id");
  return join(poolHome(), "conversations", id);
}
const turnNumber = (n) => {
  if (!Number.isInteger(n) || n < 1 || n > 10000) throw new Error("Invalid turn number");
  return n;
};
export const turnPath = (id, n) => join(conversationDir(id), "turns", `${turnNumber(n)}.json`);
export const claimPath = (id, n) => join(conversationDir(id), "turns", `${turnNumber(n)}.claim`);
export const runPath = (id, n) => join(conversationDir(id), "turns", `${turnNumber(n)}.run.json`);
export const sessionPath = (id) => join(conversationDir(id), "session.json");
// Runner-owned Paperclip disposition journal and coordinator-owned host proof per turn.
export const dispositionPath = (id, n) => join(conversationDir(id), "turns", `${turnNumber(n)}.disposition.json`);
export const reconcilePath = (id, n) => join(conversationDir(id), "turns", `${turnNumber(n)}.reconcile.json`);
export const controlDir = (id) => join(conversationDir(id), "control");
export const answersDir = (id) => join(conversationDir(id), "answers");
export const cursorPath = (id) => join(conversationDir(id), "cursor.json");
export const issueIndex = (issueId) => {
  if (!UUID.test(issueId ?? "")) throw new Error("Invalid issue id");
  return join(poolHome(), "issues", `${issueId}.json`);
};
export const threadIndex = (threadId) => join(poolHome(), "threads", `${key(threadId)}.json`);
export async function initPool() {
  await mkdir(home(), { recursive: true, mode: 0o700 });
  for (const dir of ["conversations", "issues", "threads", "accounts"])
    await mkdir(join(poolHome(), dir), { recursive: true, mode: 0o700 });
}
export async function readConversation(id) {
  const conversation = await readJSON(join(conversationDir(id), "conversation.json"), null);
  if (!conversation) return null;
  // A runner may link an issue whose creation outcome the coordinator never learned.
  const linked = await readJSON(join(conversationDir(id), "issue.json"), null);
  return { ...conversation, issueId: conversation.issueId ?? linked?.issueId ?? null };
}
export async function linkIssue(conversationId, issueId, by) {
  // Exclusive and atomic: a concurrent runner sees no file or the complete one.
  const tmp = `${issueIndex(issueId)}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify({ conversationId }) + "\n", { mode: 0o600 });
  try {
    await link(tmp, issueIndex(issueId));
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readJSON(issueIndex(issueId), null);
    if (existing?.conversationId !== conversationId) throw new Error("Issue already belongs to another pool conversation");
  } finally {
    await unlink(tmp).catch(() => {});
  }
  if (by === "runner") await atomic(join(conversationDir(conversationId), "issue.json"), { issueId, linkedBy: by });
}
// The marker ties a Paperclip issue or comment back to one journaled turn, so an
// uncertain creation can be observed by exact identity instead of reposted.
export function marker(conversationId, turn, prompt) {
  return `<!-- factory-pool ${JSON.stringify({ conversationId, turn, promptSha256: sha256(prompt) })} -->`;
}
export function dispositionMarker(conversationId, turn, runId) {
  return `<!-- factory-pool-disposition ${JSON.stringify({ conversationId, turn, runId })} -->`;
}
export function parseDisposition(text) {
  const found = /<!-- factory-pool-disposition (\{[^\n]*?\}) -->/.exec(typeof text === "string" ? text : "");
  try {
    const value = found && JSON.parse(found[1]);
    if (UUID.test(value?.conversationId) && Number.isInteger(value.turn)) return value;
  } catch {}
  return null;
}
export function parseMarker(text) {
  const found = /<!-- factory-pool (\{[^\n]*?\}) -->/.exec(typeof text === "string" ? text : "");
  if (!found) return null;
  try {
    const value = JSON.parse(found[1]);
    if (UUID.test(value.conversationId) && Number.isInteger(value.turn) && /^[0-9a-f]{64}$/.test(value.promptSha256))
      return value;
  } catch {}
  return null;
}
// Deterministic RFC 4122-shaped id so a resent comment carries the same request id. The
// kind keeps coordinator follow-ups and runner dispositions in separate id spaces.
export function requestId(conversationId, turn, kind = "followup") {
  const h = sha256(`${kind}:${conversationId}:${turn}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Account reservations, as in the pilot's controller ledger: one turn in flight per
// account, and an entry leaves only when its turn is shown to have ended.
export async function withAccount(account, fn) {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(account)) throw new Error("Invalid account id");
  const path = join(poolHome(), "accounts", `${account}.json`);
  const lock = `${path}.lock`;
  let owned = false;
  for (let i = 0; i < 200 && !owned; i++) {
    try {
      await mkdir(lock, { mode: 0o700 });
      owned = true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const info = await stat(lock).catch(() => null);
      // A holder may spend up to 45 s reconciling one entry over SSH.
      if (info && Date.now() - info.mtimeMs > 120000) await rm(lock, { recursive: true, force: true });
      else await sleep(50);
    }
  }
  if (!owned) throw new Error("Account reservation ledger is busy");
  try {
    const entries = await readJSON(path, []);
    const result = await fn(entries);
    await atomic(path, entries);
    return result;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
const items = (value) => (Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : []);
// Settles an unknown disposition write only by exact positive evidence: the marker of the
// very run that wrote it. Absence proves nothing, because a timed-out PATCH can still land
// and Paperclip ignores agent request ids, so nothing is ever re-sent from here. Only acts
// once the writing runner is finished or gone, so it never races that runner's journal.
export async function observeDisposition(api, conversationId, issueId) {
  const conversation = await readConversation(conversationId);
  const n = conversation?.turns;
  if (!n || !issueId) return null;
  const path = dispositionPath(conversationId, n);
  const journal = await readJSON(path, null);
  if (!journal || !["posting", "unknown"].includes(journal.state)) return journal?.state ?? null;
  const run = await readJSON(runPath(conversationId, n), null);
  if (run && !run.finished && (await runnerAlive(run))) return journal.state;
  const seen = items(await api.get(`/issues/${issueId}/comments`)).some((comment) => {
    const mark = parseDisposition(comment?.body);
    return mark?.conversationId === conversationId && mark.turn === n && mark.runId === journal.runId &&
      comment.createdByRunId === journal.runId;
  });
  if (!seen) return journal.state;
  await atomic(path, { ...journal, state: "applied", observedAt: Date.now() });
  return "applied";
}
export async function runnerAlive(entry) {
  return !!entry.runnerPid && !!entry.runnerIdentity && (await identity(entry.runnerPid)) === entry.runnerIdentity;
}
export async function reserveAccount(account, entry, reconcile) {
  return withAccount(account, async (entries) => {
    for (const existing of [...entries]) {
      const state = (await runnerAlive(existing)) ? "active" : await reconcile(existing);
      if (state === "terminated") entries.splice(entries.indexOf(existing), 1);
      else existing.lastCheck = { state, at: Date.now() };
    }
    if (entries.length) return false;
    entries.push(entry);
    return true;
  });
}
export async function pruneAccount(account, reconcile) {
  return withAccount(account, async (entries) => {
    for (const existing of [...entries])
      if (!(await runnerAlive(existing)) && (await reconcile(existing)) === "terminated")
        entries.splice(entries.indexOf(existing), 1);
  });
}
export async function releaseAccount(account, runUuid) {
  return withAccount(account, async (entries) => {
    const index = entries.findIndex((e) => e.runUuid === runUuid);
    if (index >= 0) entries.splice(index, 1);
  });
}
