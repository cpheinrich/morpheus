// One task conversation across repositories: the real guardian runs a fake Claude CLI that
// writes a marker into its working directory and every --add-dir, so these tests observe which
// checkouts a worker could reach, which conversation it resumed, and that originals stay intact.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, chmod, readFile, mkdir, realpath, symlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { defaults, codexPermission } from "../src/config.mjs";
import { initStore, configWrite, taskRead, taskWrite, atomic, runDir } from "../src/store.mjs";
import { Manager } from "../src/service.mjs";
import { checkoutInfo, claimCheckouts, extraRoots, readOwners, workspaceNote } from "../src/workspace.mjs";
import { linkedCheckout } from "./git-fixtures.mjs";

const exists = (path) => stat(path).then(() => true, () => false);
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

async function repository(root, name) {
  const dir = join(root, name);
  await mkdir(dir);
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  await writeFile(join(dir, "README.md"), `${name}\n`);
  git(dir, "add", "README.md");
  git(dir, "commit", "-qm", "fixture");
  return realpath(dir);
}

async function harness(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "factory-workspace-")));
  const saved = { FACTORY_HOME: process.env.FACTORY_HOME, PATH: process.env.PATH };
  t.after(async () => {
    for (const [name, value] of Object.entries(saved))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    await rm(root, { recursive: true, force: true });
  });
  process.env.FACTORY_HOME = join(root, "home");
  const bin = join(root, "bin");
  await mkdir(bin);
  const log = join(root, "invocations.jsonl");
  await writeFile(
    join(bin, "claude"),
    `#!${process.execPath}
const fs = require("fs"), path = require("path");
const argv = process.argv.slice(2);
if (argv[0] === "auth") {
  console.log(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "max" }));
  process.exit(0);
}
const dirs = argv.flatMap((arg, i) => (arg === "--add-dir" ? [argv[i + 1]] : []));
let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
  if (!input.includes("\\n")) return;
  const run = fs.readdirSync(".").length;
  for (const dir of [process.cwd(), ...dirs].filter((d) => !d.endsWith(".git")))
    fs.appendFileSync(path.join(dir, "factory-marker.txt"), "written\\n");
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ cwd: process.cwd(), argv, stdin: input.split("\\n")[0] }) + "\\n");
  console.log(JSON.stringify({ type: "system", subtype: "init", session_id: "sess-multi" }));
  console.log(JSON.stringify({ type: "result", is_error: false, result: "done", session_id: "sess-multi", structured_output: { outcome: "completed", summary: "done", evidence: [] } }));
  process.exit(0);
});
`,
  );
  await chmod(join(bin, "claude"), 0o755);
  process.env.PATH = `${bin}:${saved.PATH}`;
  await initStore();
  await configWrite({ ...defaults(), mode: "manual", maxConcurrent: 4 });
  const invocations = async () =>
    (await readFile(log, "utf8").catch(() => ""))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  return { root, invocations };
}

// A Codex root with full access and no per-action approval: its Claude worker is unconfined.
function codexRoot(t, cwd) {
  const m = new Manager();
  t.after(() => m.viewer.close());
  m.snapshot = async () => ({
    cwd,
    model: "gpt-6-astra",
    reasoningEffort: "high",
    sandbox: { type: "dangerFullAccess" },
    approvalPolicy: "never",
  });
  return m;
}
// Records launches without running anything, for ownership rules that need no worker.
function stubbed(m) {
  m.launch = async (record) => {
    m.runs.set(record.id, { ...record, lastLease: 0, sequence: 0, progress: "" });
    await atomic(join(runDir(record.id), "run.json"), record);
  };
  m.begin = (id) => m.public(m.runs.get(id));
  return m;
}
// Completes every stubbed run, as a finished worker would.
async function finish(m) {
  for (const run of m.runs.values())
    await atomic(join(runDir(run.id), "run.json"), m.public({ ...run, state: "completed", terminal: true }));
  m.runs.clear();
}
async function settle(m, id) {
  let run;
  for (let i = 0; i < 150; i++) if ((run = await m.wait(id, 1)).terminal) return run;
  return run;
}
const flag = (argv, name) => argv.flatMap((arg, i) => (arg === name ? [argv[i + 1]] : []));

test("one conversation writes two repositories, resumes, and adds a third without a new session", async (t) => {
  const { root, invocations } = await harness(t);
  // The root works in its claimed linked checkout of app, which the task adopts.
  const app = await linkedCheckout(root, "app");
  const appCommon = (await checkoutInfo(app)).project;
  const lib = await repository(root, "lib");
  const docs = await repository(root, "docs");
  // An uncommitted edit in an original checkout must never reach the task's worktree.
  await writeFile(join(lib, "README.md"), "uncommitted local edit\n");
  const libHead = git(lib, "rev-parse", "HEAD");
  const m = codexRoot(t, app);
  const threadId = "workspace-root";

  const first = await m.start({ threadId, prompt: "Change app and lib", repos: [lib] });
  assert.equal((await settle(m, first.id)).state, "completed");
  const task = await taskRead(threadId);
  const libCommon = await realpath(join(lib, ".git"));
  const libTree = task.workspace[libCommon].path;
  assert.equal(task.primaryCwd, app);
  assert.deepEqual(task.workspace[appCommon], { path: app, source: null, owned: true });
  assert.deepEqual(task.workspace[libCommon], { path: libTree, source: lib, owned: true });
  assert.ok(libTree.startsWith(join(process.env.FACTORY_HOME, "worktrees")), libTree);
  // The isolated worktree is detached at the source's committed HEAD, without its local edit.
  assert.equal(git(libTree, "rev-parse", "HEAD"), libHead);
  assert.equal(await readFile(join(libTree, "README.md"), "utf8"), "lib\n");
  assert.equal(await readFile(join(lib, "README.md"), "utf8"), "uncommitted local edit\n");
  // The worker reached its own checkout and the task's lib worktree, never the original lib.
  assert.equal(await readFile(join(app, "factory-marker.txt"), "utf8"), "written\n");
  assert.equal(await readFile(join(libTree, "factory-marker.txt"), "utf8"), "written\n");
  assert.equal(await exists(join(lib, "factory-marker.txt")), false);
  let [call] = await invocations();
  assert.equal(call.cwd, app);
  assert.deepEqual(flag(call.argv, "--add-dir"), [appCommon, libTree, libCommon]);
  assert.deepEqual(flag(call.argv, "--resume"), []);
  assert.match(call.stdin, new RegExp(`Write only in these task-owned checkouts`));
  assert.match(call.stdin, new RegExp(`an isolated worktree of ${lib}`));

  // A plain follow-up resumes the same conversation with the same checkouts.
  const second = await m.start({ threadId, prompt: "Continue" });
  await settle(m, second.id);
  call = (await invocations())[1];
  assert.equal(call.cwd, app);
  assert.deepEqual(flag(call.argv, "--resume"), ["sess-multi"]);
  assert.deepEqual(flag(call.argv, "--add-dir"), [appCommon, libTree, libCommon]);

  // Adding a repository extends the same conversation; it is not a new worker.
  const third = await m.start({ threadId, prompt: "Now docs too", repos: [docs] });
  await settle(m, third.id);
  call = (await invocations())[2];
  const docsCommon = await realpath(join(docs, ".git"));
  const docsTree = (await taskRead(threadId)).workspace[docsCommon].path;
  assert.equal(call.cwd, app);
  assert.deepEqual(flag(call.argv, "--resume"), ["sess-multi"]);
  assert.deepEqual(flag(call.argv, "--add-dir"), [appCommon, libTree, libCommon, docsTree, docsCommon]);
  assert.equal(await readFile(join(libTree, "factory-marker.txt"), "utf8"), "written\nwritten\nwritten\n");
  assert.equal(await readFile(join(docsTree, "factory-marker.txt"), "utf8"), "written\n");
  assert.equal(await exists(join(docs, "factory-marker.txt")), false);
  const stored = await taskRead(threadId);
  assert.deepEqual(stored.sessions, { [`primary:${app}`]: "sess-multi" });
  assert.equal(Object.keys(stored.workspace).length, 3);
  // Naming the original again resolves to the task's worktree rather than a second one.
  const again = await m.start({ threadId, prompt: "lib again", repos: [lib] });
  await settle(m, again.id);
  assert.equal((await taskRead(threadId)).workspace[libCommon].path, libTree);
});

test("two roots starting in one original checkout get their own worktrees, even while one is idle", async (t) => {
  const { root } = await harness(t);
  const app = await repository(root, "app");
  const appCommon = await realpath(join(app, ".git"));
  await writeFile(join(app, "README.md"), "uncommitted original edit\n");
  // One service owns both root sessions, as the bridge does; both default to the original.
  const m = stubbed(codexRoot(t, app));
  const a = await m.start({ threadId: "task-a", prompt: "a" });
  const aTree = (await taskRead("task-a")).workspace[appCommon].path;
  assert.equal(a.cwd, aTree);
  assert.notEqual(aTree, app);
  // Task A's worker may still be running: B does not wait for it, because nothing is shared.
  const b = await m.start({ threadId: "task-b", prompt: "b" });
  const bTree = (await taskRead("task-b")).workspace[appCommon].path;
  assert.equal(b.cwd, bTree);
  assert.notEqual(bTree, aTree);
  await finish(m);
  // With A idle, a fresh root still cannot take A's checkout over.
  await assert.rejects(
    m.start({ threadId: "task-c", prompt: "take a", cwd: aTree }),
    new RegExp(`is a checkout owned by another Factory task \\(${aTree}\\)`),
  );
  assert.equal((await taskRead("task-c")).workspace, undefined);
  assert.equal((await readOwners())[aTree].taskId, "task-a");
  // The original was never written or adopted by either task.
  assert.equal(git(app, "status", "--porcelain"), "M README.md");
  assert.equal(await readFile(join(aTree, "README.md"), "utf8"), "app\n");
  assert.equal((await readOwners())[app], undefined);
});

test("independent tasks cannot claim another task's checkout by alias, nesting or containment", async (t) => {
  const { root } = await harness(t);
  const app = await repository(root, "app");
  const lib = await repository(root, "lib");
  const m = stubbed(codexRoot(t, app));
  await m.start({ threadId: "task-one", prompt: "one", repos: [lib] });
  await m.start({ threadId: "task-two", prompt: "two", repos: [lib] });
  const libCommon = await realpath(join(lib, ".git"));
  const oneTree = (await taskRead("task-one")).workspace[libCommon].path;
  const twoTree = (await taskRead("task-two")).workspace[libCommon].path;
  assert.notEqual(twoTree, oneTree);
  assert.equal(git(twoTree, "rev-parse", "HEAD"), git(lib, "rev-parse", "HEAD"));
  await finish(m);

  await mkdir(join(oneTree, "nested"));
  await symlink(oneTree, join(root, "alias"));
  for (const target of [oneTree, join(oneTree, "nested"), join(root, "alias")])
    await assert.rejects(
      m.start({ threadId: "task-three", prompt: "steal", repos: [target] }),
      new RegExp(`owned by another Factory task \\(${oneTree}\\)`),
    );
  assert.equal((await taskRead("task-three")).workspace, undefined);

  // A checkout that contains another task's checkout is refused too.
  const outer = join(root, "outer");
  git(app, "worktree", "add", "-q", "--detach", outer);
  git(lib, "worktree", "add", "-q", "--detach", join(outer, "inner"));
  await m.start({ threadId: "task-inner", prompt: "inner", repos: [join(outer, "inner")] });
  await finish(m);
  await assert.rejects(
    m.start({ threadId: "task-three", prompt: "outer", cwd: outer }),
    /overlaps a checkout owned by another Factory task/,
  );

  // Removing a checkout releases it; nothing else ever does.
  assert.equal((await readOwners())[oneTree].taskId, "task-one");
  git(lib, "worktree", "remove", "--force", oneTree);
  await m.start({ threadId: "task-three", prompt: "now free", repos: [lib] });
  assert.equal((await readOwners())[oneTree], undefined);
});

test("an unreadable checkout keeps its owner; only a confirmed absence releases it", async (t) => {
  const { root } = await harness(t);
  const guarded = join(root, "guarded");
  const checkout = join(guarded, "checkout");
  await mkdir(checkout, { recursive: true });
  await claimCheckouts("owner", [{ path: checkout, project: "p", source: null }]);
  await chmod(guarded, 0o000);
  t.after(() => chmod(guarded, 0o700).catch(() => {}));
  // stat fails with EACCES here: that is not evidence the checkout is gone.
  await assert.rejects(
    claimCheckouts("intruder", [{ path: checkout, project: "p", source: null }]),
    /owned by another Factory task/,
  );
  await chmod(guarded, 0o700);
  assert.equal((await readOwners())[checkout].taskId, "owner");
  await rm(guarded, { recursive: true });
  // Once it is confirmed gone, the path is free for another task.
  await claimCheckouts("intruder", [{ path: checkout, project: "p", source: null }]);
  assert.equal((await readOwners())[checkout].taskId, "intruder");
});

test("a delegation that fails before launch claims nothing", async (t) => {
  const { root } = await harness(t);
  const app = await linkedCheckout(root, "app");
  const m = codexRoot(t, app);
  m.launch = async () => {
    throw new Error("fixture launch failed");
  };
  await assert.rejects(m.start({ threadId: "failed", prompt: "x" }), /fixture launch failed/);
  assert.deepEqual(await readOwners(), {});
});

test("a retry after a failed launch reuses its worktree under a symlinked FACTORY_HOME", async (t) => {
  const { root } = await harness(t);
  // The home is reached through a symlink, as /tmp and /var are on macOS.
  await mkdir(join(root, "real-home"));
  await symlink(join(root, "real-home"), join(root, "link-home"));
  process.env.FACTORY_HOME = join(root, "link-home");
  await initStore();
  await configWrite({ ...defaults(), mode: "manual" });
  const app = await repository(root, "app");
  const m = codexRoot(t, app);
  m.launch = async () => {
    throw new Error("fixture launch failed");
  };
  // The first attempt creates the isolated worktree, then fails before launch and claims nothing.
  await assert.rejects(m.start({ threadId: "retry", prompt: "x" }), /fixture launch failed/);
  // The retry must find that same worktree rather than refuse it as foreign.
  stubbed(m);
  const run = await m.start({ threadId: "retry", prompt: "x" });
  assert.ok(run.cwd.startsWith(await realpath(join(root, "real-home", "worktrees"))), run.cwd);
  assert.equal(run.cwd, await realpath(run.cwd));
  assert.equal(git(app, "worktree", "list", "--porcelain").match(/^worktree /gm).length, 2);
  assert.equal((await readOwners())[run.cwd].taskId, "retry");
});

test("a primary conversation refuses a second checkout of a mapped repository", async (t) => {
  const { root } = await harness(t);
  const app = await linkedCheckout(root, "app");
  const other = await linkedCheckout(root, "app-other", (await checkoutInfo(app)).project.replace(/\/\.git$/, ""));
  const m = stubbed(codexRoot(t, app));
  await m.start({ threadId: "bound", prompt: "first" });
  await finish(m);
  await assert.rejects(
    m.start({ threadId: "bound", prompt: "elsewhere", cwd: other }),
    new RegExp(`already owns ${app} for repository`),
  );
  // A fresh conversation never shares a primary checkout: the root's own checkout becomes the
  // source of a separate isolated worktree, and no primary session is resumed.
  const task = await taskRead("bound");
  task.sessions = { [`primary:${app}`]: "primary-session" };
  await taskWrite(task);
  const fresh = await m.start({ threadId: "bound", prompt: "isolated", fresh: true });
  assert.notEqual(fresh.cwd, app);
  assert.equal(fresh.workspace[(await checkoutInfo(app)).project].source, app);
  assert.equal(git(fresh.cwd, "rev-parse", "HEAD"), git(app, "rev-parse", "HEAD"));
  assert.equal(fresh.claudeSession, null);
  assert.equal((await taskRead("bound")).primaryCwd, app);
});

test("a root outside Git is refused rather than given an unowned directory", async (t) => {
  const { root } = await harness(t);
  const plain = join(root, "plain");
  await mkdir(plain);
  const m = stubbed(codexRoot(t, await realpath(plain)));
  await assert.rejects(m.start({ threadId: "plain", prompt: "x" }), /is not a Git checkout/);
  assert.equal((await taskRead("plain")).workerBinding, undefined);
});

const legacyTask = (id, primary) => ({
  id,
  override: "auto",
  disabled: false,
  runId: null,
  runIds: [],
  claudeSession: null,
  supervisionReplies: 0,
  primaryCwd: primary,
  workerBinding: { executor: "claude", gateway: null },
  sessions: { [`primary:${primary}`]: "legacy-session" },
});

test("a pre-workspace record in a linked checkout keeps its saved conversation", async (t) => {
  const { root } = await harness(t);
  const lib = await repository(root, "lib");
  const primary = await linkedCheckout(root, "app-task");
  await taskWrite(legacyTask("legacy", primary));
  // The root has since moved to another repository; that never widens the workspace.
  const m = stubbed(codexRoot(t, lib));
  const run = await m.start({ threadId: "legacy", prompt: "continue" });
  assert.equal(run.cwd, primary);
  assert.equal(run.claudeSession, "legacy-session");
  assert.deepEqual(Object.values((await taskRead("legacy")).workspace), [
    { path: primary, source: null, owned: true },
  ]);
  assert.equal((await readOwners())[primary].taskId, "legacy");
  await finish(m);
  const extended = await m.start({ threadId: "legacy", prompt: "with lib", repos: [lib] });
  assert.equal(extended.claudeSession, "legacy-session");
  assert.equal(extended.cwd, primary);
  assert.equal(Object.keys((await taskRead("legacy")).workspace).length, 2);
  await finish(m);
  // A fresh conversation naming the primary's own linked checkout gets an isolated copy instead.
  const fresh = await m.start({ threadId: "legacy", prompt: "side task", cwd: primary, fresh: true });
  assert.notEqual(fresh.cwd, primary);
  assert.equal(git(fresh.cwd, "rev-parse", "HEAD"), git(primary, "rev-parse", "HEAD"));
  assert.equal(fresh.workspace[(await checkoutInfo(primary)).project].source, primary);
});

test("a pre-workspace conversation bound to an original checkout is refused with its remedy", async (t) => {
  const { root } = await harness(t);
  const app = await repository(root, "app");
  await taskWrite(legacyTask("legacy-original", app));
  const m = stubbed(codexRoot(t, app));
  for (const args of [{ prompt: "continue" }, { prompt: "add", repos: [await repository(root, "lib")] }])
    await assert.rejects(
      m.start({ threadId: "legacy-original", ...args }),
      new RegExp(`bound to ${app}, an original checkout.*Start a new root session`),
    );
  assert.equal(m.runs.size, 0);
  assert.equal((await taskRead("legacy-original")).workspace, undefined);
  assert.deepEqual(await readOwners(), {});
  // A new root session in the same original starts cleanly in its own worktree.
  const fresh = await m.start({ threadId: "new-root", prompt: "start over" });
  assert.notEqual(fresh.cwd, app);
});

test("per-repository off covers every target repository", async (t) => {
  const { root } = await harness(t);
  const app = await repository(root, "app");
  const lib = await repository(root, "lib");
  const config = { ...defaults(), mode: "manual" };
  config.projects = { [await realpath(join(lib, ".git"))]: "off" };
  await configWrite(config);
  const m = stubbed(codexRoot(t, app));
  await assert.rejects(
    m.start({ threadId: "off-target", prompt: "x", repos: [lib] }),
    new RegExp(`disabled for repository ${await realpath(join(lib, ".git"))}`),
  );
  await m.start({ threadId: "off-target", prompt: "app only" });
});

test("extra checkouts widen nothing: a read-only Codex sandbox gets no writable roots", async (t) => {
  const { root } = await harness(t);
  const app = await repository(root, "app");
  const lib = await repository(root, "lib");
  const tree = join(root, "lib-task");
  git(lib, "worktree", "add", "-q", "--detach", tree);
  const map = {
    [(await checkoutInfo(app)).project]: { path: app, source: null, owned: false },
    [(await checkoutInfo(tree)).project]: { path: await realpath(tree), source: null, owned: true },
  };
  const roots = extraRoots(map, app);
  assert.deepEqual(roots, [await realpath(tree), await realpath(join(lib, ".git"))]);
  assert.deepEqual(codexPermission("default", roots).args, [
    "-c",
    'sandbox_mode="read-only"',
    "-c",
    'approval_policy="never"',
  ]);
  assert.ok(
    codexPermission("acceptEdits", roots).args.includes(
      `sandbox_workspace_write.writable_roots=${JSON.stringify(roots)}`,
    ),
  );
  // One adopted checkout says nothing new to the worker; a second one is named.
  assert.equal(workspaceNote({ [app]: { path: app, source: null } }, app), "");
  assert.match(workspaceNote(map, app), new RegExp(`- ${await realpath(tree)} \\(repository`));
});
