import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  agentPlist, disableWatchdog, enableWatchdog, readWatchdogConfig, refreshWatchdog, watchdogNudge, watchdogPaths, watchdogStatus,
  WATCHDOG_INTERVAL_SECONDS, WATCHDOG_LABEL, type AgentDeps,
} from "../src/simulator/agent.js";
import type { Exec } from "../src/simulator/watchdog.js";

const NOW = new Date("2026-10-07T06:00:00Z");
const BIN = "/opt/homebrew/bin/morpheus";
const NODE = "/opt/homebrew/bin/node";

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), "morpheus-agent-")); });
afterEach(() => rmSync(home, { recursive: true, force: true }));

/** A scripted launchd: remembers whether the label is loaded and records every launchctl call. */
function fakeLaunchd(opts: { loaded?: boolean; bootstrapFails?: string; simctl?: boolean } = {}) {
  const state = { loaded: opts.loaded ?? false };
  const calls: string[][] = [];
  const run: Exec = (command, args) => {
    calls.push([command, ...args]);
    if (command === "xcrun") {
      if (opts.simctl === false) throw new Error("xcrun: error: unable to find utility \"simctl\"");
      return "/Applications/Xcode.app/.../simctl";
    }
    if (command !== "launchctl") throw new Error(`unexpected ${command}`);
    if (args[0] === "print") { if (!state.loaded) throw new Error("Could not find service"); return "state = running"; }
    if (args[0] === "bootout") { state.loaded = false; return ""; }
    if (args[0] === "bootstrap") {
      if (opts.bootstrapFails) throw Object.assign(new Error("failed"), { stderr: Buffer.from(opts.bootstrapFails) });
      state.loaded = true;
      return "";
    }
    throw new Error(`unscripted launchctl ${args.join(" ")}`);
  };
  return { run, calls, state, launchctl: () => calls.filter((c) => c[0] === "launchctl").map((c) => c.slice(1).join(" ")) };
}

const deps = (launchd: ReturnType<typeof fakeLaunchd>, extra: Partial<AgentDeps> = {}): AgentDeps => ({
  paths: watchdogPaths(home), run: launchd.run, findBinary: async () => BIN, platform: "darwin", uid: 501, node: NODE, now: NOW, ...extra,
});

const config = (): Record<string, unknown> => JSON.parse(readFileSync(watchdogPaths(home).config, "utf8"));

describe("agentPlist", () => {
  it("runs the installed CLI's quiet sweep every thirty minutes, at load too", () => {
    const plist = agentPlist({ binary: BIN, node: NODE, log: "/Users/me/Library/Logs/morpheus/simulator-watchdog.log" });
    expect(plist).toContain(`<key>Label</key><string>${WATCHDOG_LABEL}</string>`);
    expect(plist).toContain(`<array><string>${BIN}</string><string>simulator</string><string>watchdog</string><string>run</string><string>--quiet</string></array>`);
    expect(plist).toContain("<key>StartInterval</key><integer>1800</integer>");
    expect(WATCHDOG_INTERVAL_SECONDS).toBe(1800);
    expect(plist).toContain("<key>RunAtLoad</key><true/>");
    expect(plist).toContain("<string>/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>");
  });

  it("does not carry the idle threshold, so changing it never rewrites the agent", () => {
    expect(agentPlist({ binary: BIN, node: NODE, log: "/l" })).not.toMatch(/idle|hours/i);
  });

  it("escapes what XML would otherwise misread in a path", () => {
    const plist = agentPlist({ binary: "/Users/a&b/<bin>/morpheus", node: NODE, log: "/l" });
    expect(plist).toContain("/Users/a&amp;b/&lt;bin&gt;/morpheus");
    expect(plist).not.toContain("a&b");
  });
});

describe("readWatchdogConfig", () => {
  const write = (content: string) => { const p = watchdogPaths(home); mkdirSync(join(p.config, ".."), { recursive: true }); writeFileSync(p.config, content); return p.config; };

  it("reads an absent file as unconfigured, with the default threshold", async () => {
    expect(await readWatchdogConfig(watchdogPaths(home).config)).toMatchObject({ preference: "unconfigured", idleHours: 24 });
  });

  it("reads enabled and disabled, and a custom threshold", async () => {
    expect(await readWatchdogConfig(write(JSON.stringify({ schema: 1, enabled: true, changedAt: "x" })))).toMatchObject({ preference: "enabled", idleHours: 24 });
    expect(await readWatchdogConfig(write(JSON.stringify({ schema: 1, enabled: false, idleHours: 12, changedAt: "x" })))).toMatchObject({ preference: "disabled", idleHours: 12 });
  });

  it.each([
    ["not JSON", "{nope"],
    ["wrong schema", JSON.stringify({ schema: 2, enabled: true, changedAt: "x" })],
    ["non-boolean enabled", JSON.stringify({ schema: 1, enabled: "yes", changedAt: "x" })],
    ["a zero threshold, which would shut down everything on every sweep", JSON.stringify({ schema: 1, enabled: true, idleHours: 0, changedAt: "x" })],
  ])("diagnoses %s as invalid rather than overwriting it", async (_why, content) => {
    expect(await readWatchdogConfig(write(content))).toMatchObject({ preference: "invalid", idleHours: 24 });
  });
});

describe("enableWatchdog", () => {
  it("records the choice, writes the agent and loads it", async () => {
    const launchd = fakeLaunchd();
    const change = await enableWatchdog(deps(launchd));
    expect(change).toMatchObject({ agent: "installed", warnings: [], config: { preference: "enabled", idleHours: 24 } });
    expect(config()).toEqual({ schema: 1, enabled: true, changedAt: NOW.toISOString() });
    const plist = watchdogPaths(home).plist;
    expect(readFileSync(plist, "utf8")).toBe(agentPlist({ binary: BIN, node: NODE, log: watchdogPaths(home).log }));
    expect(launchd.launchctl()).toEqual([`print gui/501/${WATCHDOG_LABEL}`, `bootstrap gui/501 ${plist}`]);
  });

  it("is idempotent: a second enable changes nothing and does not touch launchd", async () => {
    const launchd = fakeLaunchd();
    await enableWatchdog(deps(launchd));
    launchd.calls.length = 0;
    expect((await enableWatchdog(deps(launchd))).agent).toBe("current");
    expect(launchd.launchctl()).toEqual([`print gui/501/${WATCHDOG_LABEL}`]);
  });

  it("replaces an agent that points at a different binary, unloading the old one first", async () => {
    const launchd = fakeLaunchd();
    await enableWatchdog(deps(launchd));
    launchd.calls.length = 0;
    const change = await enableWatchdog(deps(launchd, { findBinary: async () => "/usr/local/bin/morpheus" }));
    expect(change.agent).toBe("updated");
    expect(launchd.launchctl()).toEqual([`print gui/501/${WATCHDOG_LABEL}`, `bootout gui/501/${WATCHDOG_LABEL}`, `bootstrap gui/501 ${watchdogPaths(home).plist}`]);
    expect(readFileSync(watchdogPaths(home).plist, "utf8")).toContain("/usr/local/bin/morpheus");
  });

  it("loads a current agent that is on disk but not loaded, e.g. after a bootout", async () => {
    const launchd = fakeLaunchd();
    await enableWatchdog(deps(launchd));
    launchd.state.loaded = false;
    expect((await enableWatchdog(deps(launchd))).agent).toBe("loaded");
    expect(launchd.state.loaded).toBe(true);
  });

  it("keeps the agent on disk and says so when launchd will not load it now", async () => {
    const launchd = fakeLaunchd({ bootstrapFails: "Bootstrap failed: 5: Input/output error" });
    const change = await enableWatchdog(deps(launchd));
    expect(existsSync(watchdogPaths(home).plist)).toBe(true);
    expect(change.warnings).toEqual(["launchd would not load the agent now (Bootstrap failed: 5: Input/output error); it loads at your next login."]);
    expect(change.config.preference).toBe("enabled");
  });

  it("remembers a custom threshold across enables, and drops it when set back to the default", async () => {
    const launchd = fakeLaunchd();
    await enableWatchdog({ ...deps(launchd), idleHours: 48 });
    expect(config()).toMatchObject({ enabled: true, idleHours: 48 });
    await enableWatchdog(deps(launchd));
    expect(config()).toMatchObject({ idleHours: 48 });
    await enableWatchdog({ ...deps(launchd), idleHours: 24 });
    expect(config()).not.toHaveProperty("idleHours");
  });

  it.each([
    ["not on macOS", { platform: "linux" as const }, /needs macOS and Xcode/],
    ["Xcode's simctl missing", { run: fakeLaunchd({ simctl: false }).run }, /simctl was not found/],
    ["no installed morpheus", { findBinary: async () => null }, /not on PATH/],
  ])("refuses, and writes nothing, when %s", async (_why, override, message) => {
    await expect(enableWatchdog({ ...deps(fakeLaunchd()), ...override })).rejects.toThrow(message);
    expect(existsSync(watchdogPaths(home).config)).toBe(false);
    expect(existsSync(watchdogPaths(home).plist)).toBe(false);
  });
});

describe("disableWatchdog", () => {
  it("unloads and removes the agent, and records the choice", async () => {
    const launchd = fakeLaunchd();
    await enableWatchdog(deps(launchd));
    launchd.calls.length = 0;
    const change = await disableWatchdog(deps(launchd));
    expect(change).toMatchObject({ agent: "removed", config: { preference: "disabled" } });
    expect(existsSync(watchdogPaths(home).plist)).toBe(false);
    expect(launchd.launchctl()).toContain(`bootout gui/501/${WATCHDOG_LABEL}`);
    expect(config()).toMatchObject({ enabled: false });
  });

  it("works on a Mac that never had an agent, and still records the answer", async () => {
    const change = await disableWatchdog(deps(fakeLaunchd()));
    expect(change).toMatchObject({ agent: "absent", config: { preference: "disabled" } });
  });

  it("sticks: a refresh after an update never brings it back", async () => {
    const launchd = fakeLaunchd();
    await enableWatchdog(deps(launchd));
    await disableWatchdog(deps(launchd));
    launchd.calls.length = 0;
    expect((await refreshWatchdog(deps(launchd))).agent).toBe("absent");
    expect(existsSync(watchdogPaths(home).plist)).toBe(false);
    expect(launchd.launchctl().filter((c) => c.startsWith("bootstrap"))).toEqual([]);
  });
});

describe("refreshWatchdog", () => {
  it("does nothing on a Mac that never chose, so installing Morpheus is not consent", async () => {
    const launchd = fakeLaunchd();
    const change = await refreshWatchdog(deps(launchd));
    expect(change.agent).toBe("absent");
    expect(existsSync(watchdogPaths(home).plist)).toBe(false);
    expect(launchd.launchctl()).toEqual([]);
  });

  it("does nothing on an invalid preference rather than guessing what it meant", async () => {
    const p = watchdogPaths(home);
    mkdirSync(join(p.config, ".."), { recursive: true });
    writeFileSync(p.config, "{nope");
    const launchd = fakeLaunchd();
    expect((await refreshWatchdog(deps(launchd))).agent).toBe("absent");
    expect(launchd.launchctl()).toEqual([]);
  });

  it("restores an enabled agent whose plist was deleted", async () => {
    const launchd = fakeLaunchd();
    await enableWatchdog(deps(launchd));
    rmSync(watchdogPaths(home).plist);
    launchd.state.loaded = false;
    expect((await refreshWatchdog(deps(launchd))).agent).toBe("installed");
    expect(existsSync(watchdogPaths(home).plist)).toBe(true);
  });

  it("is silent when an enabled agent is already current", async () => {
    const launchd = fakeLaunchd();
    await enableWatchdog(deps(launchd));
    expect((await refreshWatchdog(deps(launchd))).agent).toBe("current");
  });

  it("rewrites an enabled agent that an older Morpheus wrote differently", async () => {
    const launchd = fakeLaunchd();
    await enableWatchdog(deps(launchd));
    writeFileSync(watchdogPaths(home).plist, "<plist>an older agent</plist>");
    expect((await refreshWatchdog(deps(launchd))).agent).toBe("updated");
    expect(readFileSync(watchdogPaths(home).plist, "utf8")).toBe(agentPlist({ binary: BIN, node: NODE, log: watchdogPaths(home).log }));
  });

  it("leaves things as they were, with a warning, when no morpheus is on PATH", async () => {
    const launchd = fakeLaunchd();
    await enableWatchdog(deps(launchd));
    const change = await refreshWatchdog(deps(launchd, { findBinary: async () => null }));
    expect(change.warnings).toEqual(["morpheus is not on PATH, so the simulator watchdog agent was left as it was."]);
    expect(existsSync(watchdogPaths(home).plist)).toBe(true);
  });

  it("removes a stale agent when the recorded choice is disabled", async () => {
    const launchd = fakeLaunchd();
    await enableWatchdog(deps(launchd));
    writeFileSync(watchdogPaths(home).config, JSON.stringify({ schema: 1, enabled: false, changedAt: "x" }));
    expect((await refreshWatchdog(deps(launchd))).agent).toBe("removed");
  });

  it("does nothing off macOS", async () => {
    expect((await refreshWatchdog({ ...deps(fakeLaunchd()), platform: "linux" })).agent).toBe("absent");
  });
});

describe("watchdogStatus", () => {
  it("reports each state of the agent", async () => {
    const launchd = fakeLaunchd();
    expect(await watchdogStatus(deps(launchd))).toMatchObject({ plist: "missing", loaded: false, config: { preference: "unconfigured" }, binary: BIN });
    await enableWatchdog(deps(launchd));
    expect(await watchdogStatus(deps(launchd))).toMatchObject({ plist: "current", loaded: true, config: { preference: "enabled" } });
    writeFileSync(watchdogPaths(home).plist, "older");
    expect(await watchdogStatus(deps(launchd))).toMatchObject({ plist: "stale" });
  });
});

describe("watchdogNudge", () => {
  it("asks a Mac that has not decided, and names the command", async () => {
    expect(await watchdogNudge(deps(fakeLaunchd()))).toMatch(/morpheus simulator watchdog enable/);
  });

  it("never asks a Mac that decided either way, so a no stays a no", async () => {
    const launchd = fakeLaunchd();
    await enableWatchdog(deps(launchd));
    expect(await watchdogNudge(deps(launchd))).toBeNull();
    await disableWatchdog(deps(launchd));
    expect(await watchdogNudge(deps(launchd))).toBeNull();
  });

  it("stays quiet where a watchdog could not run at all", async () => {
    expect(await watchdogNudge({ ...deps(fakeLaunchd()), platform: "linux" })).toBeNull();
    expect(await watchdogNudge(deps(fakeLaunchd({ simctl: false })))).toBeNull();
  });
});
