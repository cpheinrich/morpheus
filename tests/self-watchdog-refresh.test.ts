import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFile = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (original) => ({ ...(await original<typeof import("node:child_process")>()), execFile }));
vi.mock("../src/self.js", () => ({
  formatMorpheusInstallStatus: vi.fn(), installCurrentMorpheus: vi.fn(), morpheusInstallStatus: vi.fn(), updateMorpheus: vi.fn(),
}));
vi.mock("../src/self-auto-update.js", () => ({
  autoUpdateStatus: vi.fn(), disableAutoUpdate: vi.fn(), enableAutoUpdate: vi.fn(), ensureAutoUpdate: vi.fn(), findMorpheusBinary: vi.fn(),
}));
vi.mock("../src/simulator/agent.js", () => ({ findInstalledMorpheus: vi.fn(async () => "/opt/homebrew/bin/morpheus") }));

import { autoUpdate, ensure, install, update } from "../src/cli/self.js";
import { enableAutoUpdate, ensureAutoUpdate } from "../src/self-auto-update.js";
import { installCurrentMorpheus, updateMorpheus } from "../src/self.js";
import { findInstalledMorpheus } from "../src/simulator/agent.js";

const REFRESH = ["/opt/homebrew/bin/morpheus", ["simulator", "watchdog", "refresh"], expect.anything(), expect.any(Function)];
const platform = process.platform;
const setPlatform = (value: string) => Object.defineProperty(process, "platform", { value });

beforeEach(() => {
  setPlatform("darwin");
  execFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, done: (e: Error | null, r?: unknown) => void) => done(null, { stdout: "", stderr: "" }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  setPlatform(platform);
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const verbs = () => execFile.mock.calls.map((call) => (call[1] as string[]).join(" "));

describe("a Morpheus update repairs an enabled simulator watchdog, and only that", () => {
  it("runs the INSTALLED binary's `simulator watchdog refresh` after a successful update, never `enable`", async () => {
    vi.mocked(updateMorpheus).mockResolvedValue({ commit: "abcdef1234567" } as Awaited<ReturnType<typeof updateMorpheus>>);
    expect(await update()).toBe(0);
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(execFile.mock.calls[0]).toEqual(REFRESH);
    expect(verbs().join("\n")).not.toMatch(/enable/);
  });

  it("does the same after `self install`", async () => {
    vi.mocked(installCurrentMorpheus).mockResolvedValue({ commit: "abcdef1234567" } as Awaited<ReturnType<typeof installCurrentMorpheus>>);
    expect(await install("/src")).toBe(0);
    expect(execFile.mock.calls).toEqual([REFRESH]);
  });

  it("does nothing when the update or install failed", async () => {
    vi.mocked(updateMorpheus).mockRejectedValue(new Error("clone failed"));
    vi.mocked(installCurrentMorpheus).mockRejectedValue(new Error("copy failed"));
    expect(await update()).toBe(1);
    expect(await install("/src")).toBe(1);
    expect(execFile).not.toHaveBeenCalled();
  });

  it.each(["current", "disabled", "deferred", "busy", "failed"] as const)("does nothing when `self ensure` reports %s", async (outcome) => {
    vi.mocked(ensureAutoUpdate).mockResolvedValue({ outcome, detail: "x" });
    await ensure();
    expect(execFile).not.toHaveBeenCalled();
  });

  it("refreshes after `self ensure` actually installed a new Morpheus", async () => {
    vi.mocked(ensureAutoUpdate).mockResolvedValue({ outcome: "updated", detail: "x", commit: "abc" });
    expect(await ensure()).toBe(0);
    expect(execFile.mock.calls).toEqual([REFRESH]);
  });

  it("refreshes after `self auto-update enable` only if that enable installed a new Morpheus", async () => {
    const change = (ensureResult?: { outcome: "updated" | "current"; detail: string }) =>
      ({ config: { preference: "enabled", path: "/p" }, hooks: [], ...(ensureResult ? { ensure: ensureResult } : {}) }) as Awaited<ReturnType<typeof enableAutoUpdate>>;
    vi.mocked(enableAutoUpdate).mockResolvedValueOnce(change({ outcome: "current", detail: "x" }));
    await autoUpdate("enable", "/project");
    vi.mocked(enableAutoUpdate).mockResolvedValueOnce(change());
    await autoUpdate("enable", "/project");
    expect(execFile).not.toHaveBeenCalled();
    vi.mocked(enableAutoUpdate).mockResolvedValueOnce(change({ outcome: "updated", detail: "x" }));
    await autoUpdate("enable", "/project");
    expect(execFile.mock.calls).toEqual([REFRESH]);
  });

  it("is a no-op off macOS, where no launchd agent can exist", async () => {
    setPlatform("linux");
    vi.mocked(updateMorpheus).mockResolvedValue({ commit: "abcdef1234567" } as Awaited<ReturnType<typeof updateMorpheus>>);
    expect(await update()).toBe(0);
    expect(execFile).not.toHaveBeenCalled();
  });

  it("is a no-op when only a project's shim is on PATH, so no installed morpheus exists to run", async () => {
    vi.mocked(findInstalledMorpheus).mockResolvedValueOnce(null);
    vi.mocked(updateMorpheus).mockResolvedValue({ commit: "abcdef1234567" } as Awaited<ReturnType<typeof updateMorpheus>>);
    expect(await update()).toBe(0);
    expect(execFile).not.toHaveBeenCalled();
  });

  it("reports why a refresh failed (the cause, not execFile's header) and still counts the update as done", async () => {
    execFile.mockImplementation((_c: string, _a: string[], _o: unknown, done: (e: Error) => void) =>
      done(Object.assign(new Error("Command failed: /opt/homebrew/bin/morpheus simulator watchdog refresh\nUnknown command \"simulator\"."), { stderr: "Unknown command \"simulator\".\n" })));
    vi.mocked(updateMorpheus).mockResolvedValue({ commit: "abcdef1234567" } as Awaited<ReturnType<typeof updateMorpheus>>);
    expect(await update()).toBe(0);
    expect(console.error).toHaveBeenCalledWith('~ Simulator watchdog refresh failed: Unknown command "simulator".');
  });
});
