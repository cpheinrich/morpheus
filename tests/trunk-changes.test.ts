import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { trunkChanges } from "../src/cli/check.js";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@e",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@e",
    },
  }).trim();
}

async function commit(root: string, path: string, body: string, message: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), body, "utf8");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", message);
}

/**
 * A repo shaped like a PR: `main` and a feature branch that forked from it,
 * with commits on both sides after the fork.
 */
async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "morpheus-trunk-"));
  git(root, "init", "-q", "-b", "main");
  await commit(root, ".agent-decisions.seed", "start", "root");

  git(root, "checkout", "-q", "-b", "feature");
  await commit(root, "src/thing.ts", "work", "feature work");

  git(root, "checkout", "-q", "main");
  await commit(root, "decisions.md", "another agent decided otherwise", "trunk moves");

  git(root, "checkout", "-q", "feature");
  return root;
}

describe("trunkChanges", () => {
  // `trunkChanges` reads the process's cwd, and vitest shares one process
  // across files — leaving it in a temp repo would silently retarget every
  // later test that shells out to git.
  const cwd = process.cwd();
  afterEach(() => process.chdir(cwd));

  it("names what landed on the base after this branch forked", async () => {
    const root = await repo();
    process.chdir(root);

    expect(trunkChanges("main")).toEqual(["decisions.md"]);
  });

  it("still sees the trunk from a merge ref, which is what CI checks out", async () => {
    // The defect this test exists for: on `pull_request`, GitHub checks out
    // `refs/pull/N/merge` — a merge commit whose *first parent is the base
    // tip*. `HEAD...base` therefore has merge-base == base and is empty every
    // single time, so the check reported a clean trunk forever and looked
    // like it was working.
    const root = await repo();
    const merge = git(root, "rev-parse", "HEAD");
    git(root, "checkout", "-q", "--detach", "main");
    git(root, "merge", "-q", "--no-ff", "-m", "merge pr", merge);
    process.chdir(root);

    // HEAD^1 is main, HEAD^2 is the PR head. Deriving from HEAD gives [].
    expect(git(root, "rev-parse", "HEAD^1")).toBe(git(root, "rev-parse", "main"));
    expect(trunkChanges("main")).toEqual(["decisions.md"]);
  });

  it("is empty when the base has not moved, and says so by being empty", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-trunk-"));
    git(root, "init", "-q", "-b", "main");
    await commit(root, "a.md", "a", "root");
    git(root, "checkout", "-q", "-b", "feature");
    await commit(root, "src/b.ts", "b", "work");
    process.chdir(root);

    expect(trunkChanges("main")).toEqual([]);
  });

  it("returns nothing rather than throwing when the base does not resolve", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-trunk-"));
    git(root, "init", "-q", "-b", "main");
    await commit(root, "a.md", "a", "root");
    process.chdir(root);

    expect(trunkChanges("origin/nonexistent")).toEqual([]);
  });
});
