import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";

export const home = () =>
  process.env.CODEX_CLAUDE_HOME ||
  join(homedir(), ".local", "share", "codex-claude");
export const modeSchema = z.enum(["off", "manual", "automatic"]);
export const configSchema = z
  .object({
    version: z.literal(1).default(1),
    mode: modeSchema.default("off"),
    // Applies to whichever agent is coordinating: below this share of its own allowance
    // remaining, it hands substantive work to the other agent.
    threshold: z.number().min(1).max(90).default(50),
    maxConcurrent: z.number().int().min(1).max(8).default(2),
    disconnectGraceSeconds: z.number().int().min(5).max(300).default(60),
    maxRunSeconds: z.number().int().min(10).max(28800).default(7200),
    maxSupervisionReplies: z.number().int().min(0).max(50).default(8),
    memorySharing: z.boolean().default(false),
    // An explicit list prevents a moving "best" alias selecting a paid-credit-only model.
    subscriptionModels: z
      .array(z.string().regex(/^[a-zA-Z0-9_.-]+$/))
      .default(["opus", "sonnet", "haiku"]),
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
export function remaining(limits) {
  const bucket = limits?.rateLimitsByLimitId?.codex ?? limits?.rateLimits;
  if (!bucket || (bucket.limitId && bucket.limitId !== "codex")) return null;
  const windows = [bucket.primary, bucket.secondary].filter((v) => v != null);
  if (
    !windows.length ||
    windows.some(
      (v) =>
        !Number.isFinite(v.usedPercent) ||
        v.usedPercent < 0 ||
        v.usedPercent > 100 ||
        !Number.isFinite(v.resetsAt) ||
        v.resetsAt * 1000 <= Date.now(),
    )
  )
    return null;
  return Math.min(...windows.map((v) => 100 - v.usedPercent));
}
const other = { codex: "claude", claude: "codex" };
// The primary is the agent coordinating the conversation; allowance is its own.
export function route(config, task, allowance, operation, primary = "codex") {
  const mode = config.projects[task.project] ?? config.mode;
  if (config.mode === "off" || mode === "off" || task.disabled)
    return { executor: primary, reason: "Delegation disabled" };
  const override = operation ?? task.override;
  if (override === "codex" || override === "claude")
    return { executor: override, reason: "Explicit override" };
  if (mode === "manual")
    return { executor: primary, reason: "Manual delegation only" };
  const name = primary === "codex" ? "Codex" : "Claude";
  if (allowance == null)
    return {
      executor: "unknown",
      reason: `${name} allowance unavailable; no automatic handoff`,
    };
  return {
    executor: allowance < config.threshold ? other[primary] : primary,
    reason: `${name} ${allowance}% remaining; threshold ${config.threshold}%`,
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
export function modelSelection(config, snapshot, override = {}) {
  const model = override.model ?? config.modelMap[snapshot.model];
  const effort = override.effort ?? config.effortMap[snapshot.reasoningEffort];
  if (!model || !config.subscriptionModels.includes(model))
    throw new Error(
      "No approved subscription model mapping. Configure modelMap/subscriptionModels explicitly.",
    );
  if (!["low", "medium", "high", "xhigh", "max"].includes(effort))
    throw new Error("No effort mapping for the current Codex selection.");
  return { model, effort };
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
export function subscriptionEnv(env) {
  const clean = { ...env };
  for (const key of Object.keys(clean)) {
    if (
      /^(ANTHROPIC_|CLAUDE_CODE_(USE_|OAUTH_TOKEN|API_KEY|BASE_URL|SIMPLE|SAFE_MODE|EFFORT_LEVEL|PROJECT_DIR_NAME))/.test(
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
      /^(OPENAI_|CODEX_API_KEY|CODEX_THREAD_ID|CLAUDE_CODE_SESSION_ID)/.test(key) ||
      key === "CLAUDECODE"
    )
      delete clean[key];
  return { ...clean, [delegatedMarker]: "1" };
}
// Set on every delegated worker so its own copy of this plugin never delegates back.
export const delegatedMarker = "CODEX_CLAUDE_DELEGATED";
