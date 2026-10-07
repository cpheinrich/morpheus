import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/qa/preview/ios.js", async (original) => ({ ...(await original<typeof import("../src/qa/preview/ios.js")>()), runPreview: vi.fn(async () => undefined) }));
vi.mock("../src/simulator/agent.js", () => ({ watchdogNudge: vi.fn(async () => "NUDGE TEXT") }));

import { dispatchQaPreview } from "../src/cli/qa.js";
import { runPreview } from "../src/qa/preview/ios.js";
import { watchdogNudge } from "../src/simulator/agent.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "morpheus-nudge-"));
  writeFileSync(join(root, "morpheus.json"), JSON.stringify({
    name: "demo", qa: { ios: { app: "apps/ios", build: ["true"], product: "Demo.app", bundleId: "com.demo", modes: { demo: { args: [] } } } },
  }));
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); vi.restoreAllMocks(); });

const printed = () => vi.mocked(console.log).mock.calls.map((c) => String(c[0]));

describe("qa preview ios start tells a Mac with no simulator watchdog about it", () => {
  it("prints the nudge after a successful start", async () => {
    expect(await dispatchQaPreview(root, "ios", ["start"])).toBe(0);
    expect(runPreview).toHaveBeenCalledTimes(1);
    expect(printed()).toContain("\nNUDGE TEXT");
  });

  it.each(["status", "stop", "doctor"])("says nothing after `%s`, when no simulator was just booted", async (command) => {
    expect(await dispatchQaPreview(root, "ios", [command])).toBe(0);
    expect(watchdogNudge).not.toHaveBeenCalled();
    expect(printed()).not.toContain("\nNUDGE TEXT");
  });

  it("says nothing when the Mac has decided, and never fails the start over a nudge", async () => {
    vi.mocked(watchdogNudge).mockResolvedValueOnce(null);
    expect(await dispatchQaPreview(root, "ios", ["start"])).toBe(0);
    expect(printed()).not.toContain("\nNUDGE TEXT");
    vi.mocked(watchdogNudge).mockRejectedValueOnce(new Error("xcrun exploded"));
    expect(await dispatchQaPreview(root, "ios", ["start"])).toBe(0);
  });

  it("does not nudge when the start itself failed", async () => {
    vi.mocked(runPreview).mockRejectedValueOnce(new Error("port busy"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await dispatchQaPreview(root, "ios", ["start"])).toBe(1);
    expect(watchdogNudge).not.toHaveBeenCalled();
  });
});
