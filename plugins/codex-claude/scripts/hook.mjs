import { configRead } from "../src/store.mjs";
import { call } from "../src/client.mjs";
try {
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
  const result = await call("hook", { threadId, event });
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
