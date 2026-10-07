import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activityPath, recordSimulatorActivity, resetActivityThrottle } from "../src/simulator/activity.js";
import {
  busyDevices, DEFAULT_IDLE_HOURS, formatDuration, formatSweep, parseEtime, parseIdleHours, parseRunningDevices,
  parseUserApps, recentActivity, sweep, writtenSince, type Exec, type UserApp,
} from "../src/simulator/watchdog.js";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 7, 6, 0, 0);
const A = "714BCBAF-02CF-4182-AC18-4522F0A4ABBF";
const B = "EA1CDFB5-34D5-4E22-BA7D-7A03B185CCD6";
const C = "233D816A-C267-4273-8027-D995BDCEF02D";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "morpheus-watchdog-"));
  resetActivityThrottle();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const age = (path: string, hoursAgo: number): void => {
  const t = (NOW - hoursAgo * HOUR) / 1000;
  utimesSync(path, t, t);
};
/**
 * Sets every entry under `path`, and `path`, to the same age. mkdir stamps the wall clock, which is
 * unrelated to NOW, so a fixture whose ages matter has to say them all.
 */
function settle(path: string, hoursAgo: number): void {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) settle(child, hoursAgo);
    else age(child, hoursAgo);
  }
  age(path, hoursAgo);
}
/** A container with one file in it, the whole tree `hoursAgo` old. */
function container(path: string, hoursAgo: number, file = "Library/state.db"): void {
  mkdirSync(join(path, file, ".."), { recursive: true });
  writeFileSync(join(path, file), "x");
  settle(path, hoursAgo);
}

describe("parseEtime", () => {
  it.each([
    ["00:00", 0],
    ["34:58", 2098],
    ["01:02:03", 3723],
    ["1-02:03:04", 93_784],
    ["10-08:48:59", 10 * 86_400 + 8 * 3600 + 48 * 60 + 59],
    [" 05:09 ", 309],
  ])("reads %s as %d seconds", (text, seconds) => expect(parseEtime(text)).toBe(seconds));

  it.each(["", "garbage", "12", "1:2:3:4", "-5:00"])("refuses %j rather than guessing an age", (text) => expect(parseEtime(text)).toBeNull());
});

describe("parseIdleHours", () => {
  it("accepts the supported range and nothing outside it", () => {
    expect(parseIdleHours("1")).toBe(1);
    expect(parseIdleHours("24")).toBe(24);
    expect(parseIdleHours("1.5")).toBe(1.5);
    expect(parseIdleHours("720")).toBe(720);
    for (const bad of ["0", "0.5", "721", "-3", "abc", "", "1e3"]) expect(() => parseIdleHours(bad)).toThrow(/--idle-hours/);
  });
});

describe("parseRunningDevices", () => {
  const ps = [
    `   39:26 launchd_sim /Users/me/Library/Developer/CoreSimulator/Devices/${B}/data/var/run/launchd_bootstrap.plist`,
    ` 1-02:00:00 launchd_sim /Users/me/Library/Developer/XCTestDevices/${C}/data/var/run/launchd_bootstrap.plist`,
    "   12:00 /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild test",
    "   00:05 launchd_sim /not/a/device/path.plist",
  ].join("\n");

  it("derives each device's boot time and directory from its launchd_sim process, in either set", () => {
    const running = parseRunningDevices(ps, NOW);
    expect([...running.keys()].sort()).toEqual([B, C].sort());
    expect(running.get(B)).toEqual({ udid: B, root: `/Users/me/Library/Developer/CoreSimulator/Devices/${B}`, bootedAt: NOW - (39 * 60 + 26) * 1000 });
    expect(running.get(C)!.root).toBe(`/Users/me/Library/Developer/XCTestDevices/${C}`);
    expect(running.get(C)!.bootedAt).toBe(NOW - 26 * HOUR);
  });
});

describe("busyDevices", () => {
  it("names devices a running xcodebuild or xctest addresses, and nothing else that mentions a UDID", () => {
    const ps = [
      `  05:00 /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild test -destination platform=iOS Simulator,id=${A.toLowerCase()}`,
      `  05:00 xcrun xctest -XCTest All /x.xctest ${B}`,
      `  05:00 xcrun simctl spawn ${C} log stream --style compact`,
      "  05:00 /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -version",
    ].join("\n");
    expect([...busyDevices(ps)].sort()).toEqual([A, B].sort());
  });
});

describe("parseUserApps", () => {
  it("keeps only user-installed apps, with decoded container paths", () => {
    const apps = parseUserApps(JSON.stringify({
      "com.apple.Maps": { ApplicationType: "System", DataContainer: "file:///x/Data/Application/M/" },
      "evo.med.staging": {
        ApplicationType: "User",
        DataContainer: "file:///Users/me/Library/Developer/CoreSimulator/Devices/A/data/Containers/Data/Application/D1/",
        Bundle: "file:///Users/me/Library/Developer/CoreSimulator/Devices/A/data/Containers/Bundle/Application/B1/Evo%20QA.app/",
      },
      "no.paths": { ApplicationType: "User" },
    }));
    expect(apps).toEqual([
      {
        bundleId: "evo.med.staging",
        dataContainer: "/Users/me/Library/Developer/CoreSimulator/Devices/A/data/Containers/Data/Application/D1/",
        app: "/Users/me/Library/Developer/CoreSimulator/Devices/A/data/Containers/Bundle/Application/B1/Evo QA.app/",
        bundleContainer: "/Users/me/Library/Developer/CoreSimulator/Devices/A/data/Containers/Bundle/Application/B1",
      },
      { bundleId: "no.paths", dataContainer: null, app: null, bundleContainer: null },
    ]);
  });
});

describe("writtenSince", () => {
  it("is quiet for a tree older than the cutoff and reports the first newer write", () => {
    container(dir, 30, "a/b/old.txt");
    expect(writtenSince(dir, NOW - 24 * HOUR)).toEqual({ found: null, truncated: false });

    writeFileSync(join(dir, "a/b/new.txt"), "x");
    settle(dir, 30);
    age(join(dir, "a/b/new.txt"), 2);
    expect(writtenSince(dir, NOW - 24 * HOUR)).toEqual({ found: NOW - 2 * HOUR, truncated: false });
  });

  it("counts a directory's own mtime, because deleting a file leaves no file to find", () => {
    container(dir, 30, "gone-dir/old.txt");
    age(join(dir, "gone-dir"), 1); // a sibling was just deleted: the file is gone, the directory remembers
    expect(writtenSince(dir, NOW - 24 * HOUR).found).toBe(NOW - 1 * HOUR);
  });

  it("treats a write exactly at the cutoff as idle: only strictly newer is activity", () => {
    container(dir, 30, "f.txt");
    age(join(dir, "f.txt"), 24);
    expect(writtenSince(dir, NOW - 24 * HOUR).found).toBeNull();
    age(join(dir, "f.txt"), 24 - 1 / 3600); // one second newer
    expect(writtenSince(dir, NOW - 24 * HOUR).found).not.toBeNull();
  });

  it("does not follow symlinks out of the container", () => {
    const outside = mkdtempSync(join(tmpdir(), "morpheus-outside-"));
    try {
      container(outside, 0, "fresh.txt");
      container(dir, 30, "real/old.txt");
      symlinkSync(outside, join(dir, "real/link"));
      settle(dir, 30);
      expect(writtenSince(dir, NOW - 24 * HOUR).found).toBeNull();
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("gives up with truncated, not a verdict, when the tree exceeds its budget", () => {
    for (let i = 0; i < 20; i++) writeFileSync(join(dir, `f${i}.txt`), "x");
    settle(dir, 30);
    expect(writtenSince(dir, NOW - 24 * HOUR, 10)).toEqual({ found: null, truncated: true });
    expect(writtenSince(dir, NOW - 24 * HOUR, 100)).toEqual({ found: null, truncated: false });
  });
});

describe("recentActivity", () => {
  const since = NOW - 24 * HOUR;
  const app = (): UserApp => ({
    bundleId: "evo.med.staging", dataContainer: join(dir, "Data/D1"), app: join(dir, "Bundle/B1/Evo.app"), bundleContainer: join(dir, "Bundle/B1"),
  });
  const beats = () => join(dir, "beats");

  it("is idle when every user-app signal is older than the cutoff", () => {
    container(join(dir, "Data/D1"), 40);
    container(join(dir, "Bundle/B1"), 40, "Evo.app/Info.plist");
    expect(recentActivity({ udid: A, apps: [app()], since, heartbeatDir: beats() })).toEqual({ kind: "idle" });
  });

  it("is active on an app's own data write, and names the app", () => {
    container(join(dir, "Data/D1"), 3);
    container(join(dir, "Bundle/B1"), 40, "Evo.app/Info.plist");
    expect(recentActivity({ udid: A, apps: [app()], since, heartbeatDir: beats() })).toEqual({
      kind: "active", source: "evo.med.staging wrote data", at: NOW - 3 * HOUR,
    });
  });

  it("is active on a reinstall, which moves the bundle container but writes no data", () => {
    container(join(dir, "Data/D1"), 40);
    container(join(dir, "Bundle/B1"), 40, "Evo.app/Info.plist");
    age(join(dir, "Bundle/B1/Evo.app"), 5);
    expect(recentActivity({ udid: A, apps: [app()], since, heartbeatDir: beats() })).toEqual({
      kind: "active", source: "evo.med.staging was installed", at: NOW - 5 * HOUR,
    });
  });

  it("is active on a heartbeat from Morpheus tooling, with no app at all", () => {
    expect(recordSimulatorActivity(A, NOW - HOUR, beats())).toBe(true);
    expect(recentActivity({ udid: A, apps: [], since, heartbeatDir: beats() })).toEqual({
      kind: "active", source: "driven by Morpheus tooling", at: NOW - HOUR,
    });
    expect(recentActivity({ udid: B, apps: [], since, heartbeatDir: beats() })).toEqual({ kind: "idle" });
  });

  it("lets a stale heartbeat go: a device last driven two days ago is idle", () => {
    recordSimulatorActivity(A, NOW - 48 * HOUR, beats());
    expect(recentActivity({ udid: A, apps: [], since, heartbeatDir: beats() })).toEqual({ kind: "idle" });
  });

  it("is unmeasurable, not idle, when a container is too large to walk", () => {
    container(join(dir, "Data/D1"), 40);
    for (let i = 0; i < 12; i++) writeFileSync(join(dir, `Data/D1/f${i}.txt`), "x");
    settle(join(dir, "Data/D1"), 40);
    container(join(dir, "Bundle/B1"), 40, "Evo.app/Info.plist");
    expect(recentActivity({ udid: A, apps: [app()], since, heartbeatDir: beats(), budget: 5 })).toEqual({
      kind: "unmeasurable", why: "evo.med.staging's container has too many files to inspect",
    });
  });
});

describe("heartbeat", () => {
  it("refuses anything that is not a simulator UDID, so a path cannot be written from a request", () => {
    expect(activityPath("../../etc/passwd", dir)).toBeNull();
    expect(recordSimulatorActivity("../x", NOW, dir)).toBe(false);
    expect(activityPath(A.toLowerCase(), dir)).toBe(join(dir, A));
  });

  it("writes at most once a minute per device, and again after the minute", () => {
    expect(recordSimulatorActivity(A, NOW, dir)).toBe(true);
    expect(recordSimulatorActivity(A, NOW + 59_999, dir)).toBe(false);
    expect(recordSimulatorActivity(B, NOW + 1, dir)).toBe(true);
    expect(recordSimulatorActivity(A, NOW + 60_000, dir)).toBe(true);
  });

  it("never throws, even when the directory cannot be created", () => {
    const blocker = join(dir, "file");
    writeFileSync(blocker, "x");
    expect(recordSimulatorActivity(A, NOW, join(blocker, "sub"))).toBe(false);
  });
});

/** A scripted Mac: the devices and processes `simctl` and `ps` report, and every call recorded. */
interface FakeDevice {
  udid: string; name: string; set?: "default" | "testing";
  bootedHoursAgo?: number; apps?: Record<string, unknown>; listappsFails?: boolean; shutdownFails?: string;
}

function fakeMac(devices: FakeDevice[], extra: { ps?: string; psFails?: boolean } = {}) {
  const calls: string[][] = [];
  const exec: Exec = (command, args, input) => {
    calls.push([command, ...args]);
    if (command === "ps") {
      if (extra.psFails) throw new Error("ps: operation not permitted");
      const lines = devices.filter((d) => d.bootedHoursAgo !== undefined).map((d) => {
        const secs = Math.round(d.bootedHoursAgo! * 3600);
        const etime = `${Math.floor(secs / 86400)}-${String(Math.floor(secs / 3600) % 24).padStart(2, "0")}:${String(Math.floor(secs / 60) % 60).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
        const base = d.set === "testing" ? "XCTestDevices" : "CoreSimulator/Devices";
        return `${etime} launchd_sim ${dir}/${base}/${d.udid}/data/var/run/launchd_bootstrap.plist`;
      });
      return [...lines, extra.ps ?? ""].join("\n");
    }
    if (command === "plutil") return input!;
    if (command !== "xcrun") throw new Error(`unexpected ${command}`);
    const rest = args[1] === "--set" ? args.slice(3) : args.slice(1);
    const set = args[1] === "--set" ? "testing" : "default";
    if (rest[0] === "list") {
      const mine = devices.filter((d) => (d.set ?? "default") === set);
      return `${set === "testing" ? "Using Parallel Testing Device Clones Device Set: '/x'\n" : ""}${JSON.stringify({
        devices: { "com.apple.CoreSimulator.SimRuntime.iOS-27-0": mine.map((d) => ({ udid: d.udid, name: d.name, state: d.bootedHoursAgo === undefined ? "Shutdown" : "Booted" })) },
      })}`;
    }
    const device = devices.find((d) => d.udid === rest[1] && (d.set ?? "default") === set);
    if (rest[0] === "listapps") {
      if (!device || device.listappsFails) throw new Error("simctl listapps failed");
      return JSON.stringify(device.apps ?? {});
    }
    if (rest[0] === "shutdown") {
      if (device?.shutdownFails) throw Object.assign(new Error("failed"), { stderr: Buffer.from(device.shutdownFails) });
      return "";
    }
    throw new Error(`unscripted simctl ${rest.join(" ")}`);
  };
  return { exec, calls };
}

/** An app whose data container sits under `dir`, last written `hoursAgo` hours before NOW. */
function userApp(udid: string, hoursAgo: number, set = "CoreSimulator/Devices"): Record<string, unknown> {
  const containers = join(dir, set, udid, "data/Containers");
  const data = join(containers, "Data/Application/D1");
  const bundleContainer = join(containers, "Bundle/Application/B1");
  container(data, hoursAgo);
  container(bundleContainer, 99, "Evo.app/Info.plist");
  return {
    "evo.med.staging": {
      ApplicationType: "User", DataContainer: pathToFileURL(`${data}/`).href, Bundle: pathToFileURL(`${bundleContainer}/Evo.app/`).href,
    },
    "com.apple.Maps": { ApplicationType: "System" },
  };
}

const run = (mac: ReturnType<typeof fakeMac>, options: Parameters<typeof sweep>[0] = {}) =>
  sweep({ now: NOW, exec: mac.exec, heartbeatDir: join(dir, "beats"), testingSet: false, ...options });

describe("sweep", () => {
  it("keeps a device booted for less than the threshold without looking inside it", () => {
    const mac = fakeMac([{ udid: A, name: "Evo QA", bootedHoursAgo: 23.9 }]);
    const result = run(mac);
    expect(result.decisions).toEqual([expect.objectContaining({ udid: A, action: "keep", shutDown: false, reason: "booted 23h 54m ago" })]);
    expect(mac.calls.some((c) => c.includes("listapps"))).toBe(false);
    expect(mac.calls.some((c) => c.includes("shutdown"))).toBe(false);
  });

  it("keeps a long-booted device whose app wrote recently, and says which app and how long ago", () => {
    const mac = fakeMac([{ udid: A, name: "Evo QA", bootedHoursAgo: 30, apps: userApp(A, 2) }]);
    const [d] = run(mac).decisions;
    expect(d).toMatchObject({ action: "keep", reason: "booted 30h 00m ago; evo.med.staging wrote data 2h 00m ago" });
    expect(mac.calls.filter((c) => c.includes("shutdown"))).toEqual([]);
  });

  it("shuts down exactly the idle device, by UDID, and leaves its busy neighbour alone", () => {
    const mac = fakeMac([
      { udid: A, name: "Evo QA idle", bootedHoursAgo: 41, apps: userApp(A, 40) },
      { udid: B, name: "Lakina QA busy", bootedHoursAgo: 41, apps: userApp(B, 1) },
    ]);
    const result = run(mac);
    expect(result.decisions.map((d) => [d.udid, d.action, d.shutDown])).toEqual([[A, "shutdown", true], [B, "keep", false]]);
    expect(result.decisions[0]!.reason).toBe("booted 41h 00m ago with no activity in the last 24h");
    expect(mac.calls.filter((c) => c.includes("shutdown"))).toEqual([["xcrun", "simctl", "shutdown", A]]);
  });

  it("treats exactly the threshold as idle and one second under as not yet", () => {
    const at = fakeMac([{ udid: A, name: "x", bootedHoursAgo: 24, apps: userApp(A, 24) }]);
    expect(run(at).decisions[0]).toMatchObject({ action: "shutdown", shutDown: true });
    const under = fakeMac([{ udid: B, name: "x", bootedHoursAgo: 24 - 1 / 3600, apps: userApp(B, 40) }]);
    expect(run(under).decisions[0]).toMatchObject({ action: "keep" });
    const writtenJustInside = fakeMac([{ udid: C, name: "x", bootedHoursAgo: 40, apps: userApp(C, 24 - 1 / 3600) }]);
    expect(run(writtenJustInside).decisions[0]).toMatchObject({ action: "keep" });
  });

  it("with --dry-run decides but issues no shutdown", () => {
    const mac = fakeMac([{ udid: A, name: "Evo QA", bootedHoursAgo: 50, apps: userApp(A, 49) }]);
    const result = run(mac, { dryRun: true });
    expect(result.decisions[0]).toMatchObject({ action: "shutdown", shutDown: false });
    expect(mac.calls.some((c) => c.includes("shutdown"))).toBe(false);
  });

  it("honours a custom threshold in both the boot age and the activity window", () => {
    const mac = fakeMac([{ udid: A, name: "x", bootedHoursAgo: 8, apps: userApp(A, 7) }]);
    expect(run(mac, { idleHours: 24 }).decisions[0]!.action).toBe("keep");
    expect(run(mac, { idleHours: 6 }).decisions[0]).toMatchObject({ action: "shutdown", reason: "booted 8h 00m ago with no activity in the last 6h" });
    expect(() => run(mac, { idleHours: 0 })).toThrow(/at least 1 hour/);
    expect(DEFAULT_IDLE_HOURS).toBe(24);
  });

  it("never shuts down what it cannot measure", () => {
    const noBoot = fakeMac([{ udid: A, name: "x", apps: {} }]);
    noBoot.calls.length = 0;
    // booted per simctl, but no launchd_sim in ps
    const exec: Exec = (c, a, i) => (c === "ps" ? "" : noBoot.exec(c, a, i));
    const orphan = sweep({ now: NOW, exec: (c, a, i) => (c === "xcrun" && a[1] === "list" ? JSON.stringify({ devices: { r: [{ udid: A, name: "x", state: "Booted" }] } }) : exec(c, a, i)), testingSet: false });
    expect(orphan.decisions[0]).toMatchObject({ action: "keep", reason: "its boot time could not be read" });

    const appsFail = fakeMac([{ udid: B, name: "x", bootedHoursAgo: 90, listappsFails: true }]);
    expect(run(appsFail).decisions[0]).toMatchObject({ action: "keep" });
    expect(run(appsFail).decisions[0]!.reason).toMatch(/activity could not be measured: its apps could not be listed/);

    const bigTree = fakeMac([{ udid: C, name: "x", bootedHoursAgo: 90, apps: userApp(C, 80) }]);
    expect(run(bigTree, { walkBudget: 1 }).decisions[0]!.reason).toMatch(/too many files to inspect/);

    const psDown = fakeMac([{ udid: A, name: "x", bootedHoursAgo: 90, apps: userApp(A, 80) }], { psFails: true });
    const down = run(psDown);
    expect(down.issues).toEqual([expect.stringMatching(/Could not read the process list/)]);
    expect(down.decisions[0]!.action).toBe("keep");
    expect(psDown.calls.some((c) => c.includes("shutdown"))).toBe(false);
  });

  it("leaves a device a running xcodebuild addresses", () => {
    const mac = fakeMac([{ udid: A, name: "x", bootedHoursAgo: 90, apps: userApp(A, 80) }], {
      ps: `10:00 /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild test -destination id=${A}`,
    });
    expect(run(mac).decisions[0]).toMatchObject({ action: "keep", reason: "a running xcodebuild addresses it" });
  });

  it("ignores Apple's own containers entirely: a device with only system-app churn is idle", () => {
    const apps = userApp(A, 40);
    // The system app's container is rewritten constantly, as measured on a real idle simulator.
    container(join(dir, "CoreSimulator/Devices", A, "data/Containers/Shared/AppGroup/news"), 0, "cache.db");
    container(join(dir, "CoreSimulator/Devices", A, "data/Containers/Data/PluginKitPlugin/chrono"), 0, "timeline");
    const mac = fakeMac([{ udid: A, name: "x", bootedHoursAgo: 60, apps }]);
    expect(run(mac).decisions[0]).toMatchObject({ action: "shutdown", shutDown: true });
  });

  it("includes XCTest's clone set, and shuts those down with --set testing", () => {
    const mac = fakeMac([
      { udid: A, name: "Evo QA", bootedHoursAgo: 90, apps: userApp(A, 80) },
      { udid: C, name: "Clone 1 of iPhone 17 Pro", set: "testing", bootedHoursAgo: 90, apps: userApp(C, 80, "XCTestDevices") },
    ]);
    const result = run(mac, { testingSet: true });
    expect(result.decisions.map((d) => [d.udid, d.set, d.shutDown])).toEqual([[A, "default", true], [C, "testing", true]]);
    expect(mac.calls.filter((c) => c.includes("shutdown"))).toEqual([
      ["xcrun", "simctl", "shutdown", A],
      ["xcrun", "simctl", "--set", "testing", "shutdown", C],
    ]);
  });

  it("reports a failed shutdown, but counts a device that is already down as done", () => {
    const mac = fakeMac([
      { udid: A, name: "stuck", bootedHoursAgo: 90, apps: userApp(A, 80), shutdownFails: "Unable to shutdown device in current state: Booting" },
      { udid: B, name: "raced", bootedHoursAgo: 90, apps: userApp(B, 80), shutdownFails: "Unable to shutdown device in current state: Shutdown" },
    ]);
    const [stuck, raced] = run(mac).decisions;
    expect(stuck).toMatchObject({ shutDown: false, error: "Unable to shutdown device in current state: Booting" });
    expect(raced).toMatchObject({ shutDown: true });
    expect(raced!.error).toBeUndefined();
  });

  it("can only ever issue list, listapps and shutdown to simctl: nothing deletes, erases or shuts down all", () => {
    const mac = fakeMac([
      { udid: A, name: "idle", bootedHoursAgo: 90, apps: userApp(A, 80) },
      { udid: B, name: "busy", bootedHoursAgo: 90, apps: userApp(B, 1) },
      { udid: C, name: "young", bootedHoursAgo: 1 },
    ]);
    run(mac);
    const verbs = mac.calls.filter((c) => c[0] === "xcrun" && c[1] === "simctl").map((c) => c[c[2] === "--set" ? 4 : 2]);
    expect(new Set(verbs)).toEqual(new Set(["list", "listapps", "shutdown"]));
    for (const c of mac.calls) expect(c.join(" ")).not.toMatch(/\b(delete|erase|all)\b/);
    expect(mac.calls.filter((c) => c.includes("shutdown"))).toEqual([["xcrun", "simctl", "shutdown", A]]);
  });

  it("does nothing when no simulator is booted", () => {
    const mac = fakeMac([{ udid: A, name: "off" }]);
    expect(run(mac)).toEqual({ idleHours: 24, decisions: [], issues: [] });
    expect(mac.calls.some((c) => c[0] === "ps")).toBe(false);
  });
});

describe("formatSweep", () => {
  const result = {
    idleHours: 24, issues: ["Could not list the testing simulator set: boom"],
    decisions: [
      { udid: A, name: "Evo QA", set: "default" as const, action: "shutdown" as const, reason: "idle", shutDown: true },
      { udid: B, name: "Lakina QA", set: "default" as const, action: "keep" as const, reason: "booted 2h 00m ago", shutDown: false },
      { udid: C, name: "Clone 1", set: "testing" as const, action: "shutdown" as const, reason: "idle", shutDown: false, error: "stuck" },
    ],
  };

  it("lists everything for a person, and says what a dry run only would do", () => {
    const text = formatSweep(result);
    expect(text).toContain(`✓ shut down Evo QA (${A}): idle`);
    expect(text).toContain(`· kept Lakina QA (${B}): booted 2h 00m ago`);
    expect(text).toContain(`✗ Clone 1 (${C}) [XCTest clone]: could not shut down: stuck`);
    expect(text).toContain("✗ Could not list the testing simulator set: boom");
    expect(formatSweep(result, { dryRun: true })).toContain(`~ would shut down Evo QA (${A})`);
  });

  it("with --quiet prints only what changed or went wrong, so the launchd log stays small", () => {
    const text = formatSweep(result, { quiet: true });
    expect(text).not.toContain("kept");
    expect(text.split("\n")).toHaveLength(3);
    expect(formatSweep({ idleHours: 24, decisions: [], issues: [] }, { quiet: true })).toBe("");
    expect(formatSweep({ idleHours: 24, decisions: [], issues: [] })).toBe("No booted simulators.");
  });

  it("formats durations the way the reasons read", () => {
    expect([0, 59_999, 60_000, 3_599_000, 3_600_000, 90 * 60_000, 41 * HOUR + 5 * 60_000].map(formatDuration)).toEqual(["0m", "0m", "1m", "59m", "1h 00m", "1h 30m", "41h 05m"]);
  });
});
