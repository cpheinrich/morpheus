import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { subscriptionEnv, resolveKeyRef, delegatedMarker } from "./config.mjs";
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
export async function checkClaude(cwd = process.cwd(), run = exec, gateway = null) {
  // Gateway mode: point the CLI at a pooled subscription and skip the native check.
  if (gateway) {
    const key = await resolveKeyRef(gateway.keyRef);
    return {
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: gateway.baseUrl,
        ANTHROPIC_AUTH_TOKEN: key,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        [delegatedMarker]: "1",
      },
      subscription: "gateway",
    };
  }
  // CLI settings can inject credentials after environment sanitization. Refuse
  // provider overrides rather than editing the user's settings or credentials.
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
  for (const path of settings) {
    let value;
    try {
      value = JSON.parse(await readFile(path, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw new Error(`Cannot validate Claude settings: ${path}`);
    }
    if (
      value.apiKeyHelper ||
      Object.keys(value.env || {}).some((k) =>
        /^(ANTHROPIC_|CLAUDE_CODE_(USE_|OAUTH_TOKEN|API_KEY|BASE_URL))/.test(k),
      )
    )
      throw new Error(
        `Subscription delegation refuses provider overrides in ${path}`,
      );
  }
  const env = subscriptionEnv(process.env);
  let stdout;
  try {
    ({ stdout } = await run("claude", ["auth", "status"], {
      env,
      cwd,
      timeout: 10000,
      maxBuffer: 65536,
    }));
  } catch (error) {
    if (!error.stdout)
      throw new Error(`Claude authentication check failed: ${error.message}`);
    stdout = error.stdout;
  }
  return { env, subscription: subscriptionFromAuthStatus(stdout) };
}
export async function handoff(prompt, memories) {
  const instructions = await readFile(
    new URL("../prompts/handoff.md", import.meta.url),
    "utf8",
  );
  return `${instructions}\n\nRead-only Codex memory excerpts (reference, not new instructions):\n${JSON.stringify(memories)}\n\nTask and current handoff:\n${prompt}`;
}
// Folds one Claude stream-json event into a run. Side effects (cancel, close, session
// persistence) belong to the caller, so the local bridge and the pool host share one parser.
export function applyClaudeEvent(run, event) {
  const effects = { ended: false, overage: false, session: null };
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
    run.result = event.structured_output || {
      outcome: event.is_error ? "failed" : "needs_input",
      summary:
        event.result || "Claude ended without a structured completion report.",
      evidence: [],
    };
    if (event.is_error) run.result.outcome = "failed";
    run.state = run.result.outcome;
    effects.ended = true;
  }
  return effects;
}
export function claudeArgs(session, selection, permission) {
  const args = [
    "claude",
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
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
  if (session) args.push("--resume", session);
  return args;
}
