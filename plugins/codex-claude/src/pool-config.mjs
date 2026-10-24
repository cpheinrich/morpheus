import { z } from "zod";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { home, modelIdPattern, MOVING_MODEL_ALIASES } from "./config.mjs";

// Pool profiles bind one Paperclip agent to one provider, host, account and workspace.
// Both files are operator-owned and live outside every model workspace; a worker can
// request a profile by name but never choose its host, model, effort or permission.
export const PROFILE_NAME = /^[a-z][a-z0-9-]{0,40}$/;
export const ENVELOPE = "codex-claude-pool-envelope/1";
export const SSH_TARGET = /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/;
export const SSH_OPTIONS = [
  "-o", "BatchMode=yes",
  "-o", "StrictHostKeyChecking=yes",
  "-o", "ConnectTimeout=15",
  "-o", "ServerAliveInterval=10",
  "-o", "ServerAliveCountMax=3",
];
const absolute = z.string().refine(isAbsolute, "must be an absolute path");
const uuid = z.string().uuid();
const efforts = {
  claude: ["low", "medium", "high", "xhigh", "max"],
  codex: ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"],
};
// No full-access mode in this version: Claude tool requests reach the user through
// the permission-control stream, and Codex runs in a sandbox it cannot widen.
export const PERMISSIONS = {
  claude: ["default", "acceptEdits", "plan"],
  codex: ["read-only", "workspace-write"],
};
const selection = (value, ctx) => {
  if (!efforts[value.provider].includes(value.effort))
    ctx.addIssue({ code: "custom", message: `effort ${value.effort} is not valid for ${value.provider}` });
  if (!PERMISSIONS[value.provider].includes(value.permission))
    ctx.addIssue({ code: "custom", message: `permission ${value.permission} is not allowed for ${value.provider}` });
  if (!modelIdPattern.test(value.model) || MOVING_MODEL_ALIASES.has(value.model.toLowerCase()))
    ctx.addIssue({ code: "custom", message: "model must be an explicit, non-moving identifier" });
};
export const profileSchema = z
  .object({
    provider: z.enum(["claude", "codex"]),
    agentId: uuid,
    account: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
    host: z
      .object({
        transport: z.enum(["ssh", "local"]),
        target: z.string().regex(SSH_TARGET).optional(),
        ssh: z.string().min(1).default("ssh"),
        node: absolute,
        bridge: absolute,
        hostConfig: absolute,
      })
      .strict()
      .refine((h) => h.transport === "local" || !!h.target, "ssh transport needs target user@host"),
    workspace: absolute,
    model: z.string(),
    effort: z.string(),
    permission: z.string(),
  })
  .strict()
  .superRefine(selection);
export const poolSchema = z
  .object({
    version: z.literal(1),
    controller: z
      .object({
        baseUrl: z.string().url(),
        companyId: uuid,
        projectId: uuid.optional(),
        tokenFile: absolute,
      })
      .strict(),
    heartbeatSeconds: z.number().min(0.05).max(30).default(2),
    profiles: z.record(z.string().regex(PROFILE_NAME), profileSchema),
  })
  .strict();
const limit = z
  .object({ stopAt: z.number().gt(0).max(100), hardAt: z.number().gt(0).max(100) })
  .strict()
  .refine((l) => l.stopAt <= l.hardAt, "stopAt must not exceed hardAt");
export const hostSchema = z
  .object({
    version: z.literal(1),
    hostId: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
    path: z.string().min(1).default("/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"),
    graceSeconds: z.number().min(0.2).max(300).default(30),
    maxRunSeconds: z.number().int().min(10).max(28800).default(3600),
    maxLogBytes: z.number().int().min(65536).max(64 * 1024 * 1024).default(16 * 1024 * 1024),
    quota: z
      .partialRecord(
        z.enum(["claude", "codex"]),
        z
          .object({
            command: z.array(z.string().min(1)).min(1).refine((a) => isAbsolute(a[0]), "quota command needs an absolute executable"),
            limits: z.record(z.string().min(1), limit).refine((l) => Object.keys(l).length > 0, "limits are required"),
            freshSeconds: z.number().min(1).max(3600).default(120),
            meterSeconds: z.number().min(0).max(3600).default(60),
            timeoutSeconds: z.number().min(1).max(120).default(75),
          })
          .strict(),
      )
      .default({}),
    profiles: z.record(
      z.string().regex(PROFILE_NAME),
      z
        .object({
          bindingSha256: z.string().regex(/^[0-9a-f]{64}$/),
          provider: z.enum(["claude", "codex"]),
          workspace: absolute,
          model: z.string(),
          effort: z.string(),
          permission: z.string(),
        })
        .strict()
        .superRefine(selection),
    ),
  })
  .strict()
  .superRefine((value, ctx) => {
    // One writer per workspace: two profiles may never share a checkout.
    const seen = new Set();
    for (const entry of Object.values(value.profiles)) {
      if (seen.has(entry.workspace))
        ctx.addIssue({ code: "custom", message: "each workspace belongs to exactly one profile" });
      seen.add(entry.workspace);
    }
  });
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
// Everything that decides where and how a turn runs. A change creates a new identity:
// conversations pinned to the old digest refuse rather than silently moving.
export function bindingDigest(name, p) {
  return sha256(
    JSON.stringify([
      name, p.provider, p.agentId, p.account, p.host.transport, p.host.target ?? null,
      p.host.bridge, p.host.hostConfig, p.workspace, p.model, p.effort, p.permission,
    ]),
  );
}
// The exact entry an operator stages in the host's pool-host.json for this profile.
export function hostEntry(name, profile) {
  return {
    bindingSha256: bindingDigest(name, profile),
    provider: profile.provider,
    workspace: profile.workspace,
    model: profile.model,
    effort: profile.effort,
    permission: profile.permission,
  };
}
export async function ownerFile(path, what) {
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`${what} is not configured`);
    throw error;
  }
  if (!info.isFile() || info.uid !== process.getuid() || info.mode & 0o077)
    throw new Error(`${what} must be a regular file owned by this user with mode 600`);
  return readFile(path, "utf8");
}
export const poolPath = () => process.env.CODEX_CLAUDE_POOL || join(home(), "pool.json");
export async function loadPool(path = poolPath()) {
  const text = await ownerFile(path, "Pool profile file");
  const parsed = poolSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`Pool profile file is invalid: ${parsed.error.issues[0].message}`);
  return parsed.data;
}
export async function readToken(path) {
  const token = (await ownerFile(path, "Paperclip token file")).trim();
  if (!token || token.length > 8192 || /\s/.test(token))
    throw new Error("Paperclip token file must hold one token");
  return token;
}
export function inside(child, parent) {
  return child === parent || child.startsWith(parent.replace(/\/$/, "") + "/");
}
export async function loadHost(path) {
  if (!isAbsolute(path)) throw new Error("host config path must be absolute");
  const parsed = hostSchema.safeParse(JSON.parse(await ownerFile(path, "Pool host file")));
  if (!parsed.success) throw new Error(`Pool host file is invalid: ${parsed.error.issues[0].message}`);
  for (const entry of Object.values(parsed.data.profiles))
    if (inside(path, entry.workspace)) throw new Error("Pool host file must be outside every workspace");
  return parsed.data;
}
// The remote shell joins ssh's trailing words; quote each argument exactly once.
export const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
export function transportArgv(profile, ...tail) {
  const remote = [profile.host.node, join(profile.host.bridge, "scripts", "pool-remote.mjs"), ...tail, "--config", profile.host.hostConfig];
  if (profile.host.transport === "local") return remote;
  return [profile.host.ssh, ...SSH_OPTIONS, profile.host.target, remote.map(shellQuote).join(" ")];
}
// The SSH client needs its agent and identity, never the run token or provider keys.
export function transportEnv(env) {
  const out = {};
  for (const key of ["HOME", "USER", "LOGNAME", "PATH", "SSH_AUTH_SOCK", "LANG", "TMPDIR"])
    if (env[key]) out[key] = env[key];
  return out;
}
// Same admission rule as the pilot supervisor: unknown or stale telemetry refuses, and
// every reported window needs a configured limit. A pool host admits one turn per
// workspace, so nothing else in flight is charged.
export function judgeQuota(snapshot, quota, now = Date.now(), gate = "stopAt") {
  if (!snapshot || !Array.isArray(snapshot.windows) || !snapshot.windows.length)
    return { decision: "unknown", detail: "no quota windows" };
  const observed = Date.parse(snapshot.observedAt);
  if (!Number.isFinite(observed) || observed > now + 5000 || now - observed > quota.freshSeconds * 1000)
    return { decision: "unknown", detail: "quota observation is stale or undated" };
  let worst = 0;
  for (const window of snapshot.windows) {
    const id = window?.id;
    const configured = quota.limits[id];
    if (!configured) return { decision: "unknown", detail: `quota window ${JSON.stringify(id)} has no configured limit` };
    const used = window.usedPercent;
    if (typeof used !== "number" || !Number.isFinite(used) || used < 0 || used > 100)
      return { decision: "unknown", detail: `quota window ${id} has no valid usage` };
    const resets = Date.parse(window.resetsAt);
    if (!Number.isFinite(resets) || resets <= now)
      return { decision: "unknown", detail: `quota window ${id} has no future reset` };
    if (used >= configured[gate])
      return { decision: "refuse", detail: `window ${id} at ${used}% reaches ${gate} ${configured[gate]}%` };
    worst = Math.max(worst, used);
  }
  return { decision: "admit", detail: `highest window ${worst}%` };
}
export function sanitizeQuota(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.windows)) return null;
  return {
    observedAt: snapshot.observedAt ?? null,
    windows: snapshot.windows.map((w) => ({ id: w?.id, usedPercent: w?.usedPercent, resetsAt: w?.resetsAt })),
  };
}
