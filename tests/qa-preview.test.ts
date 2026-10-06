import { createServer, type AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseIosPreviewConfig, expand, RESERVED_FLAGS } from "../src/qa/preview/config.js";
import {
  checkoutKey, defaultPort, launchEnvironment, launchPlist, OVERLAY_PORT_OFFSET, parsePreviewArgs,
  repairSimulatorInput, requireFreePort, selectRuntime, serveSimCli, shutdownPreview, tunnelCommand,
  withPreviewCancellation, type Runtime,
} from "../src/qa/preview/ios.js";
import { supervise } from "../src/qa/preview/supervisor.js";
import { QA_GUIDE } from "../src/qa/guide.js";
import { commentQaSkill } from "../src/init/templates.js";

/** Evo's declaration, as its morpheus.json carries it after the move. */
const EVO = {
  ios: {
    app: "apps/ios", build: ["bash", "apps/ios/scripts/dev.sh", "build"], precheck: ["bash", "apps/ios/scripts/lint.sh"],
    product: "Build/Products/Debug-iphonesimulator/Evo.app", derivedData: "/private/tmp/EvoDerivedData-{key}",
    bundleId: "evo.med.staging", device: { name: "Evo QA", type: "iPhone 17 Pro" }, namespace: "med.evo.preview",
    minimumXcode: "26.5", defaultMode: "live",
    modes: {
      live: { flags: ["--live-chat"], args: ["--qa-live"], prepare: { command: ["node", "apps/ios/scripts/chat-preview.mjs", "{key}"], credentials: true }, summary: "Mode: live." },
      fresh: { flags: ["--fresh-account"], args: ["--qa-fresh-account"], summary: "Mode: fresh account." },
      demo: { flags: ["--demo"], args: ["--ui-testing", "--demo-data", "--demo-trends-history"], summary: "Mode: demo." },
    },
  },
};

const evo = () => {
  const parsed = parseIosPreviewConfig(EVO, "Evo");
  if (!parsed.ok) throw new Error(parsed.issues.join("; "));
  return parsed.config;
};

const runtime = (version: string, extra: Partial<Runtime> = {}): Runtime => ({
  version, identifier: `com.apple.CoreSimulator.SimRuntime.iOS-${version.replaceAll(".", "-")}`, isAvailable: true,
  supportedDeviceTypes: [{ name: "iPhone 17 Pro", productFamily: "iPhone", identifier: "iphone" }], ...extra,
});

describe("qa.ios configuration", () => {
  it("accepts Evo's declaration and keeps its launchd namespace and device name", () => {
    const config = evo();
    expect(config.namespace).toBe("med.evo.preview");
    expect(config.device.name).toBe("Evo QA");
    expect(config.modes.live!.prepare).toEqual({ command: ["node", "apps/ios/scripts/chat-preview.mjs", "{key}"], credentials: true });
  });

  it("defaults what a second app need not say", () => {
    const parsed = parseIosPreviewConfig({ ios: { app: "apps/ios", build: ["bash", "x"], product: "L.app", bundleId: "com.x", modes: { demo: { args: ["-ui-testing"] } } } }, "Lakina");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.config).toMatchObject({
      namespace: "morpheus.qa.lakina", device: { name: "Lakina QA", type: "iPhone 17 Pro" },
      derivedData: "/private/tmp/LakinaDerivedData-{key}", defaultMode: "demo", minimumXcode: "26.0",
    });
  });

  it("reports every problem at once, and refuses flags the CLI or the preview already owns", () => {
    const parsed = parseIosPreviewConfig({ ios: {
      build: "dev.sh", product: "", bundleId: "x", namespace: "bad space", defaultMode: "nope",
      modes: { live: { flags: ["--port"] }, demo: { flags: ["--x"] }, other: { flags: ["--x"] } },
    } }, "P");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const all = parsed.issues.join("\n");
    for (const fragment of ["qa.ios.app", "qa.ios.product", "qa.ios.build", "namespace", "--port is reserved", "--x selects both", "defaultMode"]) {
      expect(all).toContain(fragment);
    }
    expect(RESERVED_FLAGS.has("--name")).toBe(true);
  });

  it("says plainly when a project has not declared an app", () => {
    const parsed = parseIosPreviewConfig(undefined, "P");
    expect(parsed).toEqual({ ok: false, issues: [expect.stringContaining("no qa.ios block")] });
  });

  it("expands the checkout key and root in commands and paths", () => {
    expect(expand("/private/tmp/EvoDerivedData-{key}", { key: "abc", root: "/r" })).toBe("/private/tmp/EvoDerivedData-abc");
    expect(expand("{root}/x/{key}", { key: "k", root: "/r" })).toBe("/r/x/k");
  });
});

describe("preview arguments", () => {
  const modes = evo().modes;
  it("builds locally by default; reuse is explicit and the port is optional", () => {
    expect(parsePreviewArgs([], modes)).toEqual({ command: "start", build: true });
    expect(parsePreviewArgs(["start", "--no-build", "--port", "3210"], modes)).toEqual({ command: "start", build: false, port: 3210 });
    expect(parsePreviewArgs(["status", "--ssh-host", "user@mac.tailnet.ts.net"], modes).sshHost).toBe("user@mac.tailnet.ts.net");
  });

  it("selects a mode by its declared flag, by --mode, or not at all", () => {
    expect(parsePreviewArgs(["start", "--demo"], modes).mode).toBe("demo");
    expect(parsePreviewArgs(["start", "--fresh-account"], modes).mode).toBe("fresh");
    expect(parsePreviewArgs(["start", "--live-chat"], modes).mode).toBe("live");
    expect(parsePreviewArgs(["start", "--mode", "demo"], modes).mode).toBe("demo");
    expect(parsePreviewArgs(["start"], modes).mode).toBeUndefined();
    expect(() => parsePreviewArgs(["--mode", "nope"], modes)).toThrow(/Unknown mode/);
  });

  it("rejects malformed commands, missing values, unsafe hosts and ports the overlay could not follow", () => {
    for (const args of [["erase"], ["--port"], ["--port", "0"], ["--port", "1023"], ["--port", "65536"], ["--port", String(65536 - OVERLAY_PORT_OFFSET)],
      ["--port", "3200junk"], ["--port", "3.2"], ["--ssh-host", "-oProxyCommand=bad"], ["--ssh-host", "host;id"], ["--ttl-minutes", "0"], ["--ttl-minutes", "1441"], ["--unknown"]]) {
      expect(() => parsePreviewArgs(args, modes), args.join(" ")).toThrow();
    }
    expect(parsePreviewArgs(["--port", "1024"], modes).port).toBe(1024);
    expect(parsePreviewArgs(["--port", String(65535 - OVERLAY_PORT_OFFSET)], modes).port).toBe(65535 - OVERLAY_PORT_OFFSET);
  });
});

describe("checkout identity and ports", () => {
  it("keys a checkout exactly as Evo's script did, so its running previews stay addressable", async () => {
    const { createHash } = await import("node:crypto");
    const legacy = createHash("sha256").update("/Users/x/code/evo/apps/ios").digest("hex").slice(0, 12);
    expect(checkoutKey("/Users/x/code/evo", { app: "apps/ios" })).toBe(legacy);
  });

  it("spreads default ports so two projects do not collide, and puts the overlay a fixed step above", () => {
    expect(defaultPort("000000000000")).toBe(3200);
    expect(defaultPort("00ff00000000")).toBe(3455);
    expect(defaultPort("abcdef012345")).not.toBe(defaultPort("123456789abc"));
    expect(defaultPort("ffffffffffff") + OVERLAY_PORT_OFFSET).toBeLessThanOrEqual(3711);
  });
});

describe("simulator lifecycle helpers", () => {
  it("selects the newest available iOS numerically, never an unavailable, watchOS or old runtime", () => {
    expect(selectRuntime([runtime("26.9"), runtime("26.10"), runtime("27.0", { isAvailable: false }), runtime("99.0", { identifier: "com.apple.CoreSimulator.SimRuntime.watchOS-99" })]).version).toBe("26.10");
    expect(() => selectRuntime([runtime("18.5"), runtime("26.5", { isAvailable: false })])).toThrow(/Install one in Xcode/);
    expect(() => selectRuntime([runtime("26.5", { supportedDeviceTypes: [] })])).toThrow(/no supported iPhone/);
  });

  it("writes launchd arguments that preserve spaces and XML metacharacters, without a shell or keep-alive", () => {
    const value = launchPlist({ label: "med.evo.preview.123", args: ["/path with space/node", "/a&b/<cli>.js", "udid"], cwd: "/repo", log: "/log", env: { PATH: "/bin:/a&b", HOME: "/Users/test" } });
    expect(value).toMatch(/<array><string>\/path with space\/node<\/string><string>\/a&amp;b\/&lt;cli&gt;\.js<\/string><string>udid<\/string><\/array>/);
    expect(value).toMatch(/<key>RunAtLoad<\/key><true\/>/);
    expect(value).not.toMatch(/KeepAlive|sh -c|<key>StartInterval/);
  });

  it("tunnels only the overlay, bound to the viewer's loopback, failing if forwarding cannot start", () => {
    expect(tunnelCommand("user@host", 3466)).toBe("ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 127.0.0.1:3466:127.0.0.1:3466 user@host");
  });

  it("refuses an occupied port without terminating the service holding it", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const { port } = server.address() as AddressInfo;
    try {
      await expect(requireFreePort(port)).rejects.toThrow(/occupied/);
      expect(server.listening).toBe(true);
    } finally { await new Promise((resolve) => server.close(resolve)); }
    await requireFreePort(port);
  });

  it("repairs Xcode 27 input through the foreground backboard service", () => {
    const calls: [string, string[]][] = [];
    const repaired = repairSimulatorInput("synthetic-udid", (command, args) => { calls.push([command, args]); return calls.length === 1 ? "com.apple.coredevice.dtuhidd.active 1" : ""; });
    expect(repaired).toBe(true);
    expect(calls).toEqual([
      ["xcrun", ["simctl", "spawn", "synthetic-udid", "notifyutil", "-g", "com.apple.coredevice.dtuhidd.active"]],
      ["xcrun", ["simctl", "spawn", "synthetic-udid", "notifyutil", "-s", "com.apple.coredevice.dtuhidd.active", "0"]],
      ["xcrun", ["simctl", "spawn", "synthetic-udid", "launchctl", "kickstart", "-k", "user/foreground/com.apple.backboardd"]],
    ]);
  });

  it("leaves simulator input alone when Device Hub is not shadowing it", () => {
    const calls: unknown[] = [];
    expect(repairSimulatorInput("synthetic-udid", (c, a) => { calls.push([c, a]); return "com.apple.coredevice.dtuhidd.active 0"; })).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("shuts down only a simulator whose name proves this checkout owns it", () => {
    const devices = (name: string, state = "Booted") => JSON.stringify({ devices: { ios: [{ udid: "U", name, state }] } });
    const calls: string[][] = [];
    const sim = (list: string) => (...args: string[]) => { calls.push(args); return args[0] === "list" ? list : ""; };
    shutdownPreview({ udid: "U", name: "Evo QA abc" }, "Evo QA abc", sim(devices("Evo QA abc")));
    expect(calls.at(-1)).toEqual(["shutdown", "U"]);
    expect(() => shutdownPreview({ udid: "U", name: "Evo QA abc" }, "Evo QA abc", sim(devices("Someone's iPhone")))).toThrow(/not owned/);
    expect(() => shutdownPreview({ udid: "U", name: "Lakina QA abc" }, "Evo QA abc", sim(devices("Lakina QA abc")))).toThrow(/not owned/);
    calls.length = 0;
    shutdownPreview({ udid: "U", name: "Evo QA abc" }, "Evo QA abc", sim(devices("Evo QA abc", "Shutdown")));
    expect(calls.some((c) => c[0] === "shutdown")).toBe(false);
  });
});

describe("live-mode credentials", () => {
  it("passes a prepare command's environment to the app only, prefixed for simctl", () => {
    expect(launchEnvironment(JSON.stringify({ env: { EVO_QA_UID: "evo-qa-012345abcdef", EVO_QA_CUSTOM_TOKEN: "t" } }))).toEqual({
      SIMCTL_CHILD_EVO_QA_UID: "evo-qa-012345abcdef", SIMCTL_CHILD_EVO_QA_CUSTOM_TOKEN: "t",
    });
  });

  it("refuses anything but string environment entries with variable-shaped names", () => {
    for (const out of ["not json", "{}", '{"env": []}', '{"env": {"lower": "x"}}', '{"env": {"A": 1}}', '{"env": {"A": ""}}', '{"env": {"A;B": "x"}}']) {
      expect(() => launchEnvironment(out), out).toThrow();
    }
  });
});

describe("cancellation and supervision", () => {
  it("records a signal as intent, finishes the current step, then cleans up and fails", async () => {
    const signals = new EventEmitter();
    let cleaned = false;
    const run = withPreviewCancellation(async (check) => { signals.emit("SIGINT"); await Promise.resolve(); check(); return 1; }, async () => { cleaned = true; }, signals);
    await expect(run).rejects.toThrow(/interrupted/);
    expect(cleaned).toBe(true);
    expect(signals.listenerCount("SIGINT")).toBe(0);
  });

  it("stops serve-sim at expiry and cleans up once, reporting a clean exit", async () => {
    const child = new EventEmitter() as EventEmitter & { kill: (s: string) => void };
    const kills: string[] = [];
    child.kill = (s) => { kills.push(s); if (s === "SIGTERM") setTimeout(() => child.emit("exit", null), 5); };
    let cleanups = 0;
    const code = await supervise(child as never, { expired: () => true, cleanup: () => { cleanups += 1; }, interval: 5, grace: 1000, signals: new EventEmitter() });
    expect(code).toBe(0);
    expect(kills).toEqual(["SIGTERM"]);
    expect(cleanups).toBe(1);
  });
});

describe("serve-sim and the guide", () => {
  it("ships the pinned serve-sim with the CLI", () => {
    const cli = serveSimCli();
    expect(cli.version).toBe("0.1.47");
    expect(cli.path).toMatch(/serve-sim[\\/]dist[\\/]serve-sim\.js$/);
  });

  it("tells every agent to open the same overlay, and how", () => {
    expect(QA_GUIDE).toContain("Claude: the Browser pane");
    expect(QA_GUIDE).toContain("Codex: the in-app browser panel");
    expect(QA_GUIDE).toContain("Grok, or any agent without a browser panel: `open <url>`");
    expect(QA_GUIDE).toMatch(/never the stream URL/);
    expect(QA_GUIDE).toMatch(/127\.0\.0\.1/);
    expect(QA_GUIDE).not.toMatch(/\bEvo\b|\bLakina\b/);
  });

  it("keeps both repository copies of the skill identical to the template init writes", async () => {
    for (const dir of [".agents", ".claude"]) {
      expect(await readFile(join(import.meta.dirname, "..", dir, "skills/comment-qa/SKILL.md"), "utf8")).toBe(commentQaSkill());
    }
    expect(commentQaSkill()).toContain("morpheus qa guide");
    expect(commentQaSkill()).toContain("morpheus qa preview ios help");
    expect(QA_GUIDE).toContain("morpheus qa preview ios help");
    expect(QA_GUIDE).not.toContain("ios --help");
  });
});

// Ported from Evo's apps/ios/scripts/simulator-cleanup.test.mjs when the lifecycle moved here.
describe("lifecycle guarantees carried over from Evo", () => {
  const preview = { name: "Evo QA 012345abcdef", udid: "owned" };

  it("shuts down with data preserved, and refuses a device whose name does not match", () => {
    const calls: string[][] = [];
    const sim = (...args: string[]) => { calls.push(args); return JSON.stringify({ devices: { ios: [{ ...preview, state: "Booted" }] } }); };
    shutdownPreview(preview, preview.name, sim);
    expect(calls).toEqual([["list", "devices", "-j"], ["shutdown", "owned"]]);
    expect(() => shutdownPreview({ ...preview, name: "iPhone 17" }, preview.name, sim)).toThrow(/not owned/);
  });

  it("treats an already stopped or removed preview as an idempotent no-op", () => {
    for (const devices of [[], [{ ...preview, state: "Shutdown" }]]) {
      const calls: string[][] = [];
      shutdownPreview(preview, preview.name, (...args) => { calls.push(args); return JSON.stringify({ devices: { ios: devices } }); });
      expect(calls).toEqual([["list", "devices", "-j"]]);
    }
  });

  it("bounds the lease and leaves the default to the standard four hours", () => {
    const modes = evo().modes;
    expect(parsePreviewArgs(["start", "--ttl-minutes", "60"], modes).ttlMinutes).toBe(60);
    expect(parsePreviewArgs(["start"], modes).ttlMinutes).toBeUndefined();
    for (const value of ["0", "-1", "1441", "1.5", "NaN"]) expect(() => parsePreviewArgs(["start", "--ttl-minutes", value], modes)).toThrow();
  });

  for (const cause of ["expiry", "SIGTERM", "exit", "error"] as const) {
    it(`reclaims the simulator after ${cause}`, async () => {
      const child = new EventEmitter() as EventEmitter & { kill: (s: string) => void };
      const signals = new EventEmitter();
      const kills: string[] = [];
      child.kill = (signal) => { kills.push(signal); queueMicrotask(() => child.emit("exit", null)); };
      let cleaned = 0;
      const result = supervise(child as never, { expired: () => cause === "expiry", cleanup: () => { cleaned++; }, interval: 1, signals });
      if (cause === "SIGTERM") signals.emit("SIGTERM");
      if (cause === "exit") child.emit("exit", 7);
      if (cause === "error") child.emit("error", new Error("spawn failed"));
      if (cause === "error") await expect(result).rejects.toThrow(/spawn failed/);
      else expect(await result).toBe(cause === "exit" ? 7 : 0);
      expect(cleaned).toBe(1);
      expect(kills).toEqual(cause === "expiry" || cause === "SIGTERM" ? ["SIGTERM"] : []);
      expect(signals.listenerCount("SIGTERM")).toBe(0);
    });
  }

  it("waits for an in-flight stop before cleanup and lock release, and a second signal cannot re-enter", async () => {
    const signals = new EventEmitter();
    const events: string[] = [];
    let finishStop!: () => void;
    const stopping = new Promise<void>((resolve) => { finishStop = resolve; });
    const operation = withPreviewCancellation(async (check) => {
      events.push("stop started");
      await stopping;
      events.push("stop finished");
      check();
      events.push("boot");
    }, async () => {
      events.push("cleanup started");
      signals.emit("SIGTERM");
      await Promise.resolve();
      events.push("cleanup finished");
    }, signals).finally(() => events.push("lock released"));
    signals.emit("SIGINT");
    await Promise.resolve();
    expect(events).toEqual(["stop started"]);
    finishStop();
    await expect(operation).rejects.toThrow(/interrupted/);
    expect(events).toEqual(["stop started", "stop finished", "cleanup started", "cleanup finished", "lock released"]);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });

  it("cannot report readiness after a cancellation arrived during it", async () => {
    const signals = new EventEmitter();
    const events: string[] = [];
    let ready!: () => void;
    const waiting = new Promise<void>((resolve) => { ready = resolve; });
    const operation = withPreviewCancellation(async (check) => { await waiting; check(); events.push("report"); },
      async () => { events.push("cleanup"); }, signals).finally(() => events.push("lock released"));
    signals.emit("SIGTERM");
    ready();
    await expect(operation).rejects.toThrow(/interrupted/);
    expect(events).toEqual(["cleanup", "lock released"]);
  });
});
