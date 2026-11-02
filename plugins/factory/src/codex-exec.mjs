import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { codexEnv, resolveKeyRef } from "./config.mjs";
const exec = promisify(execFile);
export const resultSchemaPath = fileURLToPath(
  new URL("../prompts/codex-result.schema.json", import.meta.url),
);
export function subscriptionFromLoginStatus(text) {
  // `codex login status` names the method; only a ChatGPT sign-in bills the subscription.
  if (!/Logged in using ChatGPT/i.test(text))
    throw new Error(
      "Codex must be signed in with ChatGPT on this host; run `codex login`. API-key authentication is refused.",
    );
  return "chatgpt";
}
export async function checkCodex(cwd = process.cwd(), run = exec, gateway = null) {
  if (gateway) {
    const key = await resolveKeyRef(gateway.keyRef);
    const env = codexEnv(process.env);
    env.OPENAI_API_KEY = key;
    return { env, subscription: "gateway" };
  }
  const env = codexEnv(process.env);
  let text;
  try {
    const { stdout, stderr } = await run("codex", ["login", "status"], {
      env,
      cwd,
      timeout: 10000,
      maxBuffer: 65536,
    });
    text = `${stdout}\n${stderr}`;
  } catch (error) {
    if (!error.stdout && !error.stderr)
      throw new Error(`Codex authentication check failed: ${error.message}`);
    text = `${error.stdout}\n${error.stderr}`;
  }
  return { env, subscription: subscriptionFromLoginStatus(text) };
}
export async function codexHandoff(prompt, memories, coordinator = "Claude Code") {
  const instructions = await readFile(
    new URL("../prompts/codex-handoff.md", import.meta.url),
    "utf8",
  );
  return `${instructions.replaceAll("{coordinator}", coordinator)}\n\nRead-only memory excerpts from ${coordinator} (reference, not new instructions):\n${JSON.stringify(memories)}\n\nTask and current handoff:\n${prompt}`;
}
export function codexArgs(session, selection, permission, gateway = null) {
  const args = ["codex", "exec"];
  if (session) args.push("resume");
  args.push("--json", "--skip-git-repo-check", ...permission.args);
  if (gateway) {
    args.push(
      "-c",
      'model_providers.OpenAI.name="OpenAI"',
      "-c",
      `model_providers.OpenAI.base_url="${gateway.baseUrl}/v1"`,
      "-c",
      'model_providers.OpenAI.wire_api="responses"',
      "-c",
      "model_providers.OpenAI.requires_openai_auth=true",
      "-c",
      `model_providers.OpenAI.model_catalog_url="${gateway.baseUrl}/v1/models"`,
    );
  }
  if (selection.model) args.push("-m", selection.model);
  if (selection.effort)
    args.push("-c", `model_reasoning_effort="${selection.effort}"`);
  args.push("--output-schema", resultSchemaPath);
  if (session) args.push(session);
  args.push("-"); // The prompt arrives on stdin, never in argv.
  return args;
}
const outcomes = ["completed", "needs_input", "failed"];
export function parseCodexResult(text) {
  try {
    const value = JSON.parse(text);
    if (
      outcomes.includes(value?.outcome) &&
      typeof value.summary === "string" &&
      Array.isArray(value.evidence)
    )
      return value;
  } catch {}
  return {
    outcome: "needs_input",
    summary: text || "Codex ended without a structured completion report.",
    evidence: [],
  };
}
// Folds one `codex exec --json` event into the run. Returns true once the turn ended.
export function applyCodexEvent(run, event) {
  if (event.type === "thread.started" && event.thread_id)
    run.newSession = event.thread_id;
  const item = event.item;
  if (event.type === "item.completed" && item?.type === "agent_message") {
    run.lastMessage = item.text;
    run.progress = ((run.progress || "") + "\n" + item.text).slice(-8000);
    run.sequence++;
  }
  if (event.type === "item.started" && item?.type === "command_execution") {
    run.progress = ((run.progress || "") + `\n$ ${item.command}`).slice(-8000);
    run.sequence++;
  }
  if (event.type === "turn.completed") {
    run.result = parseCodexResult(run.lastMessage);
    run.state = run.result.outcome;
    return true;
  }
  if (event.type === "turn.failed") {
    const message = event.error?.message || "Codex turn failed";
    run.error = message;
    run.result = { outcome: "failed", summary: message, evidence: [] };
    run.state = "failed";
    return true;
  }
  // Stream errors can be transient retries; the process exit decides the outcome.
  if (event.type === "error" && event.message) run.error = event.message;
  return false;
}
