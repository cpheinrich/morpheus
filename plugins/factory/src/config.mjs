import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

export const home = () =>
  process.env.FACTORY_HOME ||
  join(homedir(), ".local", "share", "factory");
export const modeSchema = z.enum(["off", "manual", "automatic"]);
/**
 * A Claude model id or family alias as the CLI's --model accepts it, optionally with the
 * bracketed context suffix the CLI understands (`sonnet[1m]`). The first character may
 * not be a dash, so a value can never be read by the CLI as another flag.
 */
export const modelIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*(\[[a-zA-Z0-9]+\])?$/;
/**
 * Aliases that resolve to whatever the CLI currently considers best are refused: the
 * subscription allowlist existed to stop one of these selecting a paid-credit-only
 * model, and that is the only part of it worth keeping. A family alias (opus, sonnet,
 * haiku, fable) or a full id names one thing and is passed through.
 */
export const MOVING_MODEL_ALIASES = new Set(["best", "latest", "default", "newest", "auto"]);
const fixedModel = z
  .string()
  .regex(modelIdPattern)
  .refine((model) => !MOVING_MODEL_ALIASES.has(model.toLowerCase()), {
    message: "A moving alias (best, latest, default, newest, auto) cannot be the fallback model.",
  });
/**
 * A reference to a secret, never the secret itself: `env:NAME`, `secret:/path` (a 0600
 * file) or `exec:/path/to/command arg…` (a command whose stdout is the value, split on
 * whitespace and run without a shell). The exec form is what lets a credentials manager
 * such as `darwin-env get NAME` stay the single source of truth.
 */
export const SECRET_REF_PREFIXES = ["env:", "secret:", "exec:"];
export const secretRef = z
  .string()
  .min(1)
  .refine((v) => SECRET_REF_PREFIXES.some((p) => v.startsWith(p) && v.length > p.length), {
    message: "keyRef must be env:NAME, secret:path or exec:command, never a raw key",
  });
export const configSchema = z
  .object({
    version: z.literal(1).default(1),
    mode: modeSchema.default("off"),
    // A pooled gateway is used while its account is below this share of usage; at or
    // above it the coordinator falls back to native. 90 leaves a little headroom.
    threshold: z.number().min(1).max(100).default(90),
    gateways: z
      .array(
        z.object({
          name: z.string().min(1),
          provider: z.enum(["claude", "codex"]),
          baseUrl: z.string().min(1),
          keyRef: secretRef,
        }),
      )
      .default([]),
    // The sub2api admin login that reads gateway quota. References, never values: the
    // bridge service inherits the environment of whichever session first started it,
    // which is rarely the shell that exported FACTORY_ADMIN_EMAIL, so an `exec:` or
    // `secret:` reference is what makes quota readable from a desktop session. Absent,
    // the service falls back to FACTORY_ADMIN_EMAIL / FACTORY_ADMIN_PASSWORD in its env.
    admin: z
      .object({ emailRef: secretRef, passwordRef: secretRef })
      .nullable()
      .default(null),
    maxConcurrent: z.number().int().min(1).max(8).default(2),
    disconnectGraceSeconds: z.number().int().min(5).max(300).default(60),
    maxRunSeconds: z.number().int().min(10).max(28800).default(7200),
    maxSupervisionReplies: z.number().int().min(0).max(50).default(8),
    memorySharing: z.boolean().default(false),
    // Deprecated and ignored: earlier releases launched only models in this list, which
    // blocked every model the Claude CLI gained after the plugin shipped. The CLI is the
    // authority on what the subscription can run (an unavailable id fails the run with a
    // clear error and no cost). Accepted so an installed configuration keeps parsing.
    subscriptionModels: z.array(z.string().regex(modelIdPattern)).optional(),
    // Used when neither an explicit model nor modelMap names one for the active Codex model.
    // Codex ships models faster than this map is updated; "gpt-6.1-sol" blocked delegation
    // until the user was asked to pick a Claude model. A family alias follows whatever the
    // installed Claude CLI resolves it to. null restores the refusal.
    modelFallback: fixedModel.nullable().default("opus"),
    modelMap: z.record(z.string(), z.string()).default({
      "gpt-6-astra": "opus",
      "gpt-5.6-sol": "opus",
      "gpt-5.6-terra": "sonnet",
      "gpt-5.6-luna": "haiku",
      "gpt-5.5": "opus",
    }),
    effortMap: z
      .record(z.string(), z.enum(["low", "medium", "high", "xhigh", "max"]))
      .default({
        none: "low",
        minimal: "low",
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
        max: "max",
        ultra: "max",
      }),
    // Claude-coordinated sessions delegate to Codex with these explicit mappings.
    codexModels: z
      .array(z.string().regex(/^[a-zA-Z0-9_.-]+$/))
      .default([
        "gpt-6-astra",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
        "gpt-5.5",
      ]),
    codexModelMap: z.record(z.string(), z.string()).default({
      fable: "gpt-6-astra",
      opus: "gpt-5.6-sol",
      sonnet: "gpt-5.6-terra",
      haiku: "gpt-5.6-luna",
    }),
    codexEffortMap: z
      .record(
        z.string(),
        z.enum(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]),
      )
      .default({
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
        max: "max",
      }),
    projects: z.record(z.string(), modeSchema).default({}),
    // File paths must be explicitly selected; never expose the entire cross-project Codex store.
    memorySources: z
      .record(
        z.string(),
        z.object({
          codex: z.array(z.string()).default([]),
          claude: z.array(z.string()).default([]),
        }),
      )
      .default({}),
  })
  .strict();
export const defaults = () => configSchema.parse({});
// The primary is the agent coordinating the conversation. A gateway is a pooled
// subscription; the coordinator delegates to the one with the most headroom, and
// falls back to native once every gateway is at or above the threshold.
export function route(config, task, gateways, operation, primary = "codex") {
  const mode = config.projects[task.project] ?? config.mode;
  if (config.mode === "off" || mode === "off" || task.disabled)
    return { executor: primary, reason: "Delegation disabled" };
  const override = operation ?? task.override;
  if (override === "codex" || override === "claude")
    return { executor: override, reason: "Explicit override" };
  if (mode === "manual")
    return { executor: primary, reason: "Manual delegation only" };
  const candidates = (gateways ?? []).filter(
    (g) => g.provider !== primary && g.usedPercent != null && g.usedPercent < config.threshold,
  );
  if (candidates.length === 0)
    return { executor: primary, reason: "No pooled subscription below threshold; native" };
  const best = candidates.reduce((a, b) =>
    100 - a.usedPercent > 100 - b.usedPercent ? a : b,
  );
  return {
    executor: best.provider,
    reason: `${best.name} at ${best.usedPercent}%; most headroom`,
    gateway: best,
  };
}

// Resolve a key reference to its value at spawn time. `env:NAME` reads the named
// environment variable; `secret:path` reads a 0600 file; `exec:command arg…` runs the
// command without a shell and takes its trimmed stdout. Never a raw key, and the value
// is never logged: errors name the reference, not what it produced.
export async function resolveKeyRef(keyRef, { run = exec, env = process.env } = {}) {
  if (keyRef.startsWith("env:")) {
    const value = env[keyRef.slice(4)];
    if (!value) throw new Error(`Environment variable ${keyRef.slice(4)} is not set`);
    return value;
  }
  if (keyRef.startsWith("secret:")) {
    const path = keyRef.slice(7);
    try {
      const info = await stat(path);
      if (info.mode & 0o077)
        throw new Error(`has group/world permissions; chmod 600 ${path}`);
      return (await readFile(path, "utf8")).trim();
    } catch (error) {
      throw new Error(`Cannot read secret ${path}: ${error.message}`);
    }
  }
  if (keyRef.startsWith("exec:")) {
    const [command, ...args] = keyRef.slice(5).trim().split(/\s+/);
    if (!command) throw new Error(`Invalid keyRef "${keyRef}": exec: needs a command`);
    let stdout;
    try {
      ({ stdout } = await run(command, args, {
        env,
        encoding: "utf8",
        timeout: 15000,
        maxBuffer: 64 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      }));
    } catch (error) {
      // The child's stderr and stdout stay out of the message: they may hold the value.
      throw new Error(
        `Cannot resolve ${keyRef}: ${command} ${error.code != null ? `exited ${error.code}` : error.message}`,
      );
    }
    const value = String(stdout).trim();
    if (!value) throw new Error(`Cannot resolve ${keyRef}: ${command} printed nothing`);
    return value;
  }
  throw new Error(`Invalid keyRef "${keyRef}": use env:NAME, secret:path or exec:command`);
}

// The sub2api admin login used to read gateway quota. Configured references win; the
// service's own FACTORY_ADMIN_EMAIL / FACTORY_ADMIN_PASSWORD are the fallback. A
// reference that cannot be resolved reports why instead of throwing, so doctor and
// inspect can show the reason while routing fails closed on the missing quota.
export async function resolveAdminCredentials(config, options = {}) {
  const env = options.env ?? process.env;
  if (!config.admin)
    return {
      adminEmail: env.FACTORY_ADMIN_EMAIL,
      adminPassword: env.FACTORY_ADMIN_PASSWORD,
      source: env.FACTORY_ADMIN_EMAIL && env.FACTORY_ADMIN_PASSWORD ? "env" : "missing",
    };
  try {
    const [adminEmail, adminPassword] = await Promise.all([
      resolveKeyRef(config.admin.emailRef, options),
      resolveKeyRef(config.admin.passwordRef, options),
    ]);
    return { adminEmail, adminPassword, source: "config" };
  } catch (error) {
    return { adminEmail: undefined, adminPassword: undefined, source: "config", error: error.message };
  }
}

// Read each gateway's account usage from the sub2api admin API. Fails closed: an
// unreadable quota is `usedPercent: null`, which route() treats as no headroom.
// Assumes one sub2api instance (the first gateway's baseUrl) and one account per
// provider; a multi-instance or multi-account pool needs a richer mapping.
export async function readGatewayQuota(
  gateways,
  { adminEmail, adminPassword, fetchImpl = globalThis.fetch, now = Date.now() } = {},
) {
  if (!gateways.length) return [];
  if (!adminEmail || !adminPassword)
    return gateways.map((g) => ({ ...g, usedPercent: null }));
  const baseUrl = gateways[0].baseUrl.replace(/\/+$/, "");
  let token;
  try {
    const login = await fetchImpl(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    if (!login.ok) throw new Error(`login HTTP ${login.status}`);
    token = (await login.json())?.data?.access_token;
    if (!token) throw new Error("no access token");
  } catch (error) {
    return gateways.map((g) => ({ ...g, usedPercent: null, error: error.message }));
  }
  let items;
  try {
    const accounts = await fetchImpl(`${baseUrl}/api/v1/admin/accounts`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!accounts.ok) throw new Error(`accounts HTTP ${accounts.status}`);
    items = (await accounts.json())?.data?.items ?? [];
  } catch (error) {
    return gateways.map((g) => ({ ...g, usedPercent: null, error: error.message }));
  }
  return gateways.map((g) => {
    const platform = g.provider === "claude" ? "anthropic" : "openai";
    const account = items.find((a) => a.platform === platform);
    if (!account) return { ...g, usedPercent: null };
    return { ...g, ...accountUsage(g.provider, account.extra ?? {}, now) };
  });
}

// An account is as full as its most-used window: a subscription with an empty 5-hour
// window but a nearly spent week has no headroom. A window whose reset time has passed
// is skipped (sub2api only refreshes on use, so it reports the finished window's figure).
// Returns usedPercent null when no window is readable, which routing treats as no headroom.
export function accountUsage(provider, extra, now = Date.now()) {
  const live = (resetAt) => {
    if (resetAt == null) return true;
    const ms = typeof resetAt === "number" ? resetAt * 1000 : Date.parse(resetAt);
    return !Number.isFinite(ms) || ms > now;
  };
  const windows =
    provider === "claude"
      ? [
          { name: "5h", used: extra.session_window_utilization, resetAt: null, fraction: true },
          { name: "7d", used: extra.passive_usage_7d_utilization, resetAt: extra.passive_usage_7d_reset, fraction: true },
        ]
      : [
          { name: "5h", used: extra.codex_5h_used_percent, resetAt: extra.codex_5h_reset_at },
          { name: "7d", used: extra.codex_7d_used_percent, resetAt: extra.codex_7d_reset_at },
        ];
  const read = windows
    .filter((w) => Number.isFinite(w.used) && live(w.resetAt))
    .map((w) => ({ name: w.name, usedPercent: Math.round(w.fraction ? w.used * 100 : w.used) }));
  if (!read.length) return { usedPercent: null, windows: {} };
  return {
    usedPercent: Math.max(...read.map((w) => w.usedPercent)),
    windows: Object.fromEntries(read.map((w) => [w.name, w.usedPercent])),
  };
}
// Claude exposes subscription windows only to its status line, which records them.
// A snapshot older than maxAgeMs is unknown, never a reason to assume headroom.
export function claudeRemaining(snapshot, now = Date.now(), maxAgeMs = 20 * 60000) {
  if (
    !snapshot ||
    !Number.isFinite(snapshot.recordedAt) ||
    now - snapshot.recordedAt > maxAgeMs ||
    snapshot.recordedAt > now + 60000
  )
    return null;
  const windows = ["five_hour", "seven_day"]
    .map((name) => snapshot.rateLimits?.[name])
    .filter((v) => v != null);
  if (
    !windows.length ||
    windows.some(
      (v) =>
        !Number.isFinite(v.used_percentage) ||
        v.used_percentage < 0 ||
        v.used_percentage > 100 ||
        !Number.isFinite(v.resets_at) ||
        v.resets_at * 1000 <= now,
    )
  )
    return null;
  return Math.min(...windows.map((v) => 100 - v.used_percentage));
}
/**
 * The Claude model and effort for a delegated run, with where the model came from:
 * `override` (named by the user for this run), `mapped` (modelMap), or `fallback`
 * (modelFallback, when the active Codex model has no mapping). The provenance travels
 * with the run's selection so a coordinator can say what ran without asking.
 */
export function modelSelection(config, snapshot, override = {}) {
  const requested = snapshot.model ?? null;
  const mapped = requested == null ? undefined : config.modelMap[requested];
  const fallback = config.modelFallback ?? null;
  let model;
  let source;
  if (override.model != null) [model, source] = [override.model, "override"];
  else if (mapped != null) [model, source] = [mapped, "mapped"];
  else if (fallback) [model, source] = [fallback, "fallback"];
  const effort = override.effort ?? config.effortMap[snapshot.reasoningEffort];
  if (!model && source)
    throw new Error(
      "Unsupported Claude model identifier. Pass a full model id or a family alias as `claude --model` accepts it.",
    );
  if (!model)
    throw new Error(
      `No Claude model mapping for Codex model "${requested ?? "unknown"}" and modelFallback is disabled. Add it to modelMap, set modelFallback (for example "opus"), or pass an explicit model.`,
    );
  if (typeof model !== "string" || !modelIdPattern.test(model))
    throw new Error(
      "Unsupported Claude model identifier. Pass a full model id or a family alias as `claude --model` accepts it.",
    );
  if (MOVING_MODEL_ALIASES.has(model.toLowerCase()))
    throw new Error(
      `Claude model alias "${model}" moves with releases and could select a paid-credit-only model; name the model explicitly.`,
    );
  if (!["low", "medium", "high", "xhigh", "max"].includes(effort))
    throw new Error("No effort mapping for the current Codex selection.");
  return {
    model,
    effort,
    source,
    codexModel: requested,
    ...(source === "fallback"
      ? { reason: `No modelMap entry for Codex model "${requested ?? "unknown"}"; used modelFallback "${model}".` }
      : {}),
  };
}
export function permissionMode(snapshot) {
  // Approval mode and filesystem confinement are independent. No prompt-only sandbox emulation.
  if (snapshot.sandbox?.type !== "dangerFullAccess")
    throw new Error(
      "This version delegates only verified full-access sessions. Restricted sandbox inheritance is not yet supported; permissions were not widened.",
    );
  if (snapshot.approvalPolicy === "never") return "bypassPermissions";
  if (snapshot.approvalPolicy === "on-request") return "default";
  throw new Error("Unsupported approval policy; delegation refused.");
}
// A remote pool profile may not exceed the calling Codex task's own sandbox. Writes
// without a per-action user approval need a writable coordinator; read-only profiles
// fit any verified sandbox. Unknown sandboxes or approval policies refuse.
const POOL_SANDBOX_RANK = { readOnly: 0, workspaceWrite: 1, dangerFullAccess: 2 };
const POOL_PERMISSION_RANK = { plan: 0, "read-only": 0, default: 1, acceptEdits: 1, "workspace-write": 1 };
const APPROVAL_POLICIES = new Set(["never", "on-request", "on-failure", "untrusted"]);
export function assertPoolAuthority(snapshot, permission) {
  const rank = POOL_SANDBOX_RANK[snapshot?.sandbox?.type];
  if (rank === undefined || !APPROVAL_POLICIES.has(snapshot?.approvalPolicy))
    throw new Error("This Codex task's permissions could not be verified; pool delegation refused.");
  const needed = POOL_PERMISSION_RANK[permission];
  if (needed === undefined) throw new Error("Unknown pool permission; refused.");
  if (needed > rank)
    throw new Error(
      `Pool permission ${permission} exceeds this Codex task's ${snapshot.sandbox.type} sandbox; permissions were not widened.`,
    );
}
export function subscriptionEnv(env) {
  const clean = { ...env };
  for (const key of Object.keys(clean)) {
    if (
      /^(ANTHROPIC_|CLAUDE_CODE_(USE_|OAUTH_TOKEN|API_KEY|BASE_URL|SIMPLE|SAFE_MODE|EFFORT_LEVEL|PROJECT_DIR_NAME)|FACTORY_ADMIN_)/.test(
        key,
      ) ||
      key === "CLAUDECODE"
    )
      delete clean[key];
  }
  return { ...clean, [delegatedMarker]: "1" };
}
export function codexSelection(config, session = {}, override = {}) {
  const family = /\b(fable|opus|sonnet|haiku)\b/.exec(
    String(session.model || "").replace(/[-_]/g, " "),
  )?.[1];
  const model = override.model ?? config.codexModelMap[family];
  const effort = override.effort ?? config.codexEffortMap[session.effort];
  if (model && !config.codexModels.includes(model))
    throw new Error(
      "No approved Codex model mapping. Configure codexModelMap/codexModels explicitly.",
    );
  if (override.effort && !Object.values(config.codexEffortMap).includes(effort))
    throw new Error("Unsupported Codex effort override.");
  // An unknown Claude model or effort defers to Codex's own configured default.
  return { model: model ?? null, effort: effort ?? null };
}
// Claude permission modes map onto Codex's sandbox. Nothing is widened: only an
// explicit bypass reaches full access, and unknown modes refuse.
export function codexPermission(mode, writableRoots = []) {
  if (mode === "bypassPermissions")
    return {
      name: "danger-full-access",
      args: ["--dangerously-bypass-approvals-and-sandbox"],
    };
  // Codex exec cannot ask, so a mode that asks before every edit (`default`) may only read.
  const sandbox = { plan: "read-only", default: "read-only", acceptEdits: "workspace-write", auto: "workspace-write" }[mode];
  if (!sandbox)
    throw new Error(
      `Claude permission mode ${mode ?? "unknown"} has no verified Codex sandbox; delegation refused.`,
    );
  const args = [
    "-c",
    `sandbox_mode="${sandbox}"`,
    "-c",
    'approval_policy="never"',
  ];
  // A linked worktree keeps its Git metadata outside the checkout; commits need it.
  if (sandbox === "workspace-write" && writableRoots.length)
    args.push(
      "-c",
      `sandbox_workspace_write.writable_roots=${JSON.stringify(writableRoots)}`,
    );
  return { name: sandbox, args };
}
export function codexEnv(env) {
  const clean = { ...env };
  for (const key of Object.keys(clean))
    if (
      /^(OPENAI_|CODEX_API_KEY|CODEX_THREAD_ID|CLAUDE_CODE_SESSION_ID|FACTORY_ADMIN_)/.test(key) ||
      key === "CLAUDECODE"
    )
      delete clean[key];
  return { ...clean, [delegatedMarker]: "1" };
}
// Set on every delegated worker so its own copy of this plugin never delegates back.
export const delegatedMarker = "FACTORY_DELEGATED";
