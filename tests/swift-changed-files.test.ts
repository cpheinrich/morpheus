import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { changedSwiftArguments, scriptPath } from "../src/ios/changed-swift.js";

const execFileAsync = promisify(execFile);

/**
 * One definition of "the Swift files this change touched", exercised the two
 * ways it is asked.
 *
 * The cases are not hypothetical. A consumer reimplemented this selection and
 * drifted inside a single commit (darwin-health/evo#281): a pathspec without
 * `:(glob)`, which omits a Swift file sitting directly under the working
 * directory, and no `-z`, which drops a filename outside ASCII through
 * `core.quotePath`. Both produce a local "clean" that CI contradicts, and both
 * are invisible until someone compares two lists by hand. These assertions are
 * that comparison, run every time.
 */

const SCRIPT = scriptPath();

async function git(repo: string, ...argv: string[]): Promise<void> {
  await execFileAsync("git", argv, { cwd: repo });
}

async function select(repo: string, argv: string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("bash", [SCRIPT, ...argv], { cwd: repo });
  return stdout.split("\0").filter((path) => path.length > 0).sort();
}

/**
 * A repository whose last commit touches the three shapes that have gone wrong:
 * a nested source, a source directly under the working directory, and a
 * filename outside ASCII. `Legacy.swift` predates the commit and must never be
 * selected — the gate is incremental by design.
 */
async function repositoryWithChangedSwift(): Promise<{ root: string; repo: string }> {
  const root = await mkdtemp(join(tmpdir(), "morpheus-swift-selection-"));
  const repo = join(root, "repo");
  await mkdir(join(repo, "apps/ios/Nested"), { recursive: true });
  await git(root, "init", "--quiet", "--initial-branch=main", repo);
  await git(repo, "config", "user.name", "Morpheus Test");
  await git(repo, "config", "user.email", "test@example.com");

  await writeFile(join(repo, "apps/ios/Legacy.swift"), "let legacy = 1\n", "utf8");
  await git(repo, "add", ".");
  await git(repo, "commit", "--quiet", "-m", "baseline");

  await writeFile(join(repo, "apps/ios/Nested/Deep.swift"), "let deep = 1\n", "utf8");
  await writeFile(join(repo, "apps/ios/Top.swift"), "let top = 1\n", "utf8");
  await writeFile(join(repo, "apps/ios/Café.swift"), "let cafe = 1\n", "utf8");
  await git(repo, "add", ".");
  await git(repo, "commit", "--quiet", "-m", "change Swift");
  return { root, repo };
}

const CHANGED = ["apps/ios/Café.swift", "apps/ios/Nested/Deep.swift", "apps/ios/Top.swift"];

describe("swift-changed-files", () => {
  it("gives CI and a developer the same list for the same change", async () => {
    const { root, repo } = await repositoryWithChangedSwift();
    try {
      // What CI asks: the commit against its first parent.
      const commitMode = await select(repo, changedSwiftArguments({ workingDirectory: "apps/ios" }));
      // What a developer asks: everything since the branch left the trunk. The
      // branch here is one commit past `main`'s first commit, so the answers
      // must agree — and if either caller's pathspec or delimiter drifts, they
      // stop agreeing here rather than in somebody's pull request.
      await git(repo, "branch", "trunk", "HEAD~1");
      const baseMode = await select(
        repo,
        changedSwiftArguments({ workingDirectory: "apps/ios", base: "trunk" }),
      );

      expect(commitMode).toEqual(CHANGED);
      expect(baseMode).toEqual(commitMode);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("selects a Swift file directly under the working directory", async () => {
    const { root, repo } = await repositoryWithChangedSwift();
    try {
      // The `:(glob)` case. Without it `**/` has no zero-directory meaning and
      // `apps/ios/Top.swift` is silently skipped.
      expect(await select(repo, changedSwiftArguments({ workingDirectory: "apps/ios" })))
        .toContain("apps/ios/Top.swift");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps a filename outside ASCII", async () => {
    const { root, repo } = await repositoryWithChangedSwift();
    try {
      // The `-z` case. `core.quotePath` would otherwise hand back
      // "apps/ios/Caf\303\251.swift", quoted and unopenable.
      await git(repo, "config", "core.quotePath", "true");
      expect(await select(repo, changedSwiftArguments({ workingDirectory: "apps/ios" })))
        .toContain("apps/ios/Café.swift");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("leaves untouched sources alone, in both modes", async () => {
    const { root, repo } = await repositoryWithChangedSwift();
    try {
      await git(repo, "branch", "trunk", "HEAD~1");
      for (const argv of [
        changedSwiftArguments({ workingDirectory: "apps/ios" }),
        changedSwiftArguments({ workingDirectory: "apps/ios", base: "trunk" }),
      ]) {
        expect(await select(repo, argv)).not.toContain("apps/ios/Legacy.swift");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("adds uncommitted and untracked work only when asked", async () => {
    const { root, repo } = await repositoryWithChangedSwift();
    try {
      await git(repo, "branch", "trunk", "HEAD~1");
      await writeFile(join(repo, "apps/ios/Legacy.swift"), "let legacy = 2\n", "utf8");
      await writeFile(join(repo, "apps/ios/Untracked.swift"), "let untracked = 1\n", "utf8");

      const committed = await select(
        repo,
        changedSwiftArguments({ workingDirectory: "apps/ios", base: "trunk" }),
      );
      expect(committed).toEqual(CHANGED);

      const withWorktree = await select(
        repo,
        changedSwiftArguments({ workingDirectory: "apps/ios", base: "trunk", worktree: true }),
      );
      expect(withWorktree).toContain("apps/ios/Legacy.swift");
      expect(withWorktree).toContain("apps/ios/Untracked.swift");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("falls back to every tracked source when there is no first parent", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-swift-first-commit-"));
    const repo = join(root, "repo");
    try {
      await mkdir(join(repo, "apps/ios"), { recursive: true });
      await git(root, "init", "--quiet", "--initial-branch=main", repo);
      await git(repo, "config", "user.name", "Morpheus Test");
      await git(repo, "config", "user.email", "test@example.com");
      await writeFile(join(repo, "apps/ios/Only.swift"), "let only = 1\n", "utf8");
      await git(repo, "add", ".");
      await git(repo, "commit", "--quiet", "-m", "first");

      // A first commit has nothing to compare against, and a lint that checks
      // nothing is worse than one that checks everything — this is the one
      // place failing loud beats failing small.
      expect(await select(repo, changedSwiftArguments({ workingDirectory: "apps/ios" })))
        .toEqual(["apps/ios/Only.swift"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses a base it cannot resolve rather than reporting nothing to do", async () => {
    const { root, repo } = await repositoryWithChangedSwift();
    try {
      await expect(
        execFileAsync("bash", [SCRIPT, ...changedSwiftArguments({ workingDirectory: "apps/ios", base: "no-such-ref" })], { cwd: repo }),
      ).rejects.toThrow(/cannot resolve a merge base/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("answers the same from anywhere inside the repository", async () => {
    const { root, repo } = await repositoryWithChangedSwift();
    try {
      // An iOS agent works from the app directory — Evo's own instructions say
      // to cd there first. A pathspec is resolved against the process cwd, so
      // without moving to the top level this returns nothing and exits 0:
      // clean, confidently, about the wrong place.
      const fromRoot = await select(repo, changedSwiftArguments({ workingDirectory: "apps/ios" }));
      const { stdout } = await execFileAsync(
        "bash",
        [SCRIPT, ...changedSwiftArguments({ workingDirectory: "apps/ios" })],
        { cwd: join(repo, "apps/ios") },
      );
      expect(stdout.split("\0").filter((path) => path.length > 0).sort()).toEqual(fromRoot);
      expect(fromRoot).toEqual(CHANGED);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses to answer outside a repository", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-swift-no-repo-"));
    try {
      await expect(
        execFileAsync("bash", [SCRIPT, ...changedSwiftArguments({ workingDirectory: "apps/ios" })], { cwd: root }),
      ).rejects.toThrow(/not inside a git repository/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("names a file once when the branch changed it and it is still being edited", async () => {
    const { root, repo } = await repositoryWithChangedSwift();
    try {
      await git(repo, "branch", "trunk", "HEAD~1");
      await writeFile(join(repo, "apps/ios/Top.swift"), "let top = 2\n", "utf8");

      // The normal state of the loop --worktree exists for. Duplicated, every
      // diagnostic in the file is reported twice and the action's count
      // over-reports.
      const { stdout } = await execFileAsync(
        "bash",
        [SCRIPT, ...changedSwiftArguments({ workingDirectory: "apps/ios", base: "trunk", worktree: true })],
        { cwd: repo },
      );
      const paths = stdout.split("\0").filter((path) => path.length > 0);
      expect(paths.filter((path) => path === "apps/ios/Top.swift")).toHaveLength(1);
      expect(new Set(paths).size).toBe(paths.length);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("tolerates a trailing slash on the working directory", async () => {
    const { root, repo } = await repositoryWithChangedSwift();
    try {
      expect(await select(repo, changedSwiftArguments({ workingDirectory: "apps/ios/" }))).toEqual(CHANGED);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
