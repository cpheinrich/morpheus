#!/usr/bin/env node
import { call } from "../src/client.mjs";
import { configRead, configWrite, initStore } from "../src/store.mjs";
import { Codex } from "../src/codex.mjs";
import { checkClaude } from "../src/claude.mjs";
import { checkCodex } from "../src/codex-exec.mjs";
import { readClaudeUsage } from "../src/claude-usage.mjs";
import {
  claudeRemaining,
  home,
  delegatedMarker,
  readGatewayQuota,
  resolveAdminCredentials,
  resolveKeyRef,
} from "../src/config.mjs";
import { loadPool, hostEntry, bindingDigest } from "../src/pool-config.mjs";
import { atomic, readJSON } from "../src/store.mjs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
const [command = "help", ...rest] = process.argv.slice(2);
try {
  if (command === "help") {
    console.log(
      "factory: doctor | config | enable manual|automatic | disable | statusline install|uninstall | inspect | start | wait | status | answer | stop | override | memories | codex.inspect | codex.start | codex.wait | codex.status | codex.stop | codex.view | codex.override | codex.memories | pool.profiles | pool.start | pool.status | pool.wait | pool.logs | pool.answer | pool.followup | pool.stop | pool.reattach | pool.recover | pool.reconcile | pool-host-entry PROFILE | pool-agent-config PROFILE\nRPC commands take a JSON object as their argument, or read JSON from stdin with -. Delegation is off until enabled.",
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
  } else if (command === "pool-host-entry" || command === "pool-agent-config") {
    // Print exactly what the operator stages on the host or registers in Paperclip.
    const pool = await loadPool();
    const profile = pool.profiles[rest[0]];
    if (!profile) throw new Error("Unknown pool profile");
    if (command === "pool-host-entry")
      console.log(JSON.stringify({ [rest[0]]: hostEntry(rest[0], profile) }, null, 2));
    else
      console.log(JSON.stringify({
        name: `pool-${rest[0]}`,
        adapterType: "process",
        adapterConfig: {
          command: process.execPath,
          args: [fileURLToPath(new URL("./pool-runner.mjs", import.meta.url))],
          cwd: home(),
          env: { FACTORY_HOME: home() },
          timeoutSec: 0,
          graceSec: 20,
        },
        runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: true, maxConcurrentRuns: 1 } },
        metadata: { factoryPool: { profile: rest[0], bindingSha256: bindingDigest(rest[0], profile) } },
      }, null, 2));
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
    if (result.config.gateways.length) {
      // What routing will see: each gateway's quota through the configured admin
      // credentials, and whether each key reference resolves. Values never appear;
      // only the reference, whether it resolved, and the error text otherwise.
      const admin = await resolveAdminCredentials(result.config);
      const quota = await readGatewayQuota(result.config.gateways, admin);
      result.gateways = await Promise.all(
        quota.map(async (g) => {
          const entry = {
            name: g.name,
            provider: g.provider,
            baseUrl: g.baseUrl,
            usedPercent: g.usedPercent,
            belowThreshold: g.usedPercent != null && g.usedPercent < result.config.threshold,
            keyRef: g.keyRef,
          };
          if (g.error) entry.quotaError = g.error;
          try {
            await resolveKeyRef(g.keyRef);
            entry.keyResolves = true;
          } catch (e) {
            entry.keyResolves = false;
            entry.keyError = e.message;
          }
          return entry;
        }),
      );
      result.gatewayAdmin = { source: admin.source };
      if (admin.error) result.gatewayAdmin.error = admin.error;
      if (admin.source === "missing")
        (result.notes ??= []).push(
          "Gateways are configured but no admin login is available: set config.admin to {emailRef, passwordRef} references, or export FACTORY_ADMIN_EMAIL and FACTORY_ADMIN_PASSWORD where the bridge service starts. Without it every gateway's quota is unknown and routing stays native.",
        );
      const claudeGateway = result.config.gateways.some((g) => g.provider === "claude");
      if (result.claudeError && claudeGateway)
        (result.notes ??= []).push(
          "claudeError concerns native Claude delegation only. A Claude gateway needs no claude.ai login on this host; one is in fact best avoided (see below).",
        );
      if (result.claude && claudeGateway)
        (result.notes ??= []).push(
          "This host has a saved claude.ai login and a Claude gateway. The Claude CLI was observed to keep using the saved login and fail with 401 against the gateway token; run `claude auth logout` on hosts that delegate Claude work through a gateway.",
        );
    }
    if (result.config.subscriptionModels)
      (result.notes ??= []).push(
        "config.subscriptionModels is deprecated and ignored: any explicit model id is passed to the Claude CLI, which decides availability. Remove the key when convenient.",
      );
    if (result.config.modelFallback === null)
      (result.notes ??= []).push(
        "config.modelFallback is null: delegation from a Codex model missing from modelMap is refused. Set it to a family alias such as \"opus\" to fall back instead.",
      );
    console.log(JSON.stringify(result, null, 2));
  } else {
    let input = rest.join(" ");
    if (input === "-") {
      input = "";
      for await (const b of process.stdin) input += b;
    }
    const args = input ? JSON.parse(input) : {};
    if (
      process.env[delegatedMarker] &&
      (["start", "codex.start", "pool.start", "pool.followup", "pool.answer", "pool.recover"].includes(command) ||
        (command === "pool.reattach" && args.retry === true))
    )
      throw new Error("Delegated workers cannot delegate again.");
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
