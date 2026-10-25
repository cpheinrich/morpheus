import { z } from "zod";
import { mkdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { home } from "./config.mjs";
import { atomic, configRead, projectIdentity, readJSON } from "./store.mjs";
import { loadPool, ownerFile, PROFILE_NAME, sha256 } from "./pool-config.mjs";
import { apiOrigin } from "./pool-paperclip.mjs";
import { poolHome, readConversation, turnPath } from "./pool-store.mjs";

// Only the owner-installed outbound Firebase connector calls this facade over the
// existing mode-600 Unix socket. It carries a server-verified actor; this is not an
// authentication endpoint and is deliberately unable to dispatch Manager methods.
const uuid = z.string().uuid();
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const actorSchema = z.object({ uid: z.string().min(1).max(128), role: z.literal("admin"), kind: z.enum(["user", "agent"]) }).strict();
const controllerSchema = z.object({ baseUrl: z.string().url(), companyId: uuid, projectId: uuid.nullable() }).strict();
const mappingSchema = z.object({
  version: z.literal(1), connectorId: z.string().min(1).max(128), companyId: uuid,
  controller: controllerSchema,
  profiles: z.record(z.string().regex(PROFILE_NAME), z.object({ repository: z.string().refine(isAbsolute), project: z.string().refine(isAbsolute), profileSha256: digest }).strict()),
}).strict();
const common = { connectorId: z.string().min(1).max(128), companyId: uuid, actor: actorSchema };
const prompt = z.string().min(1).max(200000).refine((value) => !!value.trim(), "A bounded prompt is required");
const reason = z.string().max(2000).optional();
const schemas = {
  profiles: z.object(common).strict(),
  start: z.object({ ...common, operationId: uuid, profile: z.string().regex(PROFILE_NAME), prompt }).strict(),
  followup: z.object({ ...common, operationId: uuid, conversationId: uuid, prompt, reason }).strict(),
  answer: z.object({ ...common, operationId: uuid, conversationId: uuid, questionId: z.string().min(1).max(512), answers: z.record(z.string(), z.unknown()).optional(), allow: z.boolean().optional(), reason }).strict(),
  stop: z.object({ ...common, operationId: uuid, conversationId: uuid }).strict(),
  status: z.object({ ...common, conversationId: uuid }).strict(),
  reattach: z.object({ ...common, conversationId: uuid }).strict(),
  wait: z.object({ ...common, conversationId: uuid, seconds: z.number().min(0).max(30).optional() }).strict(),
  logs: z.object({ ...common, conversationId: uuid, turn: z.number().int().min(1).max(10000).optional(), offset: z.number().int().min(0).optional(), limitBytes: z.number().int().min(1024).max(262144).optional() }).strict(),
  operation: z.object({ ...common, operationId: uuid }).strict(),
};
const mutations = new Set(["start", "followup", "answer", "stop"]);
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const hqProfileDigest = (profile) => sha256(canonical(profile));
export const hqPath = () => join(home(), "hq.json");
export const operationPath = (id) => {
  if (!uuid.safeParse(id).success) throw new Error("Invalid HQ operation id");
  return join(poolHome(), "hq-operations", `${sha256(id)}.json`);
};
const controllerOf = (pool) => ({ baseUrl: pool.controller.baseUrl, companyId: pool.controller.companyId, projectId: pool.controller.projectId ?? null });
const mappingDigest = (mapping, profile) => sha256(canonical({ connectorId: mapping.connectorId, companyId: mapping.companyId, controller: mapping.controller, profile, entry: mapping.profiles[profile] }));

// Deliberate allowlist: provider session ids, account ids, worker identities, host
// paths, raw native events and arbitrary upstream error strings stay on the Mac.
export function projectHQStatus(s) {
  return {
    conversationId: s.conversationId, profile: s.profile, provider: s.provider,
    turn: s.turn, submission: s.submission, state: s.state, terminal: s.terminal,
    termination: s.termination, stopped: ["cancelled", "interrupted"].includes(s.state) && ["verified", "not-started"].includes(s.termination) && s.terminal,
    question: s.question ? { id: s.question.id, toolName: s.question.toolName, input: s.question.input } : null,
    result: s.result ? { outcome: s.result.outcome ?? null, summary: s.result.summary ?? "", question: s.result.question ?? null } : null,
    progress: s.progress, sequence: s.sequence, sessionDrift: s.sessionDrift,
    ...(s.stopping === true ? { stopRequested: true } : {}),
  };
}
const receipt = (op) => ({
  operationId: op.operationId, action: op.action, requestSha256: op.requestSha256,
  conversationId: op.conversationId, turn: op.turn, state: op.state,
});
export async function verifyHQBinding(profileName, conversation = null, { args = null, executionPool = null, apiUrl = null, issue = null } = {}) {
  const mapping = mappingSchema.parse(JSON.parse(await ownerFile(hqPath(), "HQ controller mapping")));
  if (args && (args.connectorId !== mapping.connectorId || args.companyId !== mapping.companyId))
    throw new Error("HQ connector/company scope refused");
  const pool = await loadPool();
  if (mapping.companyId !== pool.controller.companyId || canonical(mapping.controller) !== canonical(controllerOf(pool)))
    throw new Error("HQ controller identity changed; reinstall the owner mapping");
  const config = await configRead();
  if (config.mode === "off") throw new Error("Delegation disabled");
  const profile = pool.profiles[profileName];
  const entry = mapping.profiles[profileName];
  if (!profile || !entry || hqProfileDigest(profile) !== entry.profileSha256)
    throw new Error("HQ profile is not mapped or changed; reinstall the owner mapping");
  if (executionPool && (canonical(controllerOf(executionPool)) !== canonical(mapping.controller) ||
    hqProfileDigest(executionPool.profiles[profileName]) !== entry.profileSha256))
    throw new Error("HQ captured execution binding changed");
  const repository = await projectIdentity(entry.repository);
  if (repository.cwd !== entry.repository || repository.project !== entry.project || config.projects[entry.project] === "off")
    throw new Error("HQ repository mapping changed or delegation is disabled");
  const identity = mappingDigest(mapping, profileName);
  if (conversation && (!conversation.hq || conversation.hq.mappingSha256 !== identity || conversation.profile !== profileName))
    throw new Error("Conversation is outside this HQ mapping");
  if (apiUrl && apiOrigin(apiUrl) !== apiOrigin(mapping.controller.baseUrl))
    throw new Error("HQ run controller origin changed");
  if (issue && (issue.companyId !== mapping.companyId || (issue.projectId ?? null) !== mapping.controller.projectId))
    throw new Error("HQ run company/project scope changed");
  return { project: entry.project, mappingSha256: identity };
}

export class HQPool {
  busy = new Set();
  constructor(pool, { draining = () => false } = {}) { this.pool = pool; this.draining = draining; }
  async authorize(args, profileName, conversation = null, executionPool = null) {
    return verifyHQBinding(profileName, conversation, { args, executionPool });
  }
  async dispatch(action, input = {}) {
    if (!schemas[action]) throw new Error("Unknown HQ pool operation");
    const args = schemas[action].parse(input);
    if (args.actor.kind === "agent" && ["answer", "followup"].includes(action) && !args.reason?.trim())
      throw new Error("Agent HQ replies require an explicit supervision reason");
    if (action === "profiles") {
      const mapping = mappingSchema.parse(JSON.parse(await ownerFile(hqPath(), "HQ controller mapping")));
      const profiles = [];
      for (const name of Object.keys(mapping.profiles)) {
        await this.authorize(args, name);
        const p = (await loadPool()).profiles[name];
        profiles.push({ name, provider: p.provider, model: p.model, effort: p.effort, permission: p.permission });
      }
      if (!profiles.length) throw new Error("No HQ profiles are installed");
      return { profiles };
    }
    if (action === "operation") {
      const op = await readJSON(operationPath(args.operationId), null);
      if (!op) throw new Error("Unknown HQ operation");
      const admission = await this.authorize(args, op.profile, await readConversation(op.conversationId));
      if (op.mappingSha256 !== admission.mappingSha256) throw new Error("HQ operation mapping changed");
      return this.observe(op);
    }
    const c = args.conversationId ? await this.pool.conversation(args.conversationId) : null;
    const profile = c?.profile ?? args.profile;
    const admission = await this.authorize(args, profile, c);
    if (!mutations.has(action)) {
      if (action === "logs") {
        const result = await this.pool.logs(args);
        return { offset: result.offset, nextOffset: result.nextOffset, lines: result.lines.map((line) => Object.fromEntries(
          ["pool", "type", "subtype", "state", "termination", "decision", "kind", "category"].filter((key) => typeof line[key] === "string").map((key) => [key, line[key]]),
        )) };
      }
      // Plain reattach only observes uncertain writes, never retries them.
      const s = action === "reattach" ? await this.pool.reattach({ conversationId: c.id })
        : action === "wait" ? await this.pool.wait(args) : await this.pool.status(args);
      await this.authorize(args, profile, await this.pool.conversation(c.id));
      return { work: projectHQStatus(s) };
    }
    if (this.draining()) throw new Error("Bridge upgrade is in progress; retry afterward.");
    if (this.busy.has(args.operationId)) throw new Error("HQ operation is applying; observe it before retrying");
    this.busy.add(args.operationId);
    try {
      const requestSha256 = sha256(canonical({ action, args }));
      const previous = await readJSON(operationPath(args.operationId), null);
      if (previous) {
        if (previous.requestSha256 !== requestSha256) throw new Error("HQ operation id already has a different payload");
        if (previous.mappingSha256 !== admission.mappingSha256) throw new Error("HQ operation mapping changed");
        return this.observe(previous);
      }
      const op = {
        version: 1, operationId: args.operationId, action, requestSha256, profile,
        mappingSha256: admission.mappingSha256, actor: args.actor, companyId: args.companyId,
        conversationId: c?.id ?? randomUUID(), turn: action === "followup" ? null : c?.turns ?? 1, state: "prepared", createdAt: Date.now(),
      };
      await mkdir(join(poolHome(), "hq-operations"), { recursive: true, mode: 0o700 });
      await atomic(operationPath(op.operationId), op);
      const hq = {
        conversationId: op.conversationId,
        identity: { mappingSha256: op.mappingSha256, actor: args.actor, operationId: op.operationId },
        admit: async (current, executionPool = null) => {
          if (this.draining()) throw new Error("Bridge upgrade is in progress");
          return this.authorize(args, profile, current, executionPool);
        },
        recordTurn: async (id, turn) => {
          Object.assign(op, { conversationId: id, turn, state: "applying" });
          await atomic(operationPath(op.operationId), op);
        },
      };
      const source = args.actor.kind === "user" ? "user" : "codex";
      try {
        let result;
        if (action === "start") result = await this.pool.start(args, hq);
        else if (action === "followup") result = await this.pool.followup({ ...args, replySource: source, replyReason: args.reason ?? "Authenticated HQ actor follow-up" }, hq);
        else if (action === "answer") result = await this.pool.answer({ ...args, source, reason: args.reason ?? "Authenticated HQ actor reply" }, hq);
        else result = await this.pool.stop(args, hq);
        Object.assign(op, { state: "receipted", receiptedAt: Date.now() });
        await atomic(operationPath(op.operationId), op);
        return { operation: receipt(op), work: projectHQStatus(result) };
      } catch {
        // We cannot infer no effects from an exception (including a lost local write).
        // Retain the exact identity and expose observation; never automatically retry.
        op.state = "unknown";
        await atomic(operationPath(op.operationId), op);
        return this.observe(op);
      }
    } finally { this.busy.delete(args.operationId); }
  }
  async observe(op) {
    const c = await readConversation(op.conversationId);
    if (!c) return { operation: receipt(op), work: null };
    // Observe upstream markers only. Even a definite miss cannot authorize a repost.
    if (op.turn === null) {
      const pending = await readJSON(turnPath(c.id, c.turns), null);
      if (pending?.operationId === op.operationId) {
        op.turn = c.turns;
        await atomic(operationPath(op.operationId), op);
      }
    }
    let turn = op.turn === null ? null : await readJSON(turnPath(c.id, op.turn), null);
    if (["prepared", "applying", "unknown"].includes(op.state) || ["posting", "unknown"].includes(turn?.state)) {
      await this.pool.reattach({ conversationId: c.id }).catch(() => null);
      turn = op.turn === null ? null : await readJSON(turnPath(c.id, op.turn), null);
    }
    return {
      operation: { ...receipt(op), submission: turn?.state ?? null },
      work: projectHQStatus(await this.pool.status({ conversationId: c.id })),
    };
  }
}
