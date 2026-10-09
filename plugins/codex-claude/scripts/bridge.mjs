#!/usr/bin/env node
import { call } from "../src/client.mjs";
import { configRead, configWrite, initStore } from "../src/store.mjs";
import { Codex } from "../src/codex.mjs";
import { checkClaude } from "../src/claude.mjs";
import { checkCodex } from "../src/codex-exec.mjs";
import { readClaudeUsage } from "../src/claude-usage.mjs";
import { claudeRemaining, home } from "../src/config.mjs";
import { atomic, readJSON } from "../src/store.mjs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
const [command = "help", ...rest] = process.argv.slice(2);
try {
  if (command === "help") {
    console.log(
      "codex-claude: doctor | config | enable manual|automatic | disable | statusline install|uninstall | inspect | start | wait | status | answer | stop | override | memories | codex.inspect | codex.start | codex.override | codex.memories\nRPC commands take a JSON object as their argument, or read JSON from stdin with -. Delegation is off until enabled.",
    );
  } else if (command === "enable" || command === "disable") {
    await initStore();
    const config = await configRead();
    config.mode = command === "disable" ? "off" : rest[0];
    await call("config", { value: config });
    console.log(JSON.stringify({ mode: config.mode }));
  } else if (command === "statusline") {
    // Claude exposes subscription usage only to its status line, so routing from a
    // Claude session needs this recorder. A prior status line keeps running through it.
    const settingsPath = join(
      process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
      "settings.json",
    );
    const chainPath = join(home(), "statusline-chain.json");
    const settings = await readJSON(settingsPath, {});
    const script = fileURLToPath(
      new URL("./claude-statusline.mjs", import.meta.url),
    );
    const ours = `node "${script}"`;
    await initStore();
    if (rest[0] === "install") {
      const current = settings.statusLine;
      if (current?.command && current.command !== ours)
        await atomic(chainPath, { command: current.command, previous: current });
      settings.statusLine = { type: "command", command: ours, padding: 0 };
    } else if (rest[0] === "uninstall") {
      const chained = await readJSON(chainPath, null);
      if (settings.statusLine?.command === ours) {
        if (chained?.previous) settings.statusLine = chained.previous;
        else delete settings.statusLine;
      }
      await rm(chainPath, { force: true });
    } else throw new Error("Use statusline install or statusline uninstall");
    await atomic(settingsPath, settings);
    console.log(JSON.stringify({ statusLine: settings.statusLine ?? null }));
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
    try {
      result.codexLogin = (await checkCodex()).subscription;
    } catch (e) {
      result.codexLoginError = e.message;
    }
    const usage = await readClaudeUsage();
    result.claudeAllowance = {
      remaining: claudeRemaining(usage),
      recordedAt: usage?.recordedAt ?? null,
    };
    result.config = await configRead();
    if (result.config.subscriptionModels)
      (result.notes ??= []).push(
        "config.subscriptionModels is deprecated and ignored: any explicit model id is passed to the Claude CLI, which decides availability. Remove the key when convenient.",
      );
    console.log(JSON.stringify(result, null, 2));
  } else {
    let input = rest.join(" ");
    if (input === "-") {
      input = "";
      for await (const b of process.stdin) input += b;
    }
    const args = input ? JSON.parse(input) : {};
    if (command.startsWith("codex.")) {
      if (!args.sessionId && process.env.CLAUDE_CODE_SESSION_ID)
        args.sessionId = process.env.CLAUDE_CODE_SESSION_ID;
    } else if (!args.threadId && process.env.CODEX_THREAD_ID)
      args.threadId = process.env.CODEX_THREAD_ID;
    console.log(JSON.stringify(await call(command, args), null, 2));
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
