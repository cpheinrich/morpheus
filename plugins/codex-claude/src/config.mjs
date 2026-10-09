import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";

export const home = () =>
  process.env.CODEX_CLAUDE_HOME ||
  join(homedir(), ".local", "share", "codex-claude");
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
export const configSchema = z
  .object({
    version: z.literal(1).default(1),
    mode: modeSchema.default("off"),
    threshold: z.number().min(1).max(90).default(30),
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
export function route(config, task, allowance, operation) {
  const mode = config.projects[task.project] ?? config.mode;
  if (config.mode === "off" || mode === "off" || task.disabled)
    return { executor: "codex", reason: "Delegation disabled" };
  const override = operation ?? task.override;
  if (override === "codex" || override === "claude")
    return { executor: override, reason: "Explicit override" };
  if (mode === "manual")
    return { executor: "codex", reason: "Manual delegation only" };
  if (allowance == null)
    return {
      executor: "unknown",
      reason: "Codex allowance unavailable; no automatic handoff",
    };
  return {
    executor: allowance < config.threshold ? "claude" : "codex",
    reason: `${allowance}% remaining; threshold ${config.threshold}%`,
  };
}
export function modelSelection(config, snapshot, override = {}) {
  const model = override.model ?? config.modelMap[snapshot.model];
  const effort = override.effort ?? config.effortMap[snapshot.reasoningEffort];
  if (!model)
    throw new Error(
      `No Claude model mapping for Codex model "${snapshot.model ?? "unknown"}". Add it to modelMap or pass an explicit model.`,
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
  return clean;
}
