// Claude Code hook: records the session's own settings and refuses edits racing this session's
// worker. User turns are never dispatched by a hook; the root model chooses factory_delegate.
import { configRead } from "../src/store.mjs";
import { call, useRunning } from "../src/client.mjs";
import { delegatedMarker } from "../src/config.mjs";
import { transcriptModel, transcriptPermissionMode } from "../src/claude-usage.mjs";
import { hookOutput } from "./hook-output.mjs";
async function readHookInput() {
  let text = "";
  for await (const b of process.stdin) {
    text += b;
    if (text.length > 1024 * 1024) throw new Error("Hook input too large");
  }
  return JSON.parse(text);
}
// A guard never starts the bridge: with no service running, no worker of this session is.
async function guardEdit(input, event) {
  const live = await useRunning("codex.hook", {
    sessionId: input.session_id,
    event,
    cwd: input.cwd,
    tool: input.tool_name,
    toolInput: input.tool_input,
  });
  if (live.found && live.result.deny) {
    process.stderr.write(`${live.result.deny}\n`);
    process.exit(2);
  }
  process.exit(0);
}
// The session's own settings: the hook payload first, else its transcript.
async function sessionSettings(input) {
  const permissionMode =
    input.permission_mode ??
    (await transcriptPermissionMode(input.transcript_path)) ??
    undefined;
  const model =
    (typeof input.model === "string" ? input.model : input.model?.id) ??
    (await transcriptModel(input.transcript_path)) ??
    undefined;
  return { permissionMode, model };
}
try {
  if (process.env[delegatedMarker]) process.exit(0);
  const config = await configRead();
  if (config.mode === "off") process.exit(0);
  const input = await readHookInput();
  const event = input.hook_event_name || process.argv[2];
  if (!input.session_id) process.exit(0);
  if (event === "PreToolUse") await guardEdit(input, event);
  const { permissionMode, model } = await sessionSettings(input);
  const result = await call("codex.hook", {
    sessionId: input.session_id,
    event,
    cwd: input.cwd,
    permissionMode,
    model,
    effort: process.env.CLAUDE_EFFORT,
  });
  hookOutput(event, result);
} catch (e) {
  process.stderr.write(`factory: ${e.message}\n`);
}
