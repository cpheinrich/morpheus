import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const pause = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("node:timers/promises", () => ({ setTimeout: pause }));
import { waitForWebPreview, type WebPreviewState } from "../src/qa/preview/web.js";

let root: string;
const fetchMock = vi.fn();
const state = (): WebPreviewState => ({ root, upstream: "http://localhost:5173", port: 4309, path: "/", expiresAt: Date.now() + 60000, spawned: true, command: ["false"], cwd: ".", project: "fixture" });
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "qa-web-readiness-"));
  pause.mockClear(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => { vi.unstubAllGlobals(); await rm(root, { recursive: true, force: true }); });

it.each(["state = not running\nruns = 1\nlast exit code = 2", "state = not running\nruns = 1\nlast exit code = 0", "state = not running\nlast terminating signal = 15", "state = not running\nruns = 1", ""])("fails immediately for a dead supervisor: %s", async status => {
  const log = join(root, "preview.log");
  await writeFile(log, "old output\n".repeat(10000) + "build failed: missing script\ndev server exited (2)\n");
  const error = await waitForWebPreview(state(), () => status, log, () => undefined).catch(error => error as Error);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("supervisor exited before readiness");
  expect((error as Error).message).toContain("build failed: missing script\ndev server exited (2)");
  expect((error as Error).message.split("Recent preview log:\n")[1]?.split("\n")).toHaveLength(20);
  expect(pause).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
});

it("allows a pending first launch and a compiling live process to become ready", async () => {
  const readJob = vi.fn().mockReturnValueOnce("state = not running\nruns = 0\nlast exit code = (never exited)").mockReturnValue("state = running\npid = 123\nruns = 1");
  fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ kind: "web", upstream: state().upstream })))
    .mockResolvedValueOnce(new Response("ready"));
  await waitForWebPreview(state(), readJob, join(root, "preview.log"), () => undefined);
  expect(readJob).toHaveBeenCalledTimes(2);
  expect(pause).toHaveBeenCalledExactlyOnceWith(500);
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual(["http://127.0.0.1:4309/__qa/health", "http://127.0.0.1:4309/__qa/health", "http://localhost:5173"]);
});

it("retains the bounded wait for a live but unhealthy process", async () => {
  fetchMock.mockResolvedValue(new Response("", { status: 503 }));
  await expect(waitForWebPreview(state(), () => "state = running\npid = 123\nruns = 1", join(root, "missing.log"), () => undefined)).rejects.toThrow("did not become ready on port 4309");
  expect(pause).toHaveBeenCalledTimes(360);
  expect(fetchMock).toHaveBeenCalledTimes(360);
});

it("preserves cancellation before polling", async () => {
  await expect(waitForWebPreview(state(), () => "", "unused", () => { throw new Error("cancelled"); })).rejects.toThrow("cancelled");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("the real supervisor terminates when its dev command exits immediately", async () => {
  const file = join(root, "state.json");
  await writeFile(file, JSON.stringify({ ...state(), port: 0, command: [process.execPath, "-e", "console.error('fixture build failed'); process.exit(23)"] }));
  const result = await promisify(execFile)(process.execPath, ["--import", "tsx", new URL("../src/qa/preview/web-supervisor.ts", import.meta.url).pathname, file], { timeout: 10000 }).catch(error => error);
  expect(result).toMatchObject({ code: 1, killed: false });
  expect(result.stderr).toContain("fixture build failed");
  expect(result.stderr).toContain("dev server exited (23)");
}, 15000);
