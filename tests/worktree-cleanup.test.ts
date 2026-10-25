import * as fs from "node:fs/promises";
import * as sessionStart from "../src/session/start.js";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, rmdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupTask, pruneStaleWorktrees } from "../src/pm/cleanup.js";
import { worktrees } from "../src/cli/pm.js";
import { bindTask, prepareTask } from "../src/session/tasks.js";
import { sessionId } from "../src/session/policy.js";
import { writeLease } from "../src/session/store.js";

vi.mock("node:fs/promises", async importOriginal => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
}));

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

async function generatedReceipt(worktree = target): Promise<void> {
  await writeFile(join(root, ".git/info/exclude"), "local/\n");
  const result = await writeLease(target, sessionId(target), {
    version: 1,
    receipt: { version: 1, id: "test", createdAt: "2026-10-13T00:00:00Z", remoteSha: merge,
      branch, worktree, inputs: [] },
    checkedAt: "2026-10-13T00:00:00Z", status: "fresh", changedInputs: [],
  });
  expect(result.written).toBe(true);
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
    await rm(path, { recursive: true, force: true });
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

  it("removes only a valid Morpheus receipt in local/sessions", async () => {
    await generatedReceipt();
    await cleanupTask(root, join(root, "hq/product"), id);
    await expect(readFile(join(target, "local/sessions", `${sessionId(target)}.json`))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("retains unrelated local data beside a valid receipt", async () => {
    await generatedReceipt();
    await writeFile(join(target, "local", "notes.txt"), "preserve me\n");
    await expect(cleanupTask(root, join(root, "hq/product"), id)).rejects.toThrow("Dirty worktree");
    expect(await readFile(join(target, "local", "notes.txt"), "utf8")).toBe("preserve me\n");
  });

  it("retains a receipt whose claimed worktree does not match its checkout", async () => {
    await generatedReceipt(root);
    await expect(cleanupTask(root, join(root, "hq/product"), id)).rejects.toThrow("Dirty worktree");
    expect(await git(root, "worktree", "list", "--porcelain")).toContain(target);
  });

  it("retains a malformed generated receipt", async () => {
    await generatedReceipt();
    await writeFile(join(target, "local/sessions", `${sessionId(target)}.json`), "not JSON\n");
    await expect(cleanupTask(root, join(root, "hq/product"), id)).rejects.toThrow("Dirty worktree");
    expect(await git(root, "worktree", "list", "--porcelain")).toContain(target);
  });

  it("retains a symlink at the generated receipt path", async () => {
    await generatedReceipt();
    const receipt = join(target, "local/sessions", `${sessionId(target)}.json`);
    await writeFile(join(dir, "external.json"), await readFile(receipt));
    await rm(receipt);
    await symlink(join(dir, "external.json"), receipt);
    await expect(cleanupTask(root, join(root, "hq/product"), id)).rejects.toThrow("Dirty worktree");
    expect(await readFile(join(dir, "external.json"), "utf8")).toContain('"version": 1');
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

  it("retains a clean worktree bound to another session", async () => {
    await bindTask(target, id, "another-active-session");
    await expect(cleanupTask(root, join(root, "hq/product"), id)).rejects.toThrow("Another session is bound");
    expect(await git(root, "worktree", "list", "--porcelain")).toContain(target);
    expect(await git(root, "ls-remote", "--heads", "origin", `refs/heads/${branch}`)).toContain(branch);
    await cleanupTask(root, join(root, "hq/product"), id, false, true);
    expect(await git(root, "worktree", "list", "--porcelain")).not.toContain(target);
  });

  it("retains a clean worktree held open by another process", async () => {
    await bindTask(target, id, "another-active-session");
    const process = spawn("sleep", ["30"], { cwd: target });
    await once(process, "spawn");
    try {
      await expect(cleanupTask(root, join(root, "hq/product"), id, false, true)).rejects.toThrow("A process is using");
      expect(await git(root, "worktree", "list", "--porcelain")).toContain(target);
    } finally {
      process.kill();
      await once(process, "exit");
    }
  });

  it("removes an unclaimed prepared temp checkout only with its marker and trunk proof", async () => {
    await cleanupTask(root, join(root, "hq/product"), id);
    const prepared = (await prepareTask(root, join(root, "hq/product"), id))!;
    expect(prepared.startsWith(join(await realpath(tmpdir()), "morpheus-worktrees"))).toBe(true);
    expect((await cleanupTask(root, join(root, "hq/product"), id)).path).toBe(prepared);
    await expect(readFile(join(prepared, "implementation.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("missing worktree registration pruning", () => {
  it("prunes a missing directory through the CLI while retaining its branch", async () => {
    await rm(target, { recursive: true });
    expect(await worktrees(root, "prune")).toBe(0);
    expect(await git(root, "worktree", "list", "--porcelain")).not.toContain(target);
    expect(await git(root, "rev-parse", `refs/heads/${branch}`)).toBe(head);
    expect(await git(root, "ls-remote", "--heads", "origin", `refs/heads/${branch}`)).toBe(`${head}\trefs/heads/${branch}`);
  });

  it("prunes missing registrations even when another registered directory is no longer a checkout", async () => {
    const broken = join(dir, "surviving-directory");
    await git(root, "worktree", "add", "-b", "surviving-branch", broken);
    await rm(join(broken, ".git"));
    await writeFile(join(broken, "notes.txt"), "preserve surviving data\n");
    await rm(target, { recursive: true });
    expect(await worktrees(root, "prune")).toBe(0);
    const listing = await git(root, "worktree", "list", "--porcelain");
    expect(listing).not.toContain(target);
    expect(listing).toContain(broken);
    expect(await readFile(join(broken, "notes.txt"), "utf8")).toBe("preserve surviving data\n");
    expect(await git(root, "rev-parse", `refs/heads/${branch}`)).toBe(head);
    expect(await git(root, "rev-parse", "refs/heads/surviving-branch")).toBe(merge);
  });

  it("preserves a live dirty checkout while pruning a different missing registration", async () => {
    const live = join(dir, "live-checkout");
    await git(root, "worktree", "add", "-b", "live-branch", live);
    await writeFile(join(live, "notes.txt"), "unfinished work\n");
    await rm(target, { recursive: true });
    expect(await pruneStaleWorktrees(root)).toBe(`Pruned: ${target} (branch retained)`);
    const listing = await git(root, "worktree", "list", "--porcelain");
    expect(listing).not.toContain(target);
    expect(listing).toContain(live);
    expect(await readFile(join(live, "notes.txt"), "utf8")).toBe("unfinished work\n");
    expect(await git(root, "rev-parse", "refs/heads/live-branch")).toBe(merge);
    expect(await git(root, "rev-parse", `refs/heads/${branch}`)).toBe(head);
  });

  it("does not prune an existing directory with a missing .git file", async () => {
    await rm(join(target, ".git"));
    expect(await pruneStaleWorktrees(root)).toBe("");
    expect(await git(root, "worktree", "list", "--porcelain")).toContain(target);
    expect(await readFile(join(target, "implementation.txt"), "utf8")).toBe("implemented\n");
    expect(await git(root, "rev-parse", `refs/heads/${branch}`)).toBe(head);
  });

  it("dry-runs missing registrations without changing registrations or refs", async () => {
    await rm(target, { recursive: true });
    const before = await git(root, "worktree", "list", "--porcelain");
    expect(await worktrees(root, "prune", true)).toBe(0);
    expect(await git(root, "worktree", "list", "--porcelain")).toBe(before);
    expect(await git(root, "rev-parse", `refs/heads/${branch}`)).toBe(head);
  });

  it("never deletes a checkout restored immediately before the pruning mutation", async () => {
    await writeFile(join(root, ".git/info/exclude"), "private.txt\n");
    await writeFile(join(target, "private.txt"), "irreplaceable ignored data\n");
    const parked = `${target}-parked`;
    await fs.rename(target, parked);
    let restored = false;
    const restore = async () => {
      if (!restored) { await fs.rename(parked, target); restored = true; }
    };
    const originalGit = sessionStart.sessionGit;
    const originalRm = fs.rm;
    // Cover both the old directory-removing primitive and metadata-only pruning,
    // restoring AFTER all absence checks, immediately before mutation executes.
    const gitSpy = vi.spyOn(sessionStart, "sessionGit").mockImplementation(async (cwd, args, trim) => {
      if (args[0] === "worktree" && args[1] === "remove") await restore();
      return originalGit(cwd, args, trim);
    });
    const rmSpy = vi.spyOn(fs, "rm").mockImplementation(async (path, options) => {
      await restore();
      return originalRm(path, options);
    });
    try {
      await pruneStaleWorktrees(root);
      expect(restored).toBe(true);
      expect(await readFile(join(target, "private.txt"), "utf8")).toBe("irreplaceable ignored data\n");
      expect(await readFile(join(target, "implementation.txt"), "utf8")).toBe("implemented\n");
      expect(await git(root, "rev-parse", `refs/heads/${branch}`)).toBe(head);
      expect(await git(root, "ls-remote", "--heads", "origin", `refs/heads/${branch}`)).toBe(`${head}\trefs/heads/${branch}`);
    } finally {
      gitSpy.mockRestore();
      rmSpy.mockRestore();
      if (!restored) await restore();
    }
  });

  it("preserves locked missing registrations", async () => {
    await git(root, "worktree", "lock", "--reason", "offline disk", target);
    await rm(target, { recursive: true });
    try {
      expect(await pruneStaleWorktrees(root)).toBe("");
      expect(await git(root, "worktree", "list", "--porcelain")).toContain("locked offline disk");
      expect(await git(root, "rev-parse", `refs/heads/${branch}`)).toBe(head);
    } finally {
      await git(root, "worktree", "unlock", target);
    }
  });
});
