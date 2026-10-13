import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { subscriptionEnv } from "./config.mjs";
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
export async function checkClaude(cwd = process.cwd(), run = exec) {
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
