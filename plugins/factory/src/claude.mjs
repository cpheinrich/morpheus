import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { subscriptionEnv, resolveKeyRef } from "./config.mjs";
const exec = promisify(execFile);
export function subscriptionFromAuthStatus(text) {
  let auth;
  try {
    auth = JSON.parse(text);
  } catch {
    throw new Error("Claude authentication status was not valid JSON.");
  }
  if (
    !auth.loggedIn ||
    auth.authMethod !== "claude.ai" ||
    auth.apiProvider !== "firstParty"
  )
    throw new Error(
      "Claude must be signed in directly with its subscription on this host; run `claude auth login`.",
    );
  return auth.subscriptionType;
}
// CLI settings can inject credentials after environment sanitization: the user's
// and managed settings, then every .claude directory from cwd up to the root.
function claudeSettingsPaths(cwd) {
  const settings = [
    join(
      process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
      "settings.json",
    ),
    "/Library/Application Support/ClaudeCode/managed-settings.json",
  ];
  let directory = cwd;
  while (true) {
    settings.push(
      join(directory, ".claude", "settings.json"),
      join(directory, ".claude", "settings.local.json"),
    );
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return settings;
}
function overridesProvider(value) {
  return (
    value.apiKeyHelper ||
    Object.keys(value.env || {}).some((k) =>
      /^(ANTHROPIC_|CLAUDE_CODE_(USE_|OAUTH_TOKEN|API_KEY|BASE_URL))/.test(k),
    )
  );
}
// Refuse provider overrides rather than editing the user's settings or credentials.
async function refuseProviderOverrides(paths) {
  for (const path of paths) {
    let value;
    try {
      value = JSON.parse(await readFile(path, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw new Error(`Cannot validate Claude settings: ${path}`);
    }
    if (overridesProvider(value))
      throw new Error(
        `Subscription delegation refuses provider overrides in ${path}`,
      );
  }
}
async function claudeAuthStatus(run, env, cwd) {
  try {
    const { stdout } = await run("claude", ["auth", "status"], {
      env,
      cwd,
      timeout: 10000,
      maxBuffer: 65536,
    });
    return stdout;
  } catch (error) {
    if (!error.stdout)
      throw new Error(`Claude authentication check failed: ${error.message}`);
    return error.stdout;
  }
}
export async function checkClaude(cwd = process.cwd(), run = exec, gateway = null) {
  // Gateway mode: point the CLI at a pooled subscription and skip the native check.
  if (gateway) {
    const key = await resolveKeyRef(gateway.keyRef);
    const env = subscriptionEnv(process.env);
    env.ANTHROPIC_BASE_URL = gateway.baseUrl;
    env.ANTHROPIC_AUTH_TOKEN = key;
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
    return { env, subscription: "gateway" };
  }
  await refuseProviderOverrides(claudeSettingsPaths(cwd));
  const env = subscriptionEnv(process.env);
  const stdout = await claudeAuthStatus(run, env, cwd);
  return { env, subscription: subscriptionFromAuthStatus(stdout) };
}
export async function handoff(prompt, memories, coordinator = "Codex") {
  const instructions = await readFile(
    new URL("../prompts/handoff.md", import.meta.url),
    "utf8",
  );
  return `${instructions.replaceAll("{coordinator}", coordinator)}\n\nRead-only memory excerpts from ${coordinator} (reference, not new instructions):\n${JSON.stringify(memories)}\n\nTask and current handoff:\n${prompt}`;
}
// Folds one Claude stream-json event into a run. Side effects (cancel, close, session
// persistence) belong to the caller, so the local bridge and the pool host share one parser.
function applyClaudeText(run, event) {
  if (
    event.type === "stream_event" &&
    event.event?.delta?.type === "text_delta"
  ) {
    run.progress = ((run.progress || "") + event.event.delta.text).slice(
      -8000,
    );
    run.sequence++;
  }
  if (event.type === "assistant" && !run.progress) {
    run.progress = (event.message?.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .slice(-8000);
    run.sequence++;
  }
}
function applyClaudeResult(run, event) {
  run.result = event.structured_output || {
    outcome: event.is_error ? "failed" : "needs_input",
    summary:
      event.result || "Claude ended without a structured completion report.",
    evidence: [],
  };
  if (event.is_error) run.result.outcome = "failed";
  run.state = run.result.outcome;
}
export function applyClaudeEvent(run, event) {
  const effects = { ended: false, overage: false, session: null };
  applyClaudeText(run, event);
  if (
    event.type === "rate_limit_event" &&
    event.rate_limit_info?.isUsingOverage
  ) {
    run.error = "Claude reported paid overage; stopping";
    effects.overage = true;
  }
  if (event.session_id && !run.claudeSession) {
    run.claudeSession = event.session_id;
    effects.session = event.session_id;
  }
  if (event.type === "control_request") {
    run.question = { id: event.request_id, request: event.request };
    run.state = "needs_input";
  }
  if (event.type === "result") {
    applyClaudeResult(run, event);
    effects.ended = true;
  }
  return effects;
}
// Extra task-owned checkouts are added with --add-dir; the permission mode is unchanged, so
// nothing is widened (bypassPermissions was already unconfined, plan stays read-only).
export function claudeArgs(session, selection, permission, addDirs = []) {
  const args = [
    "claude",
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--settings",
    JSON.stringify(selection.speed === "fast"
      ? { fastMode: true, env: { CLAUDE_CODE_DISABLE_FAST_MODE: "0" } }
      : { env: { CLAUDE_CODE_DISABLE_FAST_MODE: "1" } }),
    "--model",
    selection.model,
    "--effort",
    selection.effort,
    "--permission-mode",
    permission,
    "--permission-prompt-tool",
    "stdio",
    "--json-schema",
    JSON.stringify({
      type: "object",
      properties: {
        outcome: {
          type: "string",
          enum: ["completed", "needs_input", "failed"],
        },
        summary: { type: "string" },
        evidence: { type: "array", items: { type: "string" } },
        question: { type: "string" },
      },
      required: ["outcome", "summary", "evidence"],
      additionalProperties: false,
    }),
  ];
  for (const dir of addDirs) args.push("--add-dir", dir);
  if (session) args.push("--resume", session);
  return args;
}
