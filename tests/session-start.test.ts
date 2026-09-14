import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareRepository, parseSessionInput, assertCurrentSource } from "../src/session/start.js";
import { prepareTask, resumeTask, bindTask, boundTask } from "../src/session/tasks.js";
import { startSession } from "../src/cli/session-start.js";
import { refresh, check } from "../src/session/context.js";
import { claim } from "../src/cli/pm.js";
import type { MorpheusInstallStatus } from "../src/self.js";

const exec = promisify(execFile);
const git = async (cwd: string, ...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
const morpheus: MorpheusInstallStatus = { source: "copied", kind: "package", relation: "current", fresh: true, installedSha: null, remoteSha: null };
let dir: string, remote: string, source: string, local: string;
const id = "MO-26-09-13-17.08.15";
const rel = `hq/product/roadmap/${id}-task.md`;
const body = `---\nid: ${id}\ntitle: A task\nstatus: backlog\npriority: P1\nowner: agent\nprs: []\ncreated: 2026-09-13\nupdated: 2026-09-13\n---\n\nDo the task.\n`;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "session-start-"));
  remote = join(dir, "remote.git"); source = join(dir, "author"); local = join(dir, "project");
  await git(dir, "init", "--bare", remote);
  await git(dir, "init", "-b", "main", source);
  await git(source, "config", "user.email", "test@example.com");
  await git(source, "config", "user.name", "Test");
  await mkdir(join(source, ".agent"));
  await mkdir(join(source, "hq/product/roadmap"), { recursive: true });
  await writeFile(join(source, "morpheus.json"), JSON.stringify({ name: "test", context: { trunk: "origin/main" } }));
  await writeFile(join(source, ".gitignore"), "local/\n");
  await writeFile(join(source, "CLAUDE.md"), "Instructions\n");
  await writeFile(join(source, ".agent/decisions.md"), "Decisions\n");
  await writeFile(join(source, ".agent/learned.md"), "Learned\n");
  await writeFile(join(source, "code.txt"), "old\n");
  await writeFile(join(source, rel), body);
  await git(source, "add", "."); await git(source, "commit", "-m", "initial");
  await git(source, "remote", "add", "origin", remote); await git(source, "push", "origin", "main");
  await git(dir, "clone", "--branch", "main", remote, local);
  await git(local, "config", "user.email", "test@example.com"); await git(local, "config", "user.name", "Test");
});
afterEach(async () => { vi.restoreAllMocks(); await rm(dir, { recursive: true, force: true }); });
async function advance() {
  await writeFile(join(source, "code.txt"), "latest\n");
  await git(source, "commit", "-am", "remote advance"); await git(source, "push", "origin", "main");
  return git(source, "rev-parse", "HEAD");
}

describe("startup source freshness", () => {
  it("fetches and fast-forwards clean trunk without creating a worktree", async () => {
    const worktrees = await git(local, "worktree", "list", "--porcelain");
    const latest = await advance();
    const result = await prepareRepository(local);
    expect(result.sha).toBe(latest);
    expect(result.advanced).toBe(true);
    expect(result.behind).toBe(0);
    expect(await git(local, "rev-parse", "HEAD")).toBe(latest);
    expect(await git(local, "worktree", "list", "--porcelain")).toContain("branch refs/heads/main");
    expect((await git(local, "worktree", "list", "--porcelain")).split("worktree ").length).toBe(worktrees.split("worktree ").length);
    expect(await readFile(join(local, "code.txt"), "utf8")).toBe("latest\n");
  });
  it("preserves a dirty checkout and reports exactly how far behind it is", async () => {
    const before = await git(local, "rev-parse", "HEAD");
    await writeFile(join(local, "code.txt"), "my changes\n");
    await advance();
    expect((await prepareRepository(local)).behind).toBe(1);
    expect(await git(local, "rev-parse", "HEAD")).toBe(before);
    expect(await readFile(join(local, "code.txt"), "utf8")).toBe("my changes\n");
    await expect(assertCurrentSource(local)).rejects.toThrow("does not contain current");
  });
  it("does not rewrite an existing task or diverged trunk", async () => {
    await git(local, "checkout", "-b", `${id.toLowerCase()}-task`);
    const before = await git(local, "rev-parse", "HEAD"); await advance();
    const result = await prepareRepository(local);
    expect(result.task).toBe(id); expect(result.behind).toBe(1); expect(result.advanced).toBe(false);
    expect(await git(local, "rev-parse", "HEAD")).toBe(before);
    await git(local, "checkout", "main");
    await writeFile(join(local, "local.txt"), "local"); await git(local, "add", "local.txt"); await git(local, "commit", "-m", "local");
    const divergent = await git(local, "rev-parse", "HEAD");
    expect((await prepareRepository(local)).advanced).toBe(false);
    expect(await git(local, "rev-parse", "HEAD")).toBe(divergent);
  });
  it("uses a declared upstream branch rather than the stale fork", async () => {
    await git(source, "checkout", "-b", "release/current");
    await writeFile(join(source, "code.txt"), "upstream\n"); await git(source, "commit", "-am", "upstream"); await git(source, "push", "origin", "release/current");
    await git(local, "remote", "add", "upstream", remote);
    await writeFile(join(local, "morpheus.json"), JSON.stringify({ context: { trunk: "upstream/release/current" } }));
    const result = await prepareRepository(local);
    expect(result.trunk).toBe("upstream/release/current"); expect(result.sha).toBe(await git(source, "rev-parse", "HEAD"));
  });
  it("fails visibly offline or with unreachable/missing trunk, without using cached code", async () => {
    const before = await git(local, "rev-parse", "HEAD");
    await expect(prepareRepository(local, true)).rejects.toThrow("Offline");
    await git(local, "remote", "set-url", "origin", join(dir, "missing.git"));
    await expect(prepareRepository(local)).rejects.toThrow();
    await git(local, "remote", "set-url", "origin", remote);
    await writeFile(join(local, "morpheus.json"), JSON.stringify({ context: { trunk: "origin/missing" } }));
    await expect(prepareRepository(local)).rejects.toThrow();
    expect(await git(local, "rev-parse", "HEAD")).toBe(before);
  });
  it("refuses to certify stale source even after a previous receipt, then succeeds after startup updates it", async () => {
    expect((await refresh(local)).lease?.status).toBe("fresh");
    await advance();
    const stale = await refresh(local);
    expect(stale.lease).toBeNull(); expect(stale.issue).toContain("does not contain current");
    expect((await check(local)).lease).toBeNull();
    await prepareRepository(local);
    expect((await refresh(local)).lease?.status).toBe("fresh");
  });
});

describe("one worktree per implementation task", () => {
  it("prepares current trunk without transferring unrelated edits, and a second claim stays in that worktree", async () => {
    await writeFile(join(local, "code.txt"), "unrelated\n");
    const latest = await advance();
    const target = (await prepareTask(local, join(local, "hq/product"), id))!;
    expect(await git(target, "rev-parse", "HEAD")).toBe(latest);
    expect(await git(target, "status", "--porcelain")).toBe("");
    expect(await prepareTask(target, join(target, "hq/product"), id)).toBeNull();
    expect(await readFile(join(local, "code.txt"), "utf8")).toBe("unrelated\n");
    // Actual claim: fresh records are explicitly certified before it can push.
    expect((await refresh(target)).lease?.status).toBe("fresh");
    expect(await claim(join(target, "hq/product"), id, target, "session-a")).toBe(0);
    const branch = await git(target, "branch", "--show-current");
    expect(branch).toBe(`${id.toLowerCase()}-task`);
    expect(await git(local, "branch", "--show-current")).toBe("main");
    expect((await boundTask(local, "session-a"))?.root).toBe(target);
    await writeFile(join(target, "code.txt"), "task edits\n");
    expect(await resumeTask(local, id, "session-b")).toBe(target);
    expect(await readFile(join(target, "code.txt"), "utf8")).toBe("task edits\n");
    expect((await boundTask(local, "session-b"))?.root).toBe(target);
  });
  it("moves only a newly filed untracked roadmap item", async () => {
    const newId = "MO-26-09-13-17.08.16";
    const newRel = rel.replace(id, newId);
    await writeFile(join(local, newRel), body.replace(id, newId));
    await writeFile(join(local, "unrelated.txt"), "stay here");
    const target = (await prepareTask(local, join(local, "hq/product"), newId))!;
    expect(await readFile(join(target, newRel), "utf8")).toBe(body.replace(id, newId));
    expect(await git(target, "status", "--porcelain")).toBe(`?? ${newRel}`);
    await expect(readFile(join(local, newRel))).rejects.toThrow();
    expect(await readFile(join(local, "unrelated.txt"), "utf8")).toBe("stay here");
  });
  it("resumes a remote-only claim and preserves its existing branch code", async () => {
    const branch = `${id.toLowerCase()}-remote-task`;
    await git(source, "checkout", "-b", branch);
    await writeFile(join(source, "code.txt"), "task implementation\n");
    await git(source, "commit", "-am", "task work"); await git(source, "push", "origin", branch);
    const target = await resumeTask(local, id);
    expect(await git(target, "branch", "--show-current")).toBe(branch);
    expect(await readFile(join(target, "code.txt"), "utf8")).toBe("task implementation\n");
    expect(await resumeTask(local, id)).toBe(target);
  });
  it("refuses ambiguous claims and stale associations", async () => {
    for (const suffix of ["one", "two"]) await git(source, "push", "origin", `HEAD:refs/heads/${id.toLowerCase()}-${suffix}`);
    await expect(resumeTask(local, id)).rejects.toThrow("found 2");
    await bindTask(local, id, "stale");
    await expect(boundTask(local, "stale")).rejects.toThrow("no longer matches");
  });
  it("retains the association while a new worktree is prepared but not claimed", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await claim(join(local, "hq/product"), id, local, "pending")).toBe(0);
    const pending = await boundTask(local, "pending");
    expect(pending?.pending).toBe(true);
    expect(pending?.task).toBe(id);
    expect(await git(pending!.root, "branch", "--show-current")).toBe("");
    expect(await startSession(local, { sessionId: "pending" }, { morpheus })).toBe(0);
    expect((await boundTask(local, "pending"))?.root).toBe(pending!.root);
  });
  it("invalidates inherited receipts even when startup cannot fetch", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await refresh(local)).lease?.status).toBe("fresh");
    await git(local, "remote", "set-url", "origin", join(dir, "missing.git"));
    expect(await startSession(local, {})).toBe(1);
    expect((await check(local)).lease).toBeNull();
  });
  it("does not claim without a destination receipt or when offline is explicit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const target = (await prepareTask(local, join(local, "hq/product"), id))!;
    expect(await claim(join(target, "hq/product"), id, target)).toBe(1);
    expect(await git(target, "branch", "--show-current")).toBe("");
    await refresh(target);
    expect(await claim(join(target, "hq/product"), id, target, undefined, true)).toBe(1);
    expect(await git(target, "branch", "--show-current")).toBe("");
  });
  it("prints the actual directory and required records without issuing a receipt", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await startSession(local, {}, { morpheus })).toBe(0);
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain(`WORK IN: ${await git(local, "rev-parse", "--show-toplevel")}`);
    expect(output).toContain("Investigation needs no new worktree");
    expect(output).toContain("This session has no context receipt");
    expect((await check(local)).lease).toBeNull();
  });
});
it("parses hook identities as opaque values", () => {
  expect(parseSessionInput('{"session_id":"../session","source":"compact"}', "fallback")).toEqual({ sessionId: "../session", source: "compact" });
  expect(parseSessionInput("", "thread")).toEqual({ sessionId: "thread", source: undefined });
  expect(() => parseSessionInput("[]")).toThrow("JSON object");
});
