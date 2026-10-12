import { promisify } from "node:util";
import { beforeEach, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  const fn = Object.assign(vi.fn(), { [Symbol.for("nodejs.util.promisify.custom")]: execute });
  return { ...actual, execFile: fn };
});
import { sessionGit } from "../src/session/start.js";

beforeEach(() => { execute.mockReset(); });

it("explains a real Node subprocess timeout rather than dropping the kill metadata", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  const failure = await promisify(actual.execFile)(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], { timeout: 25 }).catch(error => error);
  expect(failure).toMatchObject({ killed: true, signal: "SIGTERM", code: null });
  failure.message = "Command failed: git fetch origin\n";
  execute.mockRejectedValue(failure);
  await expect(sessionGit("/workspace", ["fetch", "origin"])).rejects.toThrow("Git command timed out after 30 seconds and was stopped (SIGTERM)");
  await expect(sessionGit("/workspace", ["fetch", "origin"])).rejects.toMatchObject({ cause: failure });
  expect(execute).toHaveBeenCalledWith("git", ["fetch", "origin"], expect.objectContaining({ cwd: "/workspace", timeout: 30_000 }));
});

it.each([
  { code: 128, killed: false, signal: null, stderr: "fatal: unable to access remote" },
  { code: null, killed: false, signal: "SIGTERM", stderr: "" },
  { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", killed: true, signal: "SIGTERM", stderr: "buffer full" },
  { code: "ENOENT", killed: false, signal: null, stderr: "" },
])("preserves a non-timeout error and stderr unchanged: $code / $killed", async details => {
  const failure = Object.assign(new Error("original Git failure"), details);
  execute.mockRejectedValue(failure);
  await expect(sessionGit("/workspace", ["fetch", "origin"])).rejects.toBe(failure);
  expect(failure.message).toBe("original Git failure");
  expect(failure.stderr).toBe(details.stderr);
});

it("keeps successful Git output trimmed", async () => {
  execute.mockResolvedValue({ stdout: " main\n", stderr: "" });
  expect(await sessionGit("/workspace", ["branch", "--show-current"])).toBe("main");
});
