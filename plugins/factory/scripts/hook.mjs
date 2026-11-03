// Codex hook: injects the routing advice and, in automatic mode, dispatches the turn.
// PreToolUse refuses edits racing this task's worker.
import { configRead } from "../src/store.mjs";
import { call, useRunning } from "../src/client.mjs";
import { delegatedMarker } from "../src/config.mjs";
import { codexTurnKey } from "../src/dispatch.mjs";
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
  const threadId = input.session_id || process.env.CODEX_THREAD_ID;
  if (!threadId) process.exit(0);
  if (event === "PreToolUse") {
    // A guard never starts the bridge: with no service running, no worker of this task is.
    const live = await useRunning("hook", {
      threadId,
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
  const result = await call("hook", {
    threadId,
    event,
    ...(event === "UserPromptSubmit"
      ? { prompt: input.prompt, turnKey: codexTurnKey(input.turn_id), cwd: input.cwd }
      : {}),
  });
  hookOutput(event, result);
} catch (e) {
  process.stderr.write(`factory: ${e.message}\n`);
}
