// Claude Code hook: records the session's own settings and injects the routing advice.
import { configRead } from "../src/store.mjs";
import { call } from "../src/client.mjs";
import { delegatedMarker } from "../src/config.mjs";
import { transcriptModel } from "../src/claude-usage.mjs";
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
  });
  if (result.additionalContext)
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: event,
          additionalContext: result.additionalContext,
        },
      }),
    );
} catch (e) {
  process.stderr.write(`codex-claude: ${e.message}\n`);
}
