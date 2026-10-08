import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STALE_BEHIND_COMMITS,
  STALE_BEHIND_DAYS,
  buildSourceCandidates,
  divergentStaged,
  formatLag,
  githubRepo,
  lagSeverity,
  orphanBuildOutputs,
  pacificDate,
  parsePorcelain,
  rescueDirtyTrunk,
  shortHost,
  wipBranchName,
  type CommandRunner,
} from "../src/session/trunk-rescue.js";
import { inspectTrunkCheckout, trunkCheckoutFindings, type TrunkCheckoutReport } from "../src/session/trunk-health.js";
import { prepareRepository } from "../src/session/start.js";
import { startSession } from "../src/cli/session-start.js";
import { describeLocalChanges } from "../src/self.js";
import { RESCUED_TRUNK_PREFIX } from "../src/gh-manager/sweep.js";
import type { MorpheusInstallStatus } from "../src/self.js";

const exec = promisify(execFile);
const git = async (cwd: string, ...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
const NOW = new Date("2026-10-08T18:00:00Z"); // 11:00 Pacific, 2026-10-08
const DAY = 86_400_000;

describe("parsePorcelain", () => {
  it("splits -z output into tracked and untracked, skipping a rename's original path and ignored files", () => {
    const raw = [" M src/a.ts", "A  new.ts", "R  moved.ts", "old.ts", " D gone.ts", "?? notes.txt", "?? dist/x.js", "!! node_modules/y", ""].join("\0");
    expect(parsePorcelain(raw, true)).toEqual({
      tracked: ["src/a.ts", "new.ts", "moved.ts", "gone.ts"],
      untracked: ["notes.txt", "dist/x.js"],
    });
  });
  it("reads plain output, renames and quoted paths", () => {
    expect(parsePorcelain('MM a.ts\nR  old.ts -> new.ts\n?? "with space.txt"\n')).toEqual({
      tracked: ["a.ts", "new.ts"],
      untracked: ["with space.txt"],
    });
  });
  it("returns nothing for a clean checkout", () => {
    expect(parsePorcelain("", true)).toEqual({ tracked: [], untracked: [] });
  });
});

describe("orphan build output", () => {
  it("maps each compiled artefact to the sources it could have come from", () => {
    expect(buildSourceCandidates("dist/cli/old.js")).toEqual(["src/cli/old.ts", "src/cli/old.tsx", "src/cli/old.mts", "src/cli/old.cts", "src/cli/old.js"]);
    expect(buildSourceCandidates("dist/cli/old.d.ts.map")?.[0]).toBe("src/cli/old.ts");
    expect(buildSourceCandidates("dist/cli/old.d.ts")?.[0]).toBe("src/cli/old.ts");
    expect(buildSourceCandidates("dist/readme.md")).toBeNull();
    expect(buildSourceCandidates("src/dist/x.js")).toBeNull();
  });
  it("names only build output whose source is gone", async () => {
    const present = new Set(["src/kept.ts", "src/ui/view.tsx"]);
    const orphans = await orphanBuildOutputs("/unused", ["dist/kept.js", "dist/ui/view.js", "dist/gone.js", "dist/gone.js.map", "notes.txt", "dist/readme.md"], async (p) => present.has(p));
    expect(orphans).toEqual(["dist/gone.js", "dist/gone.js.map"]);
  });
  it("describes a dirty install source by kind, naming orphans as safe to delete", async () => {
    const message = await describeLocalChanges("/src", " M package.json\n?? dist/gone.js\n?? dist/kept.js\n?? scratch.txt\n", async (p) => p === "src/kept.ts");
    expect(message).toBe([
      "The source checkout /src has local changes; install from clean main.",
      "  Tracked edits (1) — on trunk, `morpheus context brief` there moves them to a wip/trunk-* draft PR:",
      "    package.json",
      "  Untracked build output whose source no longer exists (1) — safe to delete:",
      "    rm dist/gone.js",
      "  Other untracked files (2) — commit, move or delete them yourself:",
      "    dist/kept.js",
      "    scratch.txt",
    ].join("\n"));
  });
});

describe("lag thresholds", () => {
  const ago = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY - extraMs).toISOString();
  it("is current at zero, whatever the date", () => {
    expect(lagSeverity({ behind: 0, oldest: null }, NOW)).toBe("current");
  });
  it("turns stale one commit past the commit threshold, not at it", () => {
    expect(STALE_BEHIND_COMMITS).toBe(20);
    expect(lagSeverity({ behind: 20, oldest: ago(0) }, NOW)).toBe("behind");
    expect(lagSeverity({ behind: 21, oldest: ago(0) }, NOW)).toBe("stale");
  });
  it("turns stale once the oldest missing commit is more than the day threshold old", () => {
    expect(STALE_BEHIND_DAYS).toBe(3);
    expect(lagSeverity({ behind: 1, oldest: ago(3, DAY - 1) }, NOW)).toBe("behind"); // 3 days 23:59:59
    expect(lagSeverity({ behind: 1, oldest: ago(4) }, NOW)).toBe("stale");
  });
  it("words a stale checkout as an escalation and a merely behind one plainly", () => {
    expect(formatLag({ behind: 188, oldest: ago(23) }, "origin/main", NOW)).toEqual([
      `!!! STALE CHECKOUT: 188 commit(s) behind origin/main; the oldest missing commit landed 23 day(s) ago (${ago(23).slice(0, 10)}). Instructions and records read here are out of date.`,
    ]);
    expect(formatLag({ behind: 2, oldest: ago(1) }, "origin/main", NOW)[0]).toBe(
      `This checkout is 2 commit(s) behind origin/main; the oldest missing commit landed 1 day(s) ago (${ago(1).slice(0, 10)}).`,
    );
    expect(formatLag({ behind: 0, oldest: null }, "origin/main", NOW)).toEqual([]);
  });
});

describe("index states and remotes", () => {
  it("finds staged content that differs from both HEAD and the working tree", () => {
    const raw = ["MM both.ts", "AM added.ts", "AD gone.ts", "M  staged-only.ts", " M tree-only.ts", " A intent.ts", "RM new.ts", "old.ts", "?? u.txt", ""].join("\0");
    expect(divergentStaged(raw)).toEqual(["both.ts", "added.ts", "gone.ts", "new.ts"]);
  });
  it("reads owner/repo from GitHub remote URLs only", () => {
    expect(githubRepo("https://github.com/cpheinrich/morpheus.git")).toBe("cpheinrich/morpheus");
    expect(githubRepo("git@github.com:cpheinrich/morpheus.git")).toBe("cpheinrich/morpheus");
    expect(githubRepo("https://github.com/cpheinrich/morpheus")).toBe("cpheinrich/morpheus");
    expect(githubRepo("/tmp/remote.git")).toBeNull();
  });
});

describe("WIP branch naming", () => {
  it("dates in Pacific time and suffixes past names already taken", () => {
    expect(pacificDate(new Date("2026-10-08T05:00:00Z"))).toBe("2026-10-07");
    expect(shortHost("Chriss-MacBook-Pro.local")).toBe("chriss-macbook-pro");
    expect(shortHost("...")).toBe("host");
    const base = "wip/trunk-2026-10-08-box";
    expect(wipBranchName("2026-10-08", "box", new Set())).toBe(base);
    expect(wipBranchName("2026-10-08", "box", new Set([base]))).toBe(`${base}-2`);
    expect(wipBranchName("2026-10-08", "box", new Set([base, `${base}-2`]))).toBe(`${base}-3`);
    // The GitHub Manager recognises the branches this creates.
    expect(base.startsWith(RESCUED_TRUNK_PREFIX)).toBe(true);
  });
});

describe("rescuing a dirty trunk checkout", () => {
  let dir: string, remote: string, source: string, local: string;
  let gh: ReturnType<typeof vi.fn<CommandRunner>>;
  const deps = () => ({ runner: gh, hostname: "Box.local", now: NOW });
  const branchBase = "wip/trunk-2026-10-08-box";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "trunk-rescue-"));
    remote = join(dir, "remote.git"); source = join(dir, "author"); local = join(dir, "project");
    await git(dir, "init", "--bare", "-b", "main", remote);
    await git(dir, "init", "-b", "main", source);
    await git(source, "config", "user.email", "test@example.com");
    await git(source, "config", "user.name", "Test");
    await mkdir(join(source, ".agent"));
    await writeFile(join(source, "morpheus.json"), JSON.stringify({ name: "test", context: { trunk: "origin/main" } }));
    await writeFile(join(source, ".gitignore"), "local/\n");
    await writeFile(join(source, "CLAUDE.md"), "Instructions\n");
    await writeFile(join(source, ".agent/decisions.md"), "Decisions\n");
    await writeFile(join(source, ".agent/learned.md"), "Learned\n");
    await writeFile(join(source, "project.pbxproj"), "generated v1\n");
    await writeFile(join(source, "doomed.txt"), "delete me\n");
    await git(source, "add", "."); await git(source, "commit", "-m", "initial");
    await git(source, "remote", "add", "origin", remote); await git(source, "push", "origin", "main");
    await git(dir, "clone", "--branch", "main", remote, local);
    await git(local, "config", "user.email", "test@example.com"); await git(local, "config", "user.name", "Test");
    gh = vi.fn<CommandRunner>(async () => ({ code: 0, stdout: "https://github.com/o/r/pull/42\n", stderr: "" }));
  });
  afterEach(async () => { vi.restoreAllMocks(); await rm(dir, { recursive: true, force: true }); });

  async function advance(n: number) {
    for (let i = 0; i < n; i++) {
      await writeFile(join(source, "CLAUDE.md"), `Instructions v${i + 2}\n`);
      await git(source, "commit", "-am", `trunk ${i}`);
    }
    await git(source, "push", "origin", "main");
    return git(source, "rev-parse", "HEAD");
  }
  async function dirty() {
    await writeFile(join(local, "project.pbxproj"), "xcode rewrote this\n");
    await writeFile(join(local, "staged.txt"), "staged addition\n");
    await git(local, "add", "staged.txt");
    await rm(join(local, "doomed.txt"));
    await writeFile(join(local, "secret.env"), "TOKEN=never-commit\n");
    await mkdir(join(local, "dist"), { recursive: true });
    await writeFile(join(local, "dist/gone.js"), "orphan\n");
  }

  it("moves tracked edits to a pushed draft PR, leaves untracked files, then fast-forwards", async () => {
    await dirty();
    const latest = await advance(2);
    const result = await prepareRepository(local, false, deps());

    expect(result.advanced).toBe(true);
    expect(result.behind).toBe(0);
    expect(await git(local, "rev-parse", "HEAD")).toBe(latest);
    expect(await readFile(join(local, "CLAUDE.md"), "utf8")).toBe("Instructions v3\n");
    expect(await readFile(join(local, "project.pbxproj"), "utf8")).toBe("generated v1\n");
    // Untracked files are never committed or removed.
    expect(await readFile(join(local, "secret.env"), "utf8")).toBe("TOKEN=never-commit\n");
    expect(await readFile(join(local, "dist/gone.js"), "utf8")).toBe("orphan\n");

    const rescue = result.rescue!;
    expect(rescue.outcome).toBe("rescued");
    if (rescue.outcome !== "rescued") return;
    expect(rescue.wipBranch).toBe(branchBase);
    expect(rescue.pushed).toBe(true);
    expect(rescue.prUrl).toBe("https://github.com/o/r/pull/42");
    expect(rescue.lag.behind).toBe(2);
    expect(rescue.dirt.tracked.sort()).toEqual(["doomed.txt", "project.pbxproj", "staged.txt"]);
    expect(rescue.orphans).toEqual(["dist/gone.js"]);

    // The pushed branch holds exactly the rescued content, and nothing untracked.
    const pushed = `refs/heads/${branchBase}`;
    expect(await git(remote, "show", `${pushed}:project.pbxproj`)).toBe("xcode rewrote this");
    expect(await git(remote, "show", `${pushed}:staged.txt`)).toBe("staged addition");
    expect(await git(remote, "ls-tree", "--name-only", pushed)).not.toMatch(/doomed\.txt|secret\.env|dist/);
    expect(await git(remote, "log", "-1", "--format=%s", pushed)).toBe("WIP: uncommitted changes rescued from dirty main");

    expect(gh).toHaveBeenCalledTimes(1);
    const [command, args, cwd] = gh.mock.calls[0]!;
    expect(command).toBe("gh");
    expect(cwd).toBe(await realpath(local));
    expect(args.slice(0, 7)).toEqual(["pr", "create", "--draft", "--base", "main", "--head", branchBase]);
    expect(args[args.indexOf("--title") + 1]).toBe("WIP: uncommitted changes rescued from project main (2026-10-08)");
    const body = args[args.indexOf("--body") + 1]!;
    expect(body).toContain("2 commit(s) behind origin/main");
    expect(body).toContain("- `project.pbxproj`");
    expect(body).toContain("## Untracked files left in place");
    expect(body).toContain("- `secret.env`");
    expect(body).toContain("safe to delete:\n\n- `dist/gone.js`");
    expect(body).toContain("`check pr` conventions");
    expect(body).not.toContain("never-commit");
  });

  it("keeps a write that lands while the branch is pushed and the PR opened", async () => {
    await writeFile(join(local, "project.pbxproj"), "edit1\n");
    gh.mockImplementation(async () => {
      // An IDE autosave, or Xcode regenerating the project, during the network calls.
      await writeFile(join(local, "project.pbxproj"), "edit2-concurrent\n");
      return { code: 0, stdout: "https://github.com/o/r/pull/43\n", stderr: "" };
    });
    const rescue = (await prepareRepository(local, false, deps())).rescue!;
    expect(rescue.outcome).toBe("rescued");
    expect(await git(remote, "show", `refs/heads/${branchBase}:project.pbxproj`)).toBe("edit1");
    expect(await readFile(join(local, "project.pbxproj"), "utf8")).toBe("edit2-concurrent\n");
  });

  it("refuses staged content that differs from the working tree, changing nothing", async () => {
    await writeFile(join(local, "project.pbxproj"), "staged\n");
    await git(local, "add", "project.pbxproj");
    await writeFile(join(local, "project.pbxproj"), "worktree\n");
    const result = await prepareRepository(local, false, deps());
    expect(result.rescue).toMatchObject({ outcome: "skipped", reason: "project.pbxproj has staged content that differs from the working tree; commit or unstage it" });
    expect(await git(local, "show", ":project.pbxproj")).toBe("staged");
    expect(await readFile(join(local, "project.pbxproj"), "utf8")).toBe("worktree\n");
    expect(await git(local, "for-each-ref", "refs/heads/wip")).toBe("");
    expect(gh).not.toHaveBeenCalled();
  });

  it("leaves inbox replies on a trunk checkout for the session that reads them", async () => {
    await mkdir(join(source, "hq/team"), { recursive: true });
    await writeFile(join(source, "hq/team/chris.md"), "## ❗ 1. Q\n\n~\n");
    await git(source, "add", "."); await git(source, "commit", "-m", "inbox"); await git(source, "push", "origin", "main");
    await git(local, "pull", "--quiet", "--ff-only");
    await writeFile(join(local, "hq/team/chris.md"), "## ❗ 1. Q\n\n~ yes, do A\n");
    await writeFile(join(local, "project.pbxproj"), "mine\n");
    const result = await prepareRepository(local, false, deps());
    expect(result.rescue).toMatchObject({ outcome: "skipped", reason: "hq/team/chris.md has uncommitted edits, likely inbox replies; commit them on an inbox-<date> branch" });
    expect(await readFile(join(local, "hq/team/chris.md"), "utf8")).toBe("## ❗ 1. Q\n\n~ yes, do A\n");
    expect(await readFile(join(local, "project.pbxproj"), "utf8")).toBe("mine\n");
  });

  it("on a fork, opens the PR against the trunk remote's repository with an owner-qualified head", async () => {
    await git(local, "remote", "set-url", "origin", "https://github.com/fork-owner/project.git");
    await git(local, "remote", "set-url", "--push", "origin", remote);
    await git(local, "remote", "add", "upstream", "git@github.com:up-owner/project.git");
    await writeFile(join(local, "project.pbxproj"), "mine\n");
    const sha = await git(local, "rev-parse", "HEAD");
    const result = await rescueDirtyTrunk(local, { trunk: "upstream/main", branch: "main", sha }, deps());
    expect(result.outcome).toBe("rescued");
    const args = gh.mock.calls[0]![1];
    expect(args.slice(0, 9)).toEqual(["pr", "create", "--draft", "--repo", "up-owner/project", "--base", "main", "--head", `fork-owner:${branchBase}`]);
  });

  it("is idempotent within a day: a second rescue takes the next suffix", async () => {
    await writeFile(join(local, "project.pbxproj"), "first\n");
    await prepareRepository(local, false, deps());
    await writeFile(join(local, "project.pbxproj"), "second\n");
    const second = (await prepareRepository(local, false, deps())).rescue!;
    expect(second.outcome === "rescued" && second.wipBranch).toBe(`${branchBase}-2`);
    expect(await git(remote, "show", `refs/heads/${branchBase}:project.pbxproj`)).toBe("first");
    expect(await git(remote, "show", `refs/heads/${branchBase}-2:project.pbxproj`)).toBe("second");
  });

  it("keeps the edits on a local branch when the push fails, still resetting and fast-forwarding", async () => {
    await writeFile(join(local, "project.pbxproj"), "mine\n");
    const latest = await advance(1);
    await git(local, "remote", "set-url", "--push", "origin", join(dir, "missing.git"));
    const result = await prepareRepository(local, false, deps());
    const rescue = result.rescue!;
    expect(rescue.outcome === "rescued" && rescue.pushed).toBe(false);
    expect(gh).not.toHaveBeenCalled();
    expect(await git(local, "show", `refs/heads/${branchBase}:project.pbxproj`)).toBe("mine");
    expect(await git(local, "rev-parse", "HEAD")).toBe(latest);
  });

  it("does nothing mid-merge, and the stuck checkout is reported, not fast-forwarded", async () => {
    await writeFile(join(local, "project.pbxproj"), "mine\n");
    await advance(1);
    const before = await git(local, "rev-parse", "HEAD");
    await writeFile(join(local, ".git/MERGE_HEAD"), `${before}\n`);
    const result = await prepareRepository(local, false, deps());
    expect(result.rescue).toMatchObject({ outcome: "skipped", reason: "a merge is in progress" });
    expect(result.advanced).toBe(false);
    expect(result.behind).toBe(1);
    expect(await git(local, "rev-parse", "HEAD")).toBe(before);
    expect(await readFile(join(local, "project.pbxproj"), "utf8")).toBe("mine\n");
    expect(gh).not.toHaveBeenCalled();
  });

  it("refuses a branch other than trunk when called directly", async () => {
    await git(local, "checkout", "-b", "feature");
    await writeFile(join(local, "project.pbxproj"), "mine\n");
    const result = await rescueDirtyTrunk(local, { trunk: "origin/main", branch: "main", sha: await git(local, "rev-parse", "HEAD") }, deps());
    expect(result).toMatchObject({ outcome: "skipped", reason: "HEAD is feature, not the trunk branch main" });
    expect(await readFile(join(local, "project.pbxproj"), "utf8")).toBe("mine\n");
  });

  it("does not touch a task branch at session start", async () => {
    await git(local, "checkout", "-b", "mo-26-10-08-04.06.59-task");
    await writeFile(join(local, "project.pbxproj"), "task work\n");
    await advance(1);
    const result = await prepareRepository(local, false, deps());
    expect(result.rescue).toBeUndefined();
    expect(await readFile(join(local, "project.pbxproj"), "utf8")).toBe("task work\n");
  });

  it("fast-forwards past untracked files alone, and reports when one would be overwritten", async () => {
    await writeFile(join(local, "notes.txt"), "mine\n");
    const latest = await advance(1);
    expect((await prepareRepository(local, false, deps())).advanced).toBe(true);
    expect(await git(local, "rev-parse", "HEAD")).toBe(latest);

    await writeFile(join(source, "clash.txt"), "trunk\n");
    await git(source, "add", "clash.txt"); await git(source, "commit", "-m", "clash"); await git(source, "push", "origin", "main");
    await writeFile(join(local, "clash.txt"), "local\n");
    const blocked = await prepareRepository(local, false, deps());
    expect(blocked.advanced).toBe(false);
    expect(blocked.fastForwardError).toMatch(/untracked working tree files would be overwritten/);
    expect(await readFile(join(local, "clash.txt"), "utf8")).toBe("local\n");
  });

  it("prints one line naming what moved and the PR at session start", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await writeFile(join(local, "project.pbxproj"), "mine\n");
    const morpheus: MorpheusInstallStatus = { source: "copied", kind: "package", relation: "current", fresh: true, installedSha: null, remoteSha: null };
    expect(await startSession(local, {}, { morpheus, rescue: deps() })).toBe(0);
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("Moved 1 uncommitted tracked file(s) from dirty trunk to draft PR https://github.com/o/r/pull/42; trunk reset to its last commit.");
  });

  describe("fleet report", () => {
    it("reports a dirty, stale trunk checkout against the remote tip, read-only", async () => {
      await writeFile(join(local, "project.pbxproj"), "mine\n");
      await mkdir(join(local, "dist"), { recursive: true });
      await writeFile(join(local, "dist/gone.js"), "orphan\n");
      const tip = await advance(STALE_BEHIND_COMMITS + 1);
      await git(local, "fetch", "--quiet", "origin", `main:refs/morpheus/probe`);
      const report = (await inspectTrunkCheckout(local, { remote: "origin", branch: "main" }, tip))!;
      expect(report).toMatchObject({ onTrunk: true, measuredAgainst: "remote-tip", remoteTipUnfetched: false });
      expect(report.lag?.behind).toBe(STALE_BEHIND_COMMITS + 1);
      const findings = trunkCheckoutFindings(report, new Date());
      expect(findings.map((f) => f.message.slice(0, 40))).toEqual([
        "Trunk checkout has 1 uncommitted tracked",
        `Trunk checkout is ${STALE_BEHIND_COMMITS + 1} commit(s) behind or`,
        "Untracked build output whose source no l",
      ]);
      expect(findings[2]!.message).toContain("rm dist/gone.js");
      // Read-only: nothing moved.
      expect(await readFile(join(local, "project.pbxproj"), "utf8")).toBe("mine\n");
    });

    it("falls back to the cached ref and says the remote has moved past it", async () => {
      const tip = await advance(STALE_BEHIND_COMMITS + 1);
      const report = (await inspectTrunkCheckout(local, { remote: "origin", branch: "main" }, tip))!;
      expect(report).toMatchObject({ measuredAgainst: "cached-ref", remoteTipUnfetched: true });
      expect(report.lag?.behind).toBe(0);
      expect(trunkCheckoutFindings(report, new Date())).toEqual([]);
    });
  });
});

describe("trunk checkout findings", () => {
  const base: TrunkCheckoutReport = {
    branch: "main", trunk: "origin/main", onTrunk: true, dirt: { tracked: [], untracked: [] }, orphans: [],
    lag: { behind: 0, oldest: null }, measuredAgainst: "remote-tip", cachedAt: null, remoteTipUnfetched: false,
  };
  it("says nothing about a clean, current trunk checkout or a task branch", () => {
    expect(trunkCheckoutFindings(base, NOW)).toEqual([]);
    expect(trunkCheckoutFindings({ ...base, onTrunk: false, branch: "task", dirt: { tracked: ["a"], untracked: [] }, lag: { behind: 500, oldest: "2026-01-01T00:00:00Z" } }, NOW)).toEqual([]);
  });
  it("stays quiet at the commit threshold and speaks one past it, naming a stale cache", () => {
    const at = { ...base, lag: { behind: STALE_BEHIND_COMMITS, oldest: NOW.toISOString() } };
    expect(trunkCheckoutFindings(at, NOW)).toEqual([]);
    const past = { ...base, lag: { behind: STALE_BEHIND_COMMITS + 1, oldest: NOW.toISOString() }, measuredAgainst: "cached-ref" as const, cachedAt: "2026-09-15T10:00:00-07:00" };
    expect(trunkCheckoutFindings(past, NOW)).toEqual([{
      severity: "warning",
      message: `Trunk checkout is 21 commit(s) behind origin/main, missing trunk work since 2026-10-08 (0 day(s)) — past the 20-commit / 3-day threshold. Sessions started there read stale instructions; run \`morpheus context brief\` in it. Measured against the cached origin/main as of 2026-09-15; it may be staler than the remote.`,
    }]);
  });
  it("reports an unmeasurable checkout only when the remote answered", () => {
    const none = { ...base, lag: null, measuredAgainst: "none" as const };
    expect(trunkCheckoutFindings(none, NOW)).toEqual([]);
    expect(trunkCheckoutFindings({ ...none, remoteTipUnfetched: true }, NOW)[0]?.message).toContain("the remote tip has never been fetched here");
  });
});
