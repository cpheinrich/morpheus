import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STALE_BEHIND_COMMITS,
  STALE_BEHIND_DAYS,
  buildSourceCandidates,
  divergentStaged,
  formatLag,
  formatRescue,
  githubRepo,
  lagSeverity,
  orphanBuildOutputs,
  pacificDate,
  parsePorcelain,
  rescueDirtyTrunk,
  runCommand,
  shortHost,
  wipBranchName,
  type CommandResult,
  type CommandRunner,
  type RescueDeps,
} from "../src/session/trunk-rescue.js";
import { inspectTrunkCheckout, localRescueFinding, trunkCheckoutFindings, type TrunkCheckoutReport } from "../src/session/trunk-health.js";
import { prepareRepository } from "../src/session/start.js";
import { startSession } from "../src/cli/session-start.js";
import { describeLocalChanges } from "../src/self.js";
import { RESCUE_MAX_AGE_DAYS, RESCUED_TRUNK_PREFIX } from "../src/gh-manager/sweep.js";
import type { MorpheusInstallStatus } from "../src/self.js";

const exec = promisify(execFile);
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures/trunk-churn");
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
      "  Tracked edits (1) — on trunk, `morpheus context brief` there moves them to a wip/trunk-* branch:",
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
  it("reports a command that cannot start by its error, not a bare exit code", async () => {
    const result = await runCommand("morpheus-no-such-command-153755", ["repo", "view"], tmpdir());
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("spawn morpheus-no-such-command-153755 ENOENT");
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
  /** What `gh repo view <repo> --json visibility` answers. */
  let visibility: CommandResult;
  /** Every other `gh` call: `pr list` and `pr create`. */
  let prGh: CommandRunner;
  const deps = (): RescueDeps => ({ runner: gh, hostname: "Box.local", now: NOW, visibilityCache: false });
  const branchBase = "wip/trunk-2026-10-08-box";
  const prCalls = () => gh.mock.calls.filter((call) => call[1][0] === "pr");
  const visibilityCalls = () => gh.mock.calls.filter((call) => call[1][0] === "repo");
  const answer = (value: string): CommandResult => ({ code: 0, stdout: JSON.stringify({ visibility: value }), stderr: "" });
  /**
   * Point a remote at a GitHub URL that Git rewrites to a local bare repository, so the rescue
   * identifies a GitHub repository from config while fetch and push stay on this machine.
   */
  async function githubUrl(cwd: string, slug: string, path: string, key: "insteadOf" | "pushInsteadOf" = "insteadOf") {
    const url = `https://github.com/${slug}.git`;
    await git(cwd, "config", `url.${path}.${key}`, url);
    return url;
  }

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
    await git(local, "remote", "set-url", "origin", await githubUrl(local, "o/r", remote));
    // Private unless a test says otherwise, so the publishing path below is what it was before #452.
    visibility = answer("PRIVATE");
    prGh = async (_command, args) => {
      if (args[1] === "list") {
        if (args[args.indexOf("--state") + 1] !== "open") return { code: 1, stdout: "", stderr: "only open PRs can stand in for a rescue" };
        const head = args[args.indexOf("--head") + 1]!.split(":").pop()!;
        return { code: 0, stdout: JSON.stringify([{ url: "https://github.com/o/r/pull/42", headRefName: head }]), stderr: "" };
      }
      return { code: 0, stdout: "https://github.com/o/r/pull/42\n", stderr: "" };
    };
    gh = vi.fn<CommandRunner>(async (command, args, cwd) =>
      args[0] === "repo" && args[1] === "view" ? visibility : prGh(command, args, cwd));
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
    // Opted in to the GitHub Manager on trunk, so the body may promise the age-out.
    await mkdir(join(source, ".github"), { recursive: true });
    await writeFile(join(source, ".github/morpheus-gh-manager.json"), '{"version":1}\n');
    await git(source, "add", ".github");
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

    // Visibility is read first, for the one repository the remote names, then the draft is opened.
    expect(visibilityCalls().map((call) => call[1])).toEqual([["repo", "view", "github.com/o/r", "--json", "visibility"]]);
    expect(prCalls()).toHaveLength(1);
    const [command, args, cwd] = prCalls()[0]!;
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
    // The PR body states the manager's age-out without importing it; this holds the two equal.
    expect(body).toContain(`once it has gone ${RESCUE_MAX_AGE_DAYS} days without a push, the GitHub Manager closes it`);
    expect(body).not.toContain("never-commit");
  });

  it("promises the age-out only where trunk's GitHub Manager policy will close the draft", async () => {
    const body = () => { const args = gh.mock.calls.filter((c) => c[1][1] === "create").at(-1)![1]; return args[args.indexOf("--body") + 1]!; };
    await writeFile(join(local, "project.pbxproj"), "first\n");
    await prepareRepository(local, false, deps());
    expect(body()).not.toContain("GitHub Manager closes it");

    await mkdir(join(source, ".github"), { recursive: true });
    await writeFile(join(source, ".github/morpheus-gh-manager.json"), '{"version":1,"actions":{"close":false}}\n');
    await git(source, "add", ".github"); await git(source, "commit", "-m", "manager, closing off"); await git(source, "push", "origin", "main");
    await writeFile(join(local, "project.pbxproj"), "second\n");
    await prepareRepository(local, false, deps());
    expect(body()).not.toContain("GitHub Manager closes it");
    expect(gh.mock.calls.filter((c) => c[1][1] === "create")).toHaveLength(2);
  });

  it("keeps a write that lands while the branch is pushed and the PR opened", async () => {
    await writeFile(join(local, "project.pbxproj"), "edit1\n");
    prGh = (async () => {
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

  /** A fork: `origin` names the fork (pushes land in the local bare repository), `upstream` the base. */
  async function forkRemotes() {
    await git(local, "remote", "set-url", "origin", await githubUrl(local, "fork-owner/project", remote, "pushInsteadOf"));
    await git(local, "remote", "add", "upstream", "git@github.com:up-owner/project.git");
  }

  it("on a fork, opens the PR against the trunk remote's repository with an owner-qualified head", async () => {
    await forkRemotes();
    await writeFile(join(local, "project.pbxproj"), "mine\n");
    const sha = await git(local, "rev-parse", "HEAD");
    const result = await rescueDirtyTrunk(local, { trunk: "upstream/main", branch: "main", sha }, deps());
    expect(result.outcome).toBe("rescued");
    // Both the fork and the base repository were confirmed private before anything was published.
    expect(visibilityCalls().map((call) => call[1][2])).toEqual(["github.com/fork-owner/project", "github.com/up-owner/project"]);
    const args = prCalls()[0]![1];
    expect(args.slice(0, 9)).toEqual(["pr", "create", "--draft", "--repo", "up-owner/project", "--base", "main", "--head", `fork-owner:${branchBase}`]);
  });

  it("on a fork, keeps the rescue local when the base repository is public even though the fork is private", async () => {
    await forkRemotes();
    gh.mockImplementation(async (_command, args) => args[0] === "repo"
      ? answer(args[2] === "github.com/up-owner/project" ? "PUBLIC" : "PRIVATE")
      : { code: 0, stdout: "https://github.com/up-owner/project/pull/42\n", stderr: "" });
    await writeFile(join(local, "project.pbxproj"), "mine\n");
    const sha = await git(local, "rev-parse", "HEAD");
    const result = await rescueDirtyTrunk(local, { trunk: "upstream/main", branch: "main", sha }, deps());
    expect(result).toMatchObject({ outcome: "rescued", pushed: false, keptLocal: "up-owner/project is public" });
    expect(prCalls()).toEqual([]);
    expect(await git(remote, "for-each-ref", "refs/heads/wip")).toBe("");
  });

  it("on a fork, only dedupes a PR from the push remote's owner", async () => {
    await forkRemotes();
    prGh = async (_command, args) => args[1] === "list"
      ? args[args.indexOf("--head") + 1] === branchBase
        ? { code: 0, stdout: JSON.stringify([{ url: "https://github.com/up-owner/project/pull/42", headRefName: branchBase, headRepositoryOwner: { login: "fork-owner" } }]), stderr: "" }
        : { code: 1, stdout: "", stderr: "owner:branch syntax not supported" }
      : { code: 0, stdout: "https://github.com/up-owner/project/pull/42\n", stderr: "" };
    await writeFile(join(local, "project.pbxproj"), "same edit\n");
    const sha = await git(local, "rev-parse", "HEAD");
    await rescueDirtyTrunk(local, { trunk: "upstream/main", branch: "main", sha }, deps());
    await writeFile(join(local, "project.pbxproj"), "same edit\n");
    const second = await rescueDirtyTrunk(local, { trunk: "upstream/main", branch: "main", sha }, deps());
    expect(second).toMatchObject({ outcome: "duplicate", prUrl: "https://github.com/up-owner/project/pull/42" });
    const listArgs = prCalls()[1]![1];
    expect(listArgs).toContain("up-owner/project");
    expect(listArgs[listArgs.indexOf("--head") + 1]).toBe(branchBase);
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

  it("resets exact recurring Xcode churn without opening another rescue PR", async () => {
    await writeFile(join(local, "project.pbxproj"), "xcode canonical form\n");
    const first = (await prepareRepository(local, false, deps())).rescue!;
    expect(first.outcome).toBe("rescued");
    expect(await git(local, "rev-parse", `refs/remotes/origin/${branchBase}`)).toBe(await git(local, "rev-parse", `refs/heads/${branchBase}`));

    await writeFile(join(local, "project.pbxproj"), "xcode canonical form\n");
    const repeated = await prepareRepository(local, false, deps());
    expect(repeated.rescue).toMatchObject({ outcome: "duplicate", existingBranch: branchBase, prUrl: "https://github.com/o/r/pull/42" });
    expect(repeated.advanced).toBe(false);
    expect(await readFile(join(local, "project.pbxproj"), "utf8")).toBe("generated v1\n");
    expect(await git(local, "status", "--porcelain")).toBe("");
    expect(await git(local, "for-each-ref", "--format=%(refname:short)", "refs/heads/wip/trunk-*")).toBe(branchBase);
    expect(prCalls().map((call) => call[1].slice(0, 2))).toEqual([["pr", "create"], ["pr", "list"]]);
  });

  it("does not trust a stale remote-tracking ref after the branch is deleted remotely", async () => {
    await writeFile(join(local, "project.pbxproj"), "same edit\n");
    await prepareRepository(local, false, deps());
    await git(remote, "update-ref", "-d", `refs/heads/${branchBase}`);
    // The cached ref remains, but is not evidence of a current remote branch.
    expect(await git(local, "rev-parse", `refs/remotes/origin/${branchBase}`)).toBe(await git(local, "rev-parse", `refs/heads/${branchBase}`));
    await writeFile(join(local, "project.pbxproj"), "same edit\n");
    const second = (await prepareRepository(local, false, deps())).rescue!;
    expect(second.outcome === "rescued" && second.wipBranch).toBe(`${branchBase}-2`);
    expect(prCalls().map((call) => call[1].slice(0, 2))).toEqual([["pr", "create"], ["pr", "create"]]);
  });

  it("retries a draft PR when an earlier push succeeded but PR creation failed", async () => {
    prGh = async (_command, args) => args[1] === "list"
      ? { code: 0, stdout: "[]", stderr: "" }
      : prCalls().length === 1
        ? { code: 1, stdout: "", stderr: "GitHub unavailable" }
        : { code: 0, stdout: "https://github.com/o/r/pull/43\n", stderr: "" };
    await writeFile(join(local, "project.pbxproj"), "same edit\n");
    const first = (await prepareRepository(local, false, deps())).rescue!;
    expect(first.outcome === "rescued" && first.pushed).toBe(true);
    if (first.outcome === "rescued") expect(first.prError).toBe("GitHub unavailable");
    await writeFile(join(local, "project.pbxproj"), "same edit\n");
    const second = (await prepareRepository(local, false, deps())).rescue!;
    expect(second.outcome === "rescued" && second.wipBranch).toBe(`${branchBase}-2`);
    expect(prCalls().map((call) => call[1].slice(0, 2))).toEqual([["pr", "create"], ["pr", "list"], ["pr", "create"]]);
  });

  it("does not dedupe against a closed PR even when its remote branch remains", async () => {
    prGh = async (_command, args) => args[1] === "list"
      ? { code: 0, stdout: "[]", stderr: "" }
      : { code: 0, stdout: "https://github.com/o/r/pull/42\n", stderr: "" };
    await writeFile(join(local, "project.pbxproj"), "same edit\n");
    await prepareRepository(local, false, deps());
    await writeFile(join(local, "project.pbxproj"), "same edit\n");
    const second = (await prepareRepository(local, false, deps())).rescue!;
    expect(second.outcome === "rescued" && second.wipBranch).toBe(`${branchBase}-2`);
    expect(prCalls()[1]![1]).toContain("open");
  });

  /** A private repository whose push fails: the push URL names GitHub but leads nowhere. */
  async function unreachablePush() {
    await git(local, "remote", "set-url", "--push", "origin", await githubUrl(local, "o/r-push", join(dir, "missing.git")));
  }

  it("does not dedupe against a rescue that was never pushed", async () => {
    await writeFile(join(local, "project.pbxproj"), "same edit\n");
    await unreachablePush();
    const first = (await prepareRepository(local, false, deps())).rescue!;
    expect(first.outcome === "rescued" && first.pushed).toBe(false);
    expect(first.outcome === "rescued" && first.keptLocal).toBeUndefined();
    await git(local, "config", "--unset", "remote.origin.pushurl");
    await writeFile(join(local, "project.pbxproj"), "same edit\n");
    const second = (await prepareRepository(local, false, deps())).rescue!;
    expect(second.outcome === "rescued" && second.wipBranch).toBe(`${branchBase}-2`);
    expect(prCalls().map((call) => call[1].slice(0, 2))).toEqual([["pr", "create"]]);
  });

  it("preserves a distinct whitespace edit instead of using Git's whitespace-insensitive patch-id", async () => {
    await writeFile(join(local, "project.pbxproj"), "setting = one space\n");
    await prepareRepository(local, false, deps());
    await writeFile(join(local, "project.pbxproj"), "setting  = one space\n");
    const second = (await prepareRepository(local, false, deps())).rescue!;
    expect(second.outcome === "rescued" && second.wipBranch).toBe(`${branchBase}-2`);
    expect(await git(remote, "show", `refs/heads/${branchBase}-2:project.pbxproj`)).toBe("setting  = one space");
  });

  it("dedupes the same edit after trunk changed that file elsewhere, and still rescues a different one", async () => {
    const lines = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`);
    const notes = (edit: (l: string[]) => void) => { const copy = [...lines]; edit(copy); return `${copy.join("\n")}\n`; };
    await writeFile(join(source, "notes.md"), notes(() => {}));
    await git(source, "add", "notes.md"); await git(source, "commit", "-m", "notes"); await git(source, "push", "origin", "main");
    await git(local, "pull", "--quiet", "--ff-only");

    await writeFile(join(local, "notes.md"), notes((l) => { l[1] = "line 2, edited"; }));
    expect((await prepareRepository(local, false, deps())).rescue?.outcome).toBe("rescued");
    // Trunk then edits the same file far from the rescued hunk, so every blob id the old rescue
    // recorded is now stale: the exact-diff comparison this replaced missed exactly this.
    lines[10] = "line 11, from trunk";
    await writeFile(join(source, "notes.md"), notes(() => {}));
    await git(source, "commit", "-am", "trunk edits notes"); await git(source, "push", "origin", "main");
    expect((await prepareRepository(local, false, deps())).advanced).toBe(true);

    await writeFile(join(local, "notes.md"), notes((l) => { l[1] = "line 2, edited"; }));
    const repeated = await prepareRepository(local, false, deps());
    expect(repeated.rescue).toMatchObject({ outcome: "duplicate", existingBranch: branchBase, prUrl: "https://github.com/o/r/pull/42" });
    expect(await readFile(join(local, "notes.md"), "utf8")).toBe(notes(() => {}));

    await writeFile(join(local, "notes.md"), notes((l) => { l[1] = "line 2, edited differently"; }));
    const distinct = (await prepareRepository(local, false, deps())).rescue!;
    expect(distinct.outcome === "rescued" && distinct.wipBranch).toBe(`${branchBase}-2`);
    expect(prCalls().map((call) => call[1].slice(0, 2))).toEqual([["pr", "create"], ["pr", "list"], ["pr", "create"]]);
  });

  describe("IDE churn", () => {
    const PROJECT = "App.xcodeproj/project.pbxproj";
    const SCHEME = "App.xcodeproj/xcshareddata/xcschemes/App.xcscheme";
    const USER_STATE = "App.xcodeproj/project.xcworkspace/xcuserdata/c.xcuserdatad/UserInterfaceState.xcuserstate";
    const pbxproj = () => readFile(join(FIXTURES, "project.pbxproj"), "utf8");
    // What Xcode does to Evo's project on every open: re-sorts one build-settings dictionary.
    const resorted = async () => (await pbxproj()).replaceAll(
      "\t\t\t\tEVO_TELEMETRY_DISTRIBUTION = NO;\n\t\t\t\tEVO_DISPLAY_NAME = Evo;\n",
      "\t\t\t\tEVO_DISPLAY_NAME = Evo;\n\t\t\t\tEVO_TELEMETRY_DISTRIBUTION = NO;\n",
    );

    beforeEach(async () => {
      await mkdir(join(source, dirname(SCHEME)), { recursive: true });
      await mkdir(join(source, dirname(USER_STATE)), { recursive: true });
      await writeFile(join(source, PROJECT), await pbxproj());
      await writeFile(join(source, SCHEME), await readFile(join(FIXTURES, "compact.xcscheme"), "utf8"));
      await writeFile(join(source, USER_STATE), "window layout v1\n");
      await git(source, "add", "."); await git(source, "commit", "-m", "xcode project"); await git(source, "push", "origin", "main");
      await git(local, "pull", "--quiet", "--ff-only");
    });

    it("resets edits that are only churn, publishes nothing, fast-forwards and says so in one line", async () => {
      await writeFile(join(local, PROJECT), await resorted());
      await writeFile(join(local, SCHEME), await readFile(join(FIXTURES, "xcode.xcscheme"), "utf8"));
      await writeFile(join(local, USER_STATE), "window layout v2\n");
      await writeFile(join(local, "secret.env"), "TOKEN=never-commit\n");
      const latest = await advance(1);

      const result = await prepareRepository(local, false, deps());
      const rescue = result.rescue!;
      expect(rescue.outcome).toBe("churn");
      if (rescue.outcome !== "churn") return;
      expect(rescue.churn).toEqual([
        { path: PROJECT, kind: "format-only" },
        { path: USER_STATE, kind: "user-state" },
        { path: SCHEME, kind: "format-only" },
      ]);
      expect(gh).not.toHaveBeenCalled();
      expect(await git(local, "for-each-ref", "refs/heads/wip")).toBe("");
      expect(await git(remote, "for-each-ref", "refs/heads/wip")).toBe("");
      expect(result.advanced).toBe(true);
      expect(await git(local, "rev-parse", "HEAD")).toBe(latest);
      expect(await readFile(join(local, PROJECT), "utf8")).toBe(await pbxproj());
      expect(await git(local, "status", "--porcelain", "--untracked-files=no")).toBe("");
      // Untracked files are still never touched.
      expect(await readFile(join(local, "secret.env"), "utf8")).toBe("TOKEN=never-commit\n");
      // The reset edits stay reachable by the commit the report names.
      expect(await git(local, "show", `${rescue.commit}:${USER_STATE}`)).toBe("window layout v2");

      const lines = formatRescue(rescue, "origin/main");
      expect(lines[0]).toBe(`Reset 3 tracked file(s) of IDE churn on trunk instead of opening a rescue PR (2 formatting only, 1 IDE user state: ${PROJECT}, ${USER_STATE}, ${SCHEME}); recoverable with git checkout ${rescue.commit.slice(0, 12)} -- <path> until Git prunes it.`);
    });

    it("still rescues a real pbxproj edit, with the churn beside it, as before", async () => {
      await writeFile(join(local, PROJECT), (await resorted()).replace("EVO_APP_ENVIRONMENT = development;", "EVO_APP_ENVIRONMENT = staging;"));
      await writeFile(join(local, USER_STATE), "window layout v2\n");
      const rescue = (await prepareRepository(local, false, deps())).rescue!;
      expect(rescue.outcome).toBe("rescued");
      expect(rescue.dirt.tracked.sort()).toEqual([PROJECT, USER_STATE]);
      expect(await git(remote, "show", `refs/heads/${branchBase}:${PROJECT}`)).toContain("EVO_APP_ENVIRONMENT = staging;");
      expect(await git(remote, "show", `refs/heads/${branchBase}:${USER_STATE}`)).toBe("window layout v2");
      expect(prCalls()[0]![1].slice(0, 3)).toEqual(["pr", "create", "--draft"]);
    });

    it("still rescues a reordered build-phase array, which is behaviour rather than formatting", async () => {
      await writeFile(join(local, PROJECT), (await pbxproj()).replace(
        "\t\t\t\tB2000021 /* Sources */,\n\t\t\t\tB2000022 /* Run Script */,\n",
        "\t\t\t\tB2000022 /* Run Script */,\n\t\t\t\tB2000021 /* Sources */,\n",
      ));
      expect((await prepareRepository(local, false, deps())).rescue?.outcome).toBe("rescued");
    });

    it("refuses a file removed from the index but kept on disk, rather than resetting over it", async () => {
      // Untracking per-user state is the right thing to do, and the newer local file is the point.
      await git(local, "rm", "-r", "--cached", "--quiet", "App.xcodeproj/project.xcworkspace/xcuserdata");
      await writeFile(join(local, USER_STATE), "breakpoints I set today\n");
      const first = await prepareRepository(local, false, deps());
      expect(first.rescue).toMatchObject({ outcome: "skipped" });
      expect(first.rescue?.outcome === "skipped" && first.rescue.reason).toContain(`${USER_STATE} removed from the index but still on disk`);
      expect(await readFile(join(local, USER_STATE), "utf8")).toBe("breakpoints I set today\n");

      // Trunk stops tracking it too: the removal is now "on trunk", and still nothing is reset.
      await git(source, "rm", "-r", "--cached", "--quiet", "App.xcodeproj/project.xcworkspace/xcuserdata");
      await git(source, "commit", "-m", "untrack user state"); await git(source, "push", "origin", "main");
      const second = await prepareRepository(local, false, deps());
      expect(second.rescue?.outcome).toBe("skipped");
      expect(await readFile(join(local, USER_STATE), "utf8")).toBe("breakpoints I set today\n");
      expect(gh).not.toHaveBeenCalled();
      expect(await git(local, "for-each-ref", "refs/heads/wip")).toBe("");
    });

    it("does not call an edit 'on trunk' when local trunk commits stop the fast-forward", async () => {
      await writeFile(join(local, "CLAUDE.md"), "local trunk commit\n");
      await git(local, "commit", "-qam", "unpushed");
      await writeFile(join(source, "project.pbxproj"), "generated v2\n");
      await git(source, "commit", "-am", "trunk edit"); await git(source, "push", "origin", "main");
      await writeFile(join(local, "project.pbxproj"), "generated v2\n");
      const result = await prepareRepository(local, false, deps());
      expect(result.rescue?.outcome).toBe("rescued");
      expect(result.advanced).toBe(false);
      expect(await git(remote, "show", `refs/heads/${branchBase}:project.pbxproj`)).toBe("generated v2");
    });

    it("resets an edit trunk has since landed, and the fast-forward brings it back", async () => {
      await writeFile(join(source, PROJECT), await resorted());
      await git(source, "commit", "-am", "commit Xcode's ordering"); await git(source, "push", "origin", "main");
      await writeFile(join(local, "project.pbxproj"), "generated v2\n");
      await writeFile(join(source, "project.pbxproj"), "generated v2\n");
      await git(source, "commit", "-am", "same edit on trunk"); await git(source, "push", "origin", "main");
      await writeFile(join(local, PROJECT), await resorted());

      const result = await prepareRepository(local, false, deps());
      expect(result.rescue).toMatchObject({ outcome: "churn", churn: [{ path: PROJECT, kind: "on-trunk" }, { path: "project.pbxproj", kind: "on-trunk" }] });
      expect(result.advanced).toBe(true);
      expect(await readFile(join(local, "project.pbxproj"), "utf8")).toBe("generated v2\n");
      expect(await readFile(join(local, PROJECT), "utf8")).toBe(await resorted());
      expect(gh).not.toHaveBeenCalled();
    });
  });

  it("keeps the edits on a local branch when the push fails, still resetting and fast-forwarding", async () => {
    await writeFile(join(local, "project.pbxproj"), "mine\n");
    const latest = await advance(1);
    await unreachablePush();
    const result = await prepareRepository(local, false, deps());
    const rescue = result.rescue!;
    expect(rescue.outcome === "rescued" && rescue.pushed).toBe(false);
    expect(prCalls()).toEqual([]);
    expect(await git(local, "show", `refs/heads/${branchBase}:project.pbxproj`)).toBe("mine");
    expect(await git(local, "rev-parse", "HEAD")).toBe(latest);
  });

  describe("on a repository that is not known to be private", () => {
    /** What every local-only rescue must leave: the edits on a local branch, nothing on the remote, no PR, trunk advanced. */
    async function expectLocalOnly(result: Awaited<ReturnType<typeof prepareRepository>>, latest: string, keptLocal: string) {
      expect(result.rescue).toMatchObject({ outcome: "rescued", wipBranch: branchBase, pushed: false, keptLocal });
      expect(await git(local, "show", `refs/heads/${branchBase}:project.pbxproj`)).toBe("mine");
      expect(await git(remote, "for-each-ref", "refs/heads/wip")).toBe("");
      expect(await git(local, "for-each-ref", "refs/remotes/origin/wip")).toBe("");
      expect(prCalls()).toEqual([]);
      expect(result.advanced).toBe(true);
      expect(await git(local, "rev-parse", "HEAD")).toBe(latest);
      expect(await readFile(join(local, "project.pbxproj"), "utf8")).toBe("generated v1\n");
    }

    it("keeps a public repository's rescue on a local branch: never pushed, no PR, trunk still reset", async () => {
      visibility = answer("PUBLIC");
      await writeFile(join(local, "project.pbxproj"), "mine\n");
      const latest = await advance(1);
      const result = await prepareRepository(local, false, deps());
      await expectLocalOnly(result, latest, "o/r is public");
      expect(visibilityCalls()).toHaveLength(1);

      const lines = formatRescue(result.rescue!, "origin/main");
      expect(lines).toEqual([
        `Moved 1 uncommitted tracked file(s) from dirty trunk to local branch ${branchBase}; trunk reset to its last commit.`,
        "  Not pushed, and no PR opened: o/r is public. The edits exist only in this clone.",
        "    project.pbxproj | 2 +-",
        "    1 file changed, 1 insertion(+), 1 deletion(-)",
        `  Recover them with git switch ${branchBase}, or git cherry-pick ${branchBase} onto another branch.`,
        `  To publish deliberately: git push origin ${branchBase}, then gh pr create --draft --head ${branchBase}.`,
      ]);
    });

    it("treats a visibility read that fails as public", async () => {
      visibility = { code: 1, stdout: "", stderr: "gh: To get started with GitHub CLI, please run:  gh auth login\nmore" };
      await writeFile(join(local, "project.pbxproj"), "mine\n");
      const latest = await advance(1);
      await expectLocalOnly(await prepareRepository(local, false, deps()), latest,
        "the visibility of o/r could not be read (gh: To get started with GitHub CLI, please run:  gh auth login)");
    });

    it("treats an unparseable answer, an internal repository and a runner that throws as not private", async () => {
      await writeFile(join(local, "project.pbxproj"), "mine\n");
      visibility = { code: 0, stdout: "https://github.com/o/r/pull/42\n", stderr: "" };
      expect((await prepareRepository(local, false, deps())).rescue).toMatchObject({ pushed: false, keptLocal: "the visibility of o/r could not be read (gh returned no visibility)" });
      await writeFile(join(local, "project.pbxproj"), "mine, again\n");
      visibility = answer("INTERNAL");
      expect((await prepareRepository(local, false, deps())).rescue).toMatchObject({ pushed: false, keptLocal: "o/r is internal" });
      await writeFile(join(local, "project.pbxproj"), "mine, a third time\n");
      gh.mockImplementation(async (_command, args) => { if (args[0] === "repo") throw new Error("spawn gh ENOENT"); return prGh(_command, args, ""); });
      expect((await prepareRepository(local, false, deps())).rescue).toMatchObject({ pushed: false, keptLocal: "the visibility of o/r could not be read (Error: spawn gh ENOENT)" });
      expect(prCalls()).toEqual([]);
      expect(await git(remote, "for-each-ref", "refs/heads/wip")).toBe("");
    });

    it("treats a remote that is not on GitHub as unknown, without asking gh", async () => {
      await git(local, "remote", "set-url", "origin", "https://user:s3cret@git.example.com/o/r.git");
      await git(local, "config", `url.${remote}.insteadOf`, "https://user:s3cret@git.example.com/o/r.git");
      await writeFile(join(local, "project.pbxproj"), "mine\n");
      const latest = await advance(1);
      await expectLocalOnly(await prepareRepository(local, false, deps()), latest,
        "the repository's visibility cannot be read: https://git.example.com/o/r.git is not a GitHub repository");
      expect(visibilityCalls()).toEqual([]);
    });

    it("reports a repeat of a local rescue as a duplicate of the local branch, creating no second branch", async () => {
      visibility = answer("PUBLIC");
      await writeFile(join(local, "project.pbxproj"), "mine\n");
      await prepareRepository(local, false, deps());
      await writeFile(join(local, "project.pbxproj"), "mine\n");
      const repeated = await prepareRepository(local, false, deps());
      expect(repeated.rescue).toMatchObject({ outcome: "duplicate", existingBranch: branchBase });
      expect(repeated.rescue?.outcome === "duplicate" && repeated.rescue.prUrl).toBeUndefined();
      expect(await git(local, "for-each-ref", "--format=%(refname:short)", "refs/heads/wip/trunk-*")).toBe(branchBase);
      expect(await readFile(join(local, "project.pbxproj"), "utf8")).toBe("generated v1\n");
      expect(formatRescue(repeated.rescue!, "origin/main")[0]).toBe(`Same tracked edits are already on local branch ${branchBase}; trunk reset without another branch.`);

      // A different edit is still a new rescue.
      await writeFile(join(local, "project.pbxproj"), "mine, but different\n");
      expect((await prepareRepository(local, false, deps())).rescue).toMatchObject({ outcome: "rescued", wipBranch: `${branchBase}-2`, pushed: false });
      expect(prCalls()).toEqual([]);
    });

    it("lists the never-pushed branch in doctor, from any checkout, and not a pushed one", async () => {
      // A private rescue first: pushed, so not listed.
      await writeFile(join(local, "project.pbxproj"), "published\n");
      await prepareRepository(local, false, deps());
      visibility = answer("PUBLIC");
      await writeFile(join(local, "project.pbxproj"), "mine\n");
      await writeFile(join(local, "doomed.txt"), "changed too\n");
      await prepareRepository(local, false, deps());

      const report = (await inspectTrunkCheckout(local, { remote: "origin", branch: "main" }, null))!;
      expect(report.localRescues).toEqual([{ branch: `${branchBase}-2`, date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), files: 2 }]);
      const message = `1 trunk rescue branch(es) have no remote-tracking ref, so they are likely only in this clone and no pull request will surface them: ${branchBase}-2 (2 file(s), ${report.localRescues[0]!.date}). Inspect with git show --stat <branch>; recover with git switch <branch> or git cherry-pick <branch>; publish deliberately with git push origin <branch>; once handled, delete with git branch -D <branch>.`;
      expect(trunkCheckoutFindings(report, NOW)).toEqual([{ severity: "warning", message }]);

      // Branches belong to the repository: a task branch still reports them, and nothing else.
      await git(local, "checkout", "-q", "-b", "task");
      const onTask = (await inspectTrunkCheckout(local, { remote: "origin", branch: "main" }, null))!;
      expect(trunkCheckoutFindings(onTask, NOW)).toEqual([{ severity: "warning", message }]);
    });
  });

  it("names the trunk branch and a short host label in what it publishes, never the checkout path or full hostname", async () => {
    await writeFile(join(local, "project.pbxproj"), "mine\n");
    const result = await rescueDirtyTrunk(local, { trunk: "origin/main", branch: "main", sha: await git(local, "rev-parse", "HEAD") },
      { ...deps(), hostname: "Chris-Mini.tail1234.ts.net" });
    expect(result).toMatchObject({ outcome: "rescued", wipBranch: "wip/trunk-2026-10-08-chris-mini", pushed: true });
    const message = await git(remote, "log", "-1", "--format=%B", "refs/heads/wip/trunk-2026-10-08-chris-mini");
    expect(message).toBe([
      "WIP: uncommitted changes rescued from dirty main",
      "",
      "Auto-moved by morpheus context brief on 2026-10-08 from a main",
      "checkout on chris-mini. The edits blocked fast-forwarding origin/main;",
      "the checkout was reset to trunk only after this commit held them.",
    ].join("\n"));
    const args = prCalls()[0]![1];
    const body = args[args.indexOf("--body") + 1]!;
    expect(body.split("\n")[0]).toBe("Uncommitted tracked edits were found on a `main` checkout on host `chris-mini` by `morpheus context brief` on 2026-10-08. A dirty trunk cannot fast-forward, so they were moved here and the checkout was reset to trunk. Nothing was discarded.");
    for (const text of [message, body, args[args.indexOf("--title") + 1]!]) {
      for (const secret of [dir, await realpath(dir), "tail1234", "ts.net", "Chris-Mini"]) expect(text).not.toContain(secret);
    }
  });

  it("caches a visibility answer in the primary checkout's ignored local/ and reuses it", async () => {
    const cachePath = join(local, "local/sessions/repo-visibility.json");
    const withCache = (): RescueDeps => ({ ...deps(), visibilityCache: undefined });
    await writeFile(join(local, "project.pbxproj"), "first\n");
    await prepareRepository(local, false, withCache());
    await writeFile(join(local, "project.pbxproj"), "second\n");
    await prepareRepository(local, false, withCache());
    expect(visibilityCalls()).toHaveLength(1);
    expect(JSON.parse(await readFile(cachePath, "utf8"))).toEqual({ version: 1, repos: { "o/r": { visibility: "PRIVATE", checkedAt: NOW.toISOString() } } });
    expect(prCalls().filter((call) => call[1][1] === "create")).toHaveLength(2);
    // The cache file is ignored, so the checkout is clean.
    expect(await git(local, "status", "--porcelain")).toBe("");
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
    lag: { behind: 0, oldest: null }, measuredAgainst: "remote-tip", cachedAt: null, remoteTipUnfetched: false, localRescues: [],
  };
  it("names ten local rescue branches, then counts the rest", () => {
    const rescues = Array.from({ length: 12 }, (_, i) => ({ branch: `wip/trunk-2026-10-${String(i + 1).padStart(2, "0")}-box`, date: null, files: i === 0 ? null : i }));
    const { message } = localRescueFinding(rescues);
    expect(message).toMatch(/^12 trunk rescue branch\(es\) have no remote-tracking ref, so they are likely only in this clone/);
    expect(message).toContain("wip/trunk-2026-10-01-box (files unknown), wip/trunk-2026-10-02-box (1 file(s)),");
    expect(message).toContain("wip/trunk-2026-10-10-box (9 file(s)) and 2 more.");
    expect(message).not.toContain("2026-10-11");
  });
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
