import { z } from "zod";

const names = (prefix, methods) =>
  Object.freeze(methods.map((method) => `${prefix}_${method}`));

export const claudeMethods = Object.freeze([
  "inspect",
  "start",
  "view",
  "status",
  "wait",
  "answer",
  "stop",
  "override",
  "memories",
]);

export const codexMethods = Object.freeze([
  "inspect",
  "start",
  "view",
  "status",
  "wait",
  "answer",
  "stop",
  "override",
  "memories",
]);

export const factoryMethods = Object.freeze([
  "inspect",
  "delegate",
  "status",
  "wait",
  "answer",
  "stop",
]);

const provider = z.enum(["codex", "claude"]).optional();
const run = { runId: z.string().uuid() };
export const factorySpecs = Object.freeze({
  inspect: [
    "Inspect the Factory's pinned worker, current availability, quota and active runs for this root session. Call before delegating; root identity is injected by the plugin.",
    { provider, placement: z.enum(["local", "fleet"]).optional(), cwd: z.string().optional() },
  ],
  delegate: [
    "Delegate one bounded, self-contained brief through the Factory. The root remains manager and verifier. You MUST call this when the user explicitly requests Factory delegation, MUST NOT call it when the user requests local work, and otherwise use your normal sub-agent judgment. The first successful primary delegation pins provider and gateway for this root session. One primary worker conversation serves the whole task across repositories: name every repository it may write with cwd (its working directory on the first delegation) and repos; later delegations may add repositories and keep the same conversation. Each target resolves to a checkout this task owns: a repository it already maps, an unowned linked worktree (adopted), or, for an original checkout, an isolated worktree created at its committed HEAD (uncommitted edits are not copied; the original is reference only). Another task's checkout is refused. fresh=true creates an isolated non-primary conversation with its own checkouts on that same binding.",
    {
      prompt: z.string().min(1).max(200000),
      placement: z.enum(["local", "fleet"]).optional().describe("Opt into the configured fleet for this checkout. Omitted uses the ordinary local route."),
      messageId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/).optional().describe("Stable submission ID for retrying the same fleet brief."),
      runId: z.string().uuid().optional(),
      replySource: z.enum(["root", "user"]).optional(),
      replyReason: z.string().min(1).optional(),
      cwd: z.string().optional(),
      repos: z
        .array(z.string().min(1))
        .max(16)
        .optional()
        .describe("Additional repository checkouts or original repositories this conversation may write; each resolves to a task-owned checkout."),
      provider,
      model: z.string().optional().describe("Use the model explicitly requested by the user. Also specify its provider for model IDs outside the usual Claude or Codex naming conventions."),
      speed: z.enum(["standard", "fast"]).optional().describe("Defaults to Standard. Request Fast only with explicit user authorization."),
      effort: z.enum(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]).optional(),
      background: z.boolean().default(false),
      fresh: z.boolean().default(false),
    },
  ],
  status: ["Read one delegated run owned by this root session.", run],
  wait: [
    "Wait up to 25 seconds for an owned run's progress, question or completion and renew its owner lease.",
    { ...run, seconds: z.number().min(0).max(30).default(25) },
  ],
  answer: [
    "Answer an owned worker's live clarification. Root may resolve only a routine reversible clarification; actual tool permission requires the user's explicit approval.",
    {
      ...run,
      questionId: z.string(),
      source: z.enum(["root", "user"]),
      reason: z.string().min(1),
      answers: z.record(z.string(), z.string()).optional(),
      allow: z.boolean().default(true),
    },
  ],
  stop: ["Stop an owned run and retain its saved primary conversation for resumption.", run],
});

export const factoryMcpToolNames = names("factory", factoryMethods);

export const codexMcpToolNames = Object.freeze([
  "factory_remote",
  ...factoryMcpToolNames,
  ...names("claude", claudeMethods),
]);

export const claudeMcpToolNames = Object.freeze([
  ...factoryMcpToolNames,
  ...names("codex", codexMethods),
]);
