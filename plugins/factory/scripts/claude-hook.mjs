// Claude Code hook: records the session's own settings, injects the routing advice and, in
// automatic mode, dispatches the turn. PreToolUse refuses edits racing this session's worker.
import { configRead } from "../src/store.mjs";
import { call, useRunning } from "../src/client.mjs";
import { delegatedMarker } from "../src/config.mjs";
import { transcriptModel } from "../src/claude-usage.mjs";
import { claudeTurnKey } from "../src/dispatch.mjs";
import { hookOutput } from "./hook-output.mjs";
try {
  if (process.env[delegatedMarker]) process.exit(0);
  const config = await configRead();
  if (config.mode === "off") process.exit(0);
  let text = "";
  for await (const b of process.stdin) {
    text += b;
    if (text.length > 1024 * 1024) throw new Error("Hook input too large");
  }
  const input = JSON.parse(text);
  const event = input.hook_event_name || process.argv[2];
  if (!input.session_id) process.exit(0);
  if (event === "PreToolUse") {
    // A guard never starts the bridge: with no service running, no worker of this session is.
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
  const result = await call("codex.hook", {
    sessionId: input.session_id,
    event,
    cwd: input.cwd,
    permissionMode: input.permission_mode,
    model:
      (typeof input.model === "string" ? input.model : input.model?.id) ??
      (await transcriptModel(input.transcript_path)) ??
      undefined,
    effort: process.env.CLAUDE_EFFORT,
    ...(event === "UserPromptSubmit"
      ? {
          prompt: input.prompt,
          turnKey: await claudeTurnKey(input.prompt, input.transcript_path, input.prompt_id),
        }
      : {}),
  });
  hookOutput(event, result);
} catch (e) {
  process.stderr.write(`factory: ${e.message}\n`);
}
