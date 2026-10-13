import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTask } from "../src/pm/cleanup.js";
import { prepareTask } from "../src/session/tasks.js";

const exec = promisify(execFile);
const git = async (cwd: string, ...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
const id = "MO-26-10-13-15.00.00";
const branch = `${id.toLowerCase()}-cleanup-task`;
const item = `hq/product/roadmap/${id}-cleanup-task.md`;
const itemBody = `---\nid: ${id}\ntitle: Clean completed tasks\nstatus: review\npriority: P1\nowner: agent\nprs: []\ncreated: 2026-10-13\nupdated: 2026-10-13\n---\n\nA test task.\n`;
let dir: string;
let root: string;
let target: string;
let bare: string;
let head: string;
let merge: string;
let previousPath: string | undefined;
let previousPr: string | undefined;

async function pr(state: "MERGED" | "OPEN"): Promise<void> {
  await writeFile(join(dir, "pr.json"), JSON.stringify([{
    number: 42,
    headRefName: branch,
    headRefOid: head,
    baseRefName: "main",
    state,
    mergeCommit: state === "MERGED" ? { oid: merge } : null,
    headRepository: { nameWithOwner: "example/repo" },
  }]));
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "morpheus-cleanup-test-"));
  root = join(dir, "repo");
  target = join(dir, "legacy-task-worktree");
  bare = join(dir, "remote.git");
  await mkdir(root);
  await git(dir, "init", "--bare", bare);
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.email", "test@example.com");
  await git(root, "config", "user.name", "Test");
  await mkdir(join(root, "hq/product/roadmap"), { recursive: true });
  await writeFile(join(root, "morpheus.json"), JSON.stringify({ name: "test", kind: "internal", context: { trunk: "origin/main" } }));
  await writeFile(join(root, item), itemBody);
  await writeFile(join(root, "implementation.txt"), "original\n");
  await git(root, "add", ".");
  await git(root, "commit", "-m", "initial");
  await git(root, "remote", "add", "origin", bare);
  await git(root, "push", "-u", "origin", "main");
  await git(root, "worktree", "add", "-b", branch, target);
  root = await realpath(root);
  target = await realpath(target);
  await writeFile(join(target, "implementation.txt"), "implemented\n");
  await git(target, "commit", "-am", "implement");
  head = await git(target, "rev-parse", "HEAD");
  await git(target, "push", "-u", "origin", branch);
  await git(root, "merge", "--squash", branch);
  await git(root, "commit", "-m", "merge task");
  merge = await git(root, "rev-parse", "HEAD");
  await git(root, "push", "origin", "main");
  const bin = join(dir, "bin");
  await mkdir(bin);
  await writeFile(join(bin, "gh"), '#!/bin/sh\nif [ "$1" = repo ]; then printf \'%s\\n\' \'{"nameWithOwner":"example/repo","url":"https://example.invalid/repo"}\'; else cat "$MORPHEUS_TEST_PR_JSON"; fi\n');
  await chmod(join(bin, "gh"), 0o755);
  previousPath = process.env["PATH"];
  previousPr = process.env["MORPHEUS_TEST_PR_JSON"];
  process.env["PATH"] = `${bin}${delimiter}${previousPath ?? ""}`;
  process.env["MORPHEUS_TEST_PR_JSON"] = join(dir, "pr.json");
  await pr("MERGED");
});

afterEach(async () => {
  const listing = await git(root, "worktree", "list", "--porcelain");
  for (const path of listing.split("\n").filter(line => line.startsWith("worktree ")).map(line => line.slice(9))) {
    if (path === root) continue;
    await git(root, "worktree", "remove", "--force", "--", path);
    await rmdir(dirname(path)).catch(() => undefined);
  }
  if (previousPath === undefined) delete process.env["PATH"];
  else process.env["PATH"] = previousPath;
  if (previousPr === undefined) delete process.env["MORPHEUS_TEST_PR_JSON"];
  else process.env["MORPHEUS_TEST_PR_JSON"] = previousPr;
  await rm(dir, { recursive: true, force: true });
});

describe("completed task worktree cleanup", () => {
  it("removes a clean merged legacy checkout and both branch refs", async () => {
    const preview = await cleanupTask(root, join(root, "hq/product"), id, true);
    expect(preview).toMatchObject({ path: target, branch, pr: 42, dryRun: true });
    expect(await git(root, "worktree", "list", "--porcelain")).toContain(target);

    const result = await cleanupTask(root, join(root, "hq/product"), id);
    expect(result).toMatchObject({ path: target, branch, pr: 42, dryRun: false });
    expect(await git(root, "worktree", "list", "--porcelain")).not.toContain(target);
    await expect(readFile(join(target, "implementation.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(git(root, "show-ref", "--verify", `refs/heads/${branch}`)).rejects.toThrow();
    expect(await git(root, "ls-remote", "--heads", "origin", `refs/heads/${branch}`)).toBe("");
  });

  it("retains local edits even when the PR merged", async () => {
    await writeFile(join(target, "notes.txt"), "unfinished local work\n");
    await expect(cleanupTask(root, join(root, "hq/product"), id)).rejects.toThrow("Dirty worktree");
    expect(await readFile(join(target, "notes.txt"), "utf8")).toBe("unfinished local work\n");
    expect(await git(root, "ls-remote", "--heads", "origin", `refs/heads/${branch}`)).toContain(branch);
  });

  it("retains ignored local files rather than deleting them with a clean Git status", async () => {
    await writeFile(join(root, ".git/info/exclude"), "private.txt\n");
    await writeFile(join(target, "private.txt"), "keep this\n");
    await expect(cleanupTask(root, join(root, "hq/product"), id)).rejects.toThrow("Dirty worktree");
    expect(await readFile(join(target, "private.txt"), "utf8")).toBe("keep this\n");
  });

  it("removes a generated node_modules cache with a completed task", async () => {
    await writeFile(join(root, ".git/info/exclude"), "node_modules/\n");
    await mkdir(join(target, "node_modules"));
    await writeFile(join(target, "node_modules", "cache.txt"), "reproducible\n");
    await cleanupTask(root, join(root, "hq/product"), id);
    await expect(readFile(join(target, "node_modules", "cache.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("retains a clean worktree while its PR is still open", async () => {
    await pr("OPEN");
    await expect(cleanupTask(root, join(root, "hq/product"), id)).rejects.toThrow("not MERGED");
    expect(await git(root, "worktree", "list", "--porcelain")).toContain(target);
  });

  it("removes an unclaimed prepared temp checkout only with its marker and trunk proof", async () => {
    await cleanupTask(root, join(root, "hq/product"), id);
    const prepared = (await prepareTask(root, join(root, "hq/product"), id))!;
    expect(prepared.startsWith(join(await realpath(tmpdir()), "morpheus-worktrees"))).toBe(true);
    expect((await cleanupTask(root, join(root, "hq/product"), id)).path).toBe(prepared);
    await expect(readFile(join(prepared, "implementation.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
