import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { trunkChanges } from "../src/cli/check.js";
import { parseTrunk, resolveTrunk, trunkLog, trunkSha } from "../src/session/git.js";

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

describe("resolving the trunk", () => {
  it("splits a declared remote/branch, and defaults the remote", () => {
    expect(parseTrunk("upstream/main")).toEqual({ remote: "upstream", branch: "main" });
    expect(parseTrunk("origin/release/v2")).toEqual({ remote: "origin", branch: "release/v2" });
    // A bare name is a branch on `origin`, not a remote with no branch.
    expect(parseTrunk("trunk")).toEqual({ remote: "origin", branch: "trunk" });
  });

  it("prefers a declared trunk over anything it could infer", async () => {
    // `origin` is not always canonical: on a fork it is the fork, whose main
    // sits still while the real trunk moves — and the lease would certify
    // `fresh` the whole time.
    const root = await mkdtemp(join(tmpdir(), "morpheus-trunk-"));
    git(root, "init", "-q", "-b", "main");
    expect(await resolveTrunk(root, "upstream/main")).toEqual({
      remote: "upstream",
      branch: "main",
    });
  });

  it("falls back to origin/main when nothing is declared or inferable", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-trunk-"));
    git(root, "init", "-q", "-b", "main");
    expect(await resolveTrunk(root)).toEqual({ remote: "origin", branch: "main" });
  });
});

describe("observing the trunk", () => {
  it("tells a ref that does not exist from a remote that cannot be reached", async () => {
    // These rode one `null` channel, and the whole `fresh` verdict turns on
    // this field: a repo whose default branch is not `main` was permanently
    // `unknown`, with `pm claim` refused forever and a message blaming a
    // network that was fine.
    const upstream = await mkdtemp(join(tmpdir(), "morpheus-remote-"));
    git(upstream, "init", "-q", "--bare", "-b", "main");

    const root = await mkdtemp(join(tmpdir(), "morpheus-trunk-"));
    git(root, "init", "-q", "-b", "main");
    await commit(root, "a.md", "a", "root");
    git(root, "remote", "add", "origin", upstream);
    git(root, "push", "-q", "origin", "main");

    expect(await trunkSha(root, { remote: "origin", branch: "main" })).toEqual({
      sha: git(root, "rev-parse", "HEAD"),
    });

    // Present remote, absent ref — `ls-remote` exits 0 with no output without
    // `--exit-code`, which is what made this indistinguishable from offline.
    expect(await trunkSha(root, { remote: "origin", branch: "master" })).toEqual({
      sha: null,
      reason: "missing",
    });

    // No such remote at all.
    expect(await trunkSha(root, { remote: "nope", branch: "main" })).toEqual({
      sha: null,
      reason: "unreachable",
    });
  });
});

describe("reading the trunk", () => {
  it("tells an empty range from a trunk it could not read", async () => {
    // These shared one `[]` — the same null/[] split `doctor`'s `gitLines` was
    // given, unapplied one module over. The caller turned it into "nothing on
    // the trunk you do not have", which is the most reassuring sentence
    // available for a question that was never answered, in the branch added to
    // stop a fail-open.
    const upstream = await mkdtemp(join(tmpdir(), "morpheus-bare-"));
    git(upstream, "init", "-q", "--bare", "-b", "main");

    const root = await mkdtemp(join(tmpdir(), "morpheus-trunklog-"));
    git(root, "init", "-q", "-b", "main");
    await commit(root, "a.md", "a", "root");
    git(root, "remote", "add", "origin", upstream);
    git(root, "push", "-q", "origin", "main");
    const sha = git(root, "rev-parse", "HEAD");

    const trunk = { remote: "origin", branch: "main" };
    // Genuinely nothing in the range — an empty array, not null.
    expect(await trunkLog(root, trunk, sha, sha)).toEqual([]);

    // A remote that cannot be fetched: null, not "nothing landed".
    expect(await trunkLog(root, { remote: "nope", branch: "main" }, sha, sha)).toBeNull();

    // A range git cannot resolve: also null.
    expect(await trunkLog(root, trunk, sha, "0".repeat(40))).toBeNull();
  });

  it("lists what is on the trunk and not in this branch", async () => {
    const upstream = await mkdtemp(join(tmpdir(), "morpheus-bare-"));
    git(upstream, "init", "-q", "--bare", "-b", "main");

    const root = await mkdtemp(join(tmpdir(), "morpheus-trunklog-"));
    git(root, "init", "-q", "-b", "main");
    await commit(root, "a.md", "a", "root");
    git(root, "remote", "add", "origin", upstream);
    git(root, "push", "-q", "origin", "main");

    // Someone else moves the trunk.
    const other = await mkdtemp(join(tmpdir(), "morpheus-other-"));
    git(other, "clone", "-q", upstream, ".");
    await commit(other, "b.md", "b", "landed while you were away");
    git(other, "push", "-q", "origin", "main");
    const head = git(other, "rev-parse", "HEAD");

    const log = await trunkLog(root, { remote: "origin", branch: "main" }, "HEAD", head);
    expect(log).not.toBeNull();
    expect(log?.join("\n")).toContain("landed while you were away");
  });
});
