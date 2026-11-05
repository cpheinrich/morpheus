import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claim, resume } from "../src/cli/pm.js";
import { reviewBase, validateReview } from "../src/cli/review.js";
import { cleanupTask } from "../src/pm/cleanup.js";
import { checkLocalReview, git as reviewGit } from "../src/review/local.js";
import { check, refresh } from "../src/session/context.js";
import { assertCurrentSource, prepareRepository } from "../src/session/start.js";
import { declaredBase, taskTrunk, verifyTaskBase, type CommandRunner } from "../src/session/task-base.js";
import { boundTask, prepareTask, resumeTask } from "../src/session/tasks.js";

/**
 * Release-branch task bases, hermetically: a local bare remote, `main` at A, the protected
 * release branch R = A + fix B, then `main` advanced to an unrelated M. `gh` is a fake.
 */
const exec = promisify(execFile);
const git = async (cwd: string, ...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
const R = "release/ios-aaaaaaaaaaaa";
const id = "MO-26-11-05-10.00.00";
const rel = `hq/product/roadmap/${id}-release-fix.md`;
const body = (itemId = id, extra = "") => `---\nid: ${itemId}\ntitle: Release fix\nstatus: backlog\npriority: P1\nowner: agent\nprs: []\n${extra}created: 2026-11-05\nupdated: 2026-11-05\n---\n\nFix the release.\n`;
let dir: string, remote: string, source: string, local: string;
let A: string, B: string, M: string;
let calls: string[][];
let protectedBranches: Set<string>;

const gh: CommandRunner = async (_command, args) => {
  calls.push(args);
  if (args[0] === "repo") return JSON.stringify({ nameWithOwner: "example/repo" });
  if (args[0] === "api") {
    const branch = args[1]!.replace("repos/example/repo/branches/", "").split("/").map(decodeURIComponent).join("/");
    const exists = (await git(source, "branch", "--list", branch)) !== "";
    if (!exists) throw new Error("gh: Branch not found (HTTP 404)");
    return protectedBranches.has(branch) ? "true\n" : "false\n";
  }
  throw new Error(`unexpected gh ${args.join(" ")}`);
};

const ancestor = (cwd: string, older: string, newer = "HEAD") =>
  git(cwd, "merge-base", "--is-ancestor", older, newer).then(() => true, () => false);
const remoteHead = async (branch: string) => (await git(dir, "ls-remote", remote, `refs/heads/${branch}`)).split(/\s/)[0] ?? "";

beforeEach(async () => {
  calls = [];
  protectedBranches = new Set([R]);
  dir = await mkdtemp(join(tmpdir(), "task-base-"));
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
  await writeFile(join(source, "hq/product/roadmap/README.md"), "Roadmap\n");
  await writeFile(join(source, "code.txt"), "release A\n");
  await git(source, "add", "."); await git(source, "commit", "-m", "A");
  A = await git(source, "rev-parse", "HEAD");
  await git(source, "remote", "add", "origin", remote); await git(source, "push", "origin", "main");
  // R = A + fix B, cut from main and protected.
  await git(source, "checkout", "-b", R);
  await writeFile(join(source, "fix.txt"), "fix B\n");
  await git(source, "add", "fix.txt"); await git(source, "commit", "-m", "fix B");
  B = await git(source, "rev-parse", "HEAD");
  await git(source, "push", "origin", R);
  // Unrelated work lands on main after the cut.
  await git(source, "checkout", "main");
  await writeFile(join(source, "code.txt"), "unrelated M\n");
  await git(source, "commit", "-am", "unrelated M");
  M = await git(source, "rev-parse", "HEAD");
  await git(source, "push", "origin", "main");
  await git(dir, "clone", "--branch", "main", remote, local);
  await git(local, "config", "user.email", "test@example.com"); await git(local, "config", "user.name", "Test");
  local = await realpath(local);
});
afterEach(async () => {
  vi.restoreAllMocks();
  const listing = await git(local, "worktree", "list", "--porcelain");
  for (const path of listing.split("\n").filter(line => line.startsWith("worktree ")).map(line => line.slice(9))) {
    if (path === local) continue;
    await git(local, "worktree", "remove", "--force", "--", path);
    await rmdir(dirname(path)).catch(() => undefined);
  }
  await rm(dir, { recursive: true, force: true });
});

/** File a new release-fix item as untracked intake, the way `pm new` leaves it. */
async function intake(itemId = id, extra = ""): Promise<void> {
  await writeFile(join(local, rel.replace(id, itemId)), body(itemId, extra));
}

/** Both claim phases: prepare from the primary checkout, then claim in the prepared one. */
async function claimRelease(session = "release-session"): Promise<string> {
  vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await claim(join(local, "hq/product"), id, local, session, false, R, gh)).toBe(0);
  const target = (await boundTask(local, session))!.root;
  expect((await refresh(target)).lease?.status).toBe("fresh");
  expect(await claim(join(target, "hq/product"), id, target, session, false, undefined, gh)).toBe(0);
  return target;
}

describe("default claims are unchanged", () => {
  it("prepares and claims from current main without consulting gh or writing a base", async () => {
    await intake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await claim(join(local, "hq/product"), id, local, "default", false, undefined, gh)).toBe(0);
    const target = (await boundTask(local, "default"))!.root;
    expect(await git(target, "rev-parse", "HEAD")).toBe(M);
    expect(await declaredBase(target)).toBeNull();
    expect(await taskTrunk(target)).toEqual({ remote: "origin", branch: "main" });
    await refresh(target);
    expect(await claim(join(target, "hq/product"), id, target, "default", false, undefined, gh)).toBe(0);
    expect(await readFile(join(target, rel), "utf8")).not.toContain("base:");
    expect(await reviewBase(target)).toBe("origin/main");
    expect(calls).toEqual([]);
  });
  it("treats --base naming the trunk as the default", async () => {
    expect(await verifyTaskBase(local, "main", gh)).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("a task claimed against a protected release branch", () => {
  it("contains R's fix and none of main's later work, through claim, refresh, gate and resume", async () => {
    await intake();
    const target = await claimRelease();
    expect(await git(target, "branch", "--show-current")).toBe(`${id.toLowerCase()}-release-fix`);
    expect(await ancestor(target, B)).toBe(true);
    expect(await ancestor(target, M)).toBe(false);
    expect(await readFile(join(target, "code.txt"), "utf8")).toBe("release A\n");
    expect(await readFile(join(target, rel), "utf8")).toContain(`base: ${R}`);
    // Only the task branch was pushed; R did not move and was never pushed to.
    expect(await remoteHead(R)).toBe(B);
    expect(await remoteHead(`${id.toLowerCase()}-release-fix`)).toBe(await git(target, "rev-parse", "HEAD"));
    expect(await taskTrunk(target)).toEqual({ remote: "origin", branch: R });
    expect(await assertCurrentSource(target)).toBe(B);
    expect((await check(target, new Date(Date.now() + 10 * 60_000))).lease?.status).toBe("fresh");
    const brief = await prepareRepository(target);
    expect(brief).toMatchObject({ trunk: `origin/${R}`, sha: B, behind: 0, task: id });
    // Resume from the primary checkout finds the same base from the committed item.
    expect(await resumeTask(local, id, "later")).toBe(target);
    expect(await resume(id, local, "later")).toBe(0);
    expect(vi.mocked(console.log).mock.calls.flat().join("\n")).toContain(`Task base: ${R}`);
    expect((await refresh(target)).lease?.status).toBe("fresh");
  });
  it("finds the base on a fresh checkout of the pushed task branch", async () => {
    await intake();
    const target = await claimRelease();
    const branch = await git(target, "branch", "--show-current");
    const elsewhere = join(dir, "elsewhere");
    await git(dir, "clone", "--branch", branch, remote, elsewhere);
    expect(await declaredBase(elsewhere)).toBe(R);
    expect(await assertCurrentSource(elsewhere)).toBe(B);
  });
  it("asks for R when R advances, never for main", async () => {
    await intake();
    const target = await claimRelease();
    await git(source, "checkout", R);
    await writeFile(join(source, "fix.txt"), "fix B\nfix C\n");
    await git(source, "commit", "-am", "fix C"); await git(source, "push", "origin", R);
    const C = await git(source, "rev-parse", "HEAD");
    const stale = await refresh(target);
    expect(stale.lease).toBeNull();
    expect(stale.issue).toContain(`does not contain current origin/${R}`);
    expect(stale.issue).toContain(`integrate origin/${R} (this task's base)`);
    expect(await prepareRepository(target)).toMatchObject({ trunk: `origin/${R}`, sha: C, behind: 1 });
    await git(target, "fetch", "origin", R);
    await git(target, "merge", "--no-edit", `origin/${R}`);
    expect((await refresh(target)).lease?.status).toBe("fresh");
    expect(await ancestor(target, M)).toBe(false);
  });
  it("records and validates a review against the PR base R, and the same record fails against main", async () => {
    await intake();
    const target = await claimRelease();
    expect(await reviewBase(target)).toBe(`origin/${R}`);
    expect(await git(target, "rev-parse", `origin/${R}`)).toBe(B);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await reviewBase(target, "origin/main")).toBe("origin/main");
    expect(errors.mock.calls.flat().join("\n")).toContain(`This task's base is origin/${R}`);
    await writeFile(join(target, "fix.txt"), "fix B\nfix D\n");
    await git(target, "commit", "-am", "fix D");
    const reviewed = await git(target, "rev-parse", "HEAD");
    const path = ".agent/worklog/2026-11-05-release-fix.md";
    await mkdir(join(target, ".agent/worklog"), { recursive: true });
    const record = { version: 1, base: B, reviewed, covered: reviewed, authorSession: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d", reviewerSession: "a1b2c3d4e5f6a7b8c", risk: "normal", elapsedMinutes: 3, outcome: "complete", summary: "Independent review found no actionable defects.", findings: [] };
    await writeFile(join(target, path), `${record.summary}\n\n\`\`\`morpheus-review\n${JSON.stringify(record)}\n\`\`\`\n`);
    await git(target, "add", path); await git(target, "commit", "-m", "review record");
    const head = reviewGit(target, ["rev-parse", "HEAD"]);
    expect(validateReview(target, await reviewBase(target))).toBe(0);
    // CI passes `origin/<PR base>`: R accepts the record; main's unchanged checks refuse it.
    expect(checkLocalReview({ root: target, body: `review-record: ${path}`, labels: ["agent-reviewed"], head, base: `origin/${R}` })).toEqual([]);
    const againstMain = checkLocalReview({ root: target, body: `review-record: ${path}`, labels: ["agent-reviewed"], head, base: "origin/main" });
    expect(againstMain.map(f => f.message).join("\n")).toContain("must precede the PR's merge base");
  });
});

describe("refusals never fall back to main", () => {
  async function refused(base: string, message: string): Promise<void> {
    const before = await git(local, "worktree", "list", "--porcelain");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await claim(join(local, "hq/product"), id, local, "refused", false, base, gh)).toBe(1);
    expect(errors.mock.calls.flat().join("\n")).toContain(message);
    expect(await git(local, "worktree", "list", "--porcelain")).toBe(before);
    expect(await boundTask(local, "refused")).toBeNull();
    expect(await git(dir, "ls-remote", remote, `refs/heads/${id.toLowerCase()}-*`)).toBe("");
    errors.mockRestore();
  }
  it("refuses unprotected, unknown, malformed and unverifiable bases before preparing anything", async () => {
    await intake();
    await git(source, "push", "origin", `${A}:refs/heads/release/unprotected`);
    await git(source, "branch", "release/unprotected", A);
    await refused("release/unprotected", "is not a protected branch of example/repo");
    await refused("release/missing", "Cannot verify that origin/release/missing is a protected branch");
    for (const bad of ["-x", "release/../main", "release/.hidden", "release//x", "release x"]) await refused(bad, "is not a plain branch name");
    const broken: CommandRunner = async () => { throw new Error("gh: not logged in"); };
    await expect(verifyTaskBase(local, R, broken)).rejects.toThrow("Cannot verify that origin/release/ios-aaaaaaaaaaaa is a protected branch (gh: not logged in)");
    const garbled: CommandRunner = async (_c, args) => args[0] === "repo" ? "{}" : "true";
    await expect(verifyTaskBase(local, R, garbled)).rejects.toThrow("Cannot verify");
  });
  it("refuses a protected base that the remote no longer has, without preparing", async () => {
    await intake();
    await git(dir, "--git-dir", remote, "update-ref", "-d", `refs/heads/${R}`);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await claim(join(local, "hq/product"), id, local, "gone", false, R, gh)).toBe(1);
    expect(await boundTask(local, "gone")).toBeNull();
    errors.mockRestore();
  });
  it("refuses an item that is on main but not on R, with the remedy", async () => {
    await intake();
    await git(local, "add", rel); await git(local, "commit", "-m", "item on main");
    await refused(R, `${id} is on main but not on ${R}. File the fix as a new item`);
  });
  it("refuses to mix bases between preparation, claim and the item", async () => {
    await intake();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await claim(join(local, "hq/product"), id, local, "mixed", false, R, gh)).toBe(0);
    const target = (await boundTask(local, "mixed"))!.root;
    await refresh(target);
    // Naming the trunk inside R's checkout prepares a separate trunk checkout; R's never moves.
    expect(await claim(join(target, "hq/product"), id, target, "mixed", false, "main", gh)).toBe(0);
    expect(await git(target, "branch", "--show-current")).toBe("");
    expect(await git(target, "rev-parse", "HEAD")).toBe(B);
    // A checkout reused in place must have been prepared for the requested base.
    const same = "release/ios-bbbbbbbbbbbb";
    await git(source, "push", "origin", `${M}:refs/heads/${same}`); await git(source, "branch", same, M);
    protectedBranches.add(same);
    const trunkCheckout = (await boundTask(local, "mixed"))!.root;
    expect(await git(trunkCheckout, "rev-parse", "HEAD")).toBe(M);
    expect(await claim(join(trunkCheckout, "hq/product"), id, trunkCheckout, "mixed", false, same, gh)).toBe(1);
    expect(errors.mock.calls.flat().join("\n")).toContain(`prepared for base main, not ${same}`);
    expect(await git(trunkCheckout, "branch", "--show-current")).toBe("");
    // An item that declares a base cannot be claimed against the trunk.
    const other = "MO-26-11-05-10.00.01";
    await intake(other, `base: ${R}\n`);
    const trunkTarget = (await prepareTask(local, join(local, "hq/product"), other))!;
    await refresh(trunkTarget);
    expect(await claim(join(trunkTarget, "hq/product"), other, trunkTarget, "mixed-2", false, undefined, gh)).toBe(1);
    expect(errors.mock.calls.flat().join("\n")).toContain(`declares base ${R}; claim it with --base ${R}`);
  });
  it("refuses an unreadable declared base instead of measuring main", async () => {
    await intake();
    const target = await claimRelease();
    const raw = await readFile(join(target, rel), "utf8");
    await writeFile(join(target, rel), raw.replace(`base: ${R}`, "base: ../main"));
    await expect(taskTrunk(target)).rejects.toThrow("declares an invalid base");
    await expect(assertCurrentSource(target)).rejects.toThrow("declares an invalid base");
  });
});

describe("cleanup after the task's PR merged into its base", () => {
  it("proves the merge against R, not main", async () => {
    await intake();
    const target = await claimRelease();
    const branch = await git(target, "branch", "--show-current");
    await writeFile(join(target, "fix.txt"), "fix B\nfix D\n");
    const raw = await readFile(join(target, rel), "utf8");
    await writeFile(join(target, rel), raw.replace("status: in-progress", "status: review"));
    await git(target, "commit", "-am", "fix D"); await git(target, "push", "origin", branch);
    const head = await git(target, "rev-parse", "HEAD");
    // Squash-merge the PR into R on the remote, as GitHub would.
    await git(source, "fetch", "origin"); await git(source, "checkout", R); await git(source, "merge", "--ff-only", `origin/${R}`);
    await git(source, "merge", "--squash", `origin/${branch}`); await git(source, "commit", "-m", "fix D (#7)");
    const merge = await git(source, "rev-parse", "HEAD");
    await git(source, "push", "origin", R);
    const bin = join(dir, "bin");
    await mkdir(bin);
    const pr = join(dir, "pr.json");
    await writeFile(pr, JSON.stringify([{ number: 7, headRefName: branch, headRefOid: head, baseRefName: R, state: "MERGED",
      mergeCommit: { oid: merge }, headRepository: { nameWithOwner: "example/repo" } }]));
    await writeFile(join(bin, "gh"), `#!/bin/sh\nif [ "$1" = repo ]; then printf '%s\\n' '{"nameWithOwner":"example/repo","url":"https://example.invalid/repo"}'; else cat '${pr}'; fi\n`);
    await chmod(join(bin, "gh"), 0o755);
    vi.stubEnv("PATH", `${bin}${delimiter}${process.env["PATH"] ?? ""}`);
    try {
      await expect(cleanupTask(local, join(local, "hq/product"), id, true, true)).resolves.toMatchObject({ path: target, branch, pr: 7, dryRun: true });
      // The same PR claimed into main is refused, as before.
      await writeFile(pr, (await readFile(pr, "utf8")).replace(`"baseRefName":"${R}"`, '"baseRefName":"main"'));
      await expect(cleanupTask(local, join(local, "hq/product"), id, true, true)).rejects.toThrow(`require MERGED into ${R}`);
    } finally { vi.unstubAllEnvs(); }
  });
});
