// Claude Code status line: records subscription windows for routing, then prints a
// compact line. A previously configured status line is run instead, with the same input.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { home } from "../src/config.mjs";
import { readJSON } from "../src/store.mjs";
import { recordClaudeUsage, statusText } from "../src/claude-usage.mjs";
let text = "";
for await (const b of process.stdin) {
  text += b;
  if (text.length > 1024 * 1024) break;
}
let snapshot = null;
try {
  snapshot = await recordClaudeUsage(JSON.parse(text));
} catch (e) {
  process.stderr.write(`codex-claude: ${e.message}\n`);
}
const chained = await readJSON(join(home(), "statusline-chain.json"), null).catch(
  () => null,
);
if (chained?.command) {
  const r = spawnSync("/bin/sh", ["-c", chained.command], {
    input: text,
    encoding: "utf8",
    timeout: 5000,
  });
  process.stdout.write(r.stdout || "");
} else process.stdout.write(statusText(snapshot));
