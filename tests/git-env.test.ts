import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { KEPT_GIT_CONFIG_ENV, REPOSITORY_LOCAL_GIT_ENV, gitSubprocessEnv } from "../src/git-env.js";
import { installCurrentMorpheus, runMorpheusCommand } from "../src/self.js";
import { checkoutIdentity } from "../src/session/start.js";
import { readDirt } from "../src/session/trunk-rescue.js";

const exec = promisify(execFile);

/** Git with a scrubbed environment, so the test's own setup is never misdirected. */
async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, env: gitSubprocessEnv() });
  return stdout;
}

async function repo(prefix: string): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  await git(root, "init", "-q", "-b", "main");
  await git(root, "config", "user.email", "test@example.com");
  await git(root, "config", "user.name", "Test");
  await git(root, "config", "commit.gpgsign", "false");
  await git(root, "config", "core.hooksPath", join(root, ".git", "hooks"));
  return root;
}

type Operation = "merge" | "pull" | "rebase" | "subdir-merge";

/**
 * Run a real merge, pull or rebase with real `post-merge`/`post-rewrite`
 * hooks and return the GIT_* variables Git exported into the hook — the
 * environment `morpheus self ensure` inherits from the managed hook block.
 * `linked` reproduces the Lakina case: a linked worktree, where Git points
 * GIT_DIR at `.git/worktrees/<name>`.
 */
async function hookEnvironment(
  linked: boolean,
  operation: Operation = "merge",
): Promise<{ project: string; env: Record<string, string> }> {
  const project = await repo("morpheus-git-env-project-");
  await writeFile(join(project, "tracked.txt"), "one\n");
  await git(project, "add", "tracked.txt");
  await git(project, "commit", "-q", "-m", "one");
  await writeFile(join(project, "tracked.txt"), "two\n");
  await git(project, "commit", "-q", "-am", "two");
  const dump = join(project, "..", `${project.split("/").pop()}-hook-env`);
  for (const name of ["post-merge", "post-rewrite"]) {
    const hook = join(project, ".git", "hooks", name);
    await writeFile(hook, `#!/bin/sh\nenv | grep '^GIT_' > '${dump}'\n`);
    await chmod(hook, 0o755);
  }
  let where = project;
  if (linked) {
    where = `${project}-wt`;
    await git(project, "worktree", "add", "-q", "-b", "side", where, "HEAD~1");
  } else {
    await git(project, "checkout", "-q", "-b", "side", "HEAD~1");
  }
  if (operation === "merge") await git(where, "merge", "-q", "main");
  if (operation === "pull") await git(where, "pull", "-q", "--no-rebase", ".", "main");
  if (operation === "subdir-merge") {
    await mkdir(join(where, "sub"), { recursive: true });
    await git(join(where, "sub"), "merge", "-q", "main");
  }
  if (operation === "rebase") {
    await writeFile(join(where, "side.txt"), "side\n");
    await git(where, "add", "side.txt");
    await git(where, "commit", "-q", "-m", "side");
    await git(where, "rebase", "-q", "main");
  }
  const env: Record<string, string> = {};
  for (const line of (await readFile(dump, "utf8")).split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1);
  }
  // Leave the project dirty, as an active working tree usually is, so a
  // status that reads the wrong index or tree cannot come back empty by luck.
  await writeFile(join(where, "tracked.txt"), "local edit\n");
  return { project: where, env };
}

const saved = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

describe("git subprocess environment", () => {
  it("strips exactly the repository-locating variables and keeps the rest", () => {
    const env = gitSubprocessEnv({
      GIT_DIR: "/elsewhere/.git",
      GIT_INDEX_FILE: "/elsewhere/.git/index",
      GIT_WORK_TREE: "/elsewhere",
      GIT_PREFIX: "sub/",
      GIT_COMMON_DIR: "/elsewhere/.git",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "safe.directory",
      GIT_CONFIG_VALUE_0: "*",
      GIT_AUTHOR_NAME: "Kept",
      PATH: "/usr/bin",
    });
    expect(env).toEqual({
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "safe.directory",
      GIT_CONFIG_VALUE_0: "*",
      GIT_AUTHOR_NAME: "Kept",
      PATH: "/usr/bin",
    });
  });

  it("covers every repository-local variable this Git knows, except the documented config ones", async () => {
    // A newer Git that adds a repository-local variable fails here, rather
    // than silently letting it misdirect a subprocess again.
    const local = (await git(process.cwd(), "rev-parse", "--local-env-vars")).split("\n").filter(Boolean);
    const handled = new Set<string>([...REPOSITORY_LOCAL_GIT_ENV, ...KEPT_GIT_CONFIG_ENV]);
    expect(local.filter((name) => !handled.has(name))).toEqual([]);
    expect(local).toContain("GIT_DIR");
  });

  // Measured on Git 2.54: in a linked worktree every one of these exports an
  // absolute GIT_DIR into the hook, and a merge from a subdirectory exports
  // GIT_PREFIX. A main checkout's top-level merge exports neither, which is
  // why the failure showed up first in `.morpheus-worktrees/`.
  const cases: Array<[boolean, Operation]> = [
    [true, "merge"],
    [true, "pull"],
    [true, "rebase"],
    [false, "merge"],
    [false, "subdir-merge"],
  ];
  for (const [linked, operation] of cases) {
    const where = linked ? "a linked worktree" : "a main checkout";
    it(`inspects the clean Morpheus checkout, not the project, from a hook after ${operation} in ${where}`, async () => {
      const { project, env } = await hookEnvironment(linked, operation);
      // Sanity: the linked-worktree hooks really carry the variable that
      // misdirected the old runner, so these cases fail without the scrub.
      if (linked) expect(env["GIT_DIR"]).toContain("/.git/worktrees/");

      const source = await repo("morpheus-git-env-source-");
      await writeFile(join(source, "package.json"), "{}\n");
      await git(source, "add", "package.json");
      await git(source, "commit", "-q", "-m", "source");

      Object.assign(process.env, env);
      const status = await runMorpheusCommand("git", ["status", "--porcelain", "--untracked-files=all"], source);
      const top = await runMorpheusCommand("git", ["rev-parse", "--show-toplevel"], source);
      expect(status).toMatchObject({ code: 0, stdout: "" });
      expect(top.stdout.trim()).toBe(source);
      expect(project).not.toBe(source);
    });
  }

  it("identifies the session checkout, not the hook's repository, for context and rescue", async () => {
    const { env } = await hookEnvironment(true);
    const other = await repo("morpheus-git-env-session-");
    await git(other, "commit", "-q", "--allow-empty", "-m", "init");

    Object.assign(process.env, env);
    const identity = await checkoutIdentity(other);
    const dirt = await readDirt(other);
    expect(identity).toMatchObject({ root: other, linked: false });
    expect(dirt).toMatchObject({ tracked: [], untracked: [] });
  });

  it("clones into the disposable directory without touching the hook's repository", async () => {
    const { project, env } = await hookEnvironment(true);
    const upstream = await repo("morpheus-git-env-upstream-");
    await writeFile(join(upstream, "package.json"), "{}\n");
    await git(upstream, "add", "package.json");
    await git(upstream, "commit", "-q", "-m", "upstream");
    const before = await git(project, "for-each-ref", "--format=%(refname) %(objectname)");
    const parent = await realpath(await mkdtemp(join(tmpdir(), "morpheus-git-env-clone-")));
    const clone = join(parent, "morpheus");

    Object.assign(process.env, env);
    const cloned = await runMorpheusCommand(
      "git",
      ["clone", "--depth", "1", "--branch", "main", "--single-branch", `file://${upstream}`, clone],
      parent,
    );
    expect(cloned.code).toBe(0);
    for (const key of Object.keys(env)) delete process.env[key];

    expect(await git(clone, "rev-parse", "--show-toplevel")).toBe(`${clone}\n`);
    expect(await git(clone, "status", "--porcelain", "--untracked-files=all")).toBe("");
    expect(await git(project, "for-each-ref", "--format=%(refname) %(objectname)")).toBe(before);
  });

  it("names the dirty checkout and its paths when the source really has local changes", async () => {
    const { env } = await hookEnvironment(true);
    const source = await repo("morpheus-git-env-dirty-");
    await writeFile(join(source, "package.json"), "{}\n");
    await git(source, "add", "package.json");
    await git(source, "commit", "-q", "-m", "source");
    await writeFile(join(source, "package.json"), "{\"dirty\":true}\n");

    Object.assign(process.env, env);
    const failure = await installCurrentMorpheus(source).then(
      () => null,
      (error: Error) => error.message,
    );
    expect(failure).toContain(`The source checkout ${source} has local changes`);
    expect(failure).toContain("    package.json");
    expect(failure).not.toContain("tracked.txt");
  });
});
