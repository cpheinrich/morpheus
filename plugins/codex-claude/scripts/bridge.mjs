#!/usr/bin/env node
import { call } from "../src/client.mjs";
import { configRead, configWrite, initStore } from "../src/store.mjs";
import { Codex } from "../src/codex.mjs";
import { checkClaude } from "../src/claude.mjs";
const [command = "help", ...rest] = process.argv.slice(2);
try {
  if (command === "help") {
    console.log(
      "codex-claude: doctor | config | enable manual|automatic | disable | inspect | start | wait | status | answer | stop | override | memories\nRPC commands take a JSON object as their argument, or read JSON from stdin with -. Delegation is off until enabled.",
    );
  } else if (command === "enable" || command === "disable") {
    await initStore();
    const config = await configRead();
    config.mode = command === "disable" ? "off" : rest[0];
    await call("config", { value: config });
    console.log(JSON.stringify({ mode: config.mode }));
  } else if (command === "doctor") {
    const result = { platform: process.platform, node: process.version };
    let c;
    try {
      c = await new Codex().connect();
      result.codex = true;
      if (process.env.CODEX_THREAD_ID) {
        const s = await c.snapshot(process.env.CODEX_THREAD_ID);
        result.task = {
          cwd: s.cwd,
          model: s.model,
          effort: s.reasoningEffort,
          settingsSource: s.settingsSource || "live",
        };
      }
    } catch (e) {
      result.codexError = e.message;
    } finally {
      c?.close();
    }
    try {
      result.claude = (await checkClaude()).subscription;
    } catch (e) {
      result.claudeError = e.message;
    }
    result.config = await configRead();
    console.log(JSON.stringify(result, null, 2));
  } else {
    let input = rest.join(" ");
    if (input === "-") {
      input = "";
      for await (const b of process.stdin) input += b;
    }
    const args = input ? JSON.parse(input) : {};
    if (!args.threadId && process.env.CODEX_THREAD_ID)
      args.threadId = process.env.CODEX_THREAD_ID;
    console.log(JSON.stringify(await call(command, args), null, 2));
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
