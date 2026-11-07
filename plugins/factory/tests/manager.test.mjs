import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Manager } from "../src/service.mjs";
import {
  initStore,
  configWrite,
  taskRead,
  taskWrite,
  runDir,
  atomic,
} from "../src/store.mjs";
import { defaults } from "../src/config.mjs";
import { identity } from "../src/processes.mjs";
import { randomUUID } from "node:crypto";
test("restart keeps a canceled worktree fenced while group exit is unverified", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "manager-cancel-"));
  const previous = process.env.FACTORY_HOME;
  process.env.FACTORY_HOME = root;
  t.after(async () => {
    if (previous === undefined) delete process.env.FACTORY_HOME;
    else process.env.FACTORY_HOME = previous;
    await rm(root, { recursive: true, force: true });
  });
  await initStore();
  const manager = new Manager();
  const id = randomUUID();
  const { mkdir } = await import("node:fs/promises");
  await mkdir(runDir(id));
  const cwd = join(root, "claimed");
  await atomic(join(runDir(id), "run.json"), { id, threadId: "first", cwd, state: "cleanup_pending", terminal: false });
  const processPath = join(runDir(id), "process.json");
  const stopped = {
    state: "exited", taskCanceled: true, interrupted: true, groupExitVerified: false,
    // A different identity prevents any signal to this live test process.
    claudePid: process.pid, claudeIdentity: "different process",
  };
  await atomic(processPath, stopped);
  await assert.rejects(manager.recoverOrphans({ id: "second", cwd }), /interrupted run is being cleaned up/);
  assert.equal((await manager.status(id)).state, "cleanup_pending");
  await atomic(processPath, { ...stopped, groupExitVerified: true });
  assert.equal((await manager.status(id)).taskCanceled, true);
  await manager.recoverOrphans({ id: "second", cwd });
});

test("supervision permits justified clarification but never implicit tool approval", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "manager-"));
  process.env.FACTORY_HOME = root;
  t.after(() => rm(root, { recursive: true, force: true }));
  await initStore();
  await configWrite({
    ...defaults(),
    mode: "manual",
    maxSupervisionReplies: 1,
  });
  const m = new Manager();
  const sent = [];
  m.send = (run, message) => sent.push(message);
  const id = randomUUID();
  await import("node:fs/promises").then((f) => f.mkdir(runDir(id)));
  const r = {
    id,
    threadId: "task",
    state: "needs_input",
    question: {
      id: "q",
      request: { tool_name: "Bash", input: { command: "echo x" } },
    },
  };
  m.runs.set(id, r);
  await assert.rejects(
    m.answer({
      runId: id,
      questionId: "q",
      source: "codex",
      reason: "routine",
    }),
    /user approval/,
  );
  assert.equal(sent.length, 0);
  r.question.request = {
    tool_name: "AskUserQuestion",
    input: { questions: [{ question: "Color?" }] },
  };
  await assert.rejects(
    m.answer({
      runId: id,
      questionId: "old",
      source: "codex",
      reason: "routine",
    }),
    /Stale/,
  );
  await assert.rejects(
    m.answer({ runId: id, questionId: "q", source: "codex" }),
    /Record why/,
  );
  await m.answer({
    runId: id,
    questionId: "q",
    source: "codex",
    reason: "Reversible test fixture choice",
    answers: { "Color?": "Blue" },
  });
  assert.deepEqual(sent[0].message.response.response.updatedInput.answers, {
    "Color?": "Blue",
  });
  assert.equal(r.question, null);
  assert.equal((await taskRead("task")).supervisionReplies, 1);
  r.question = {
    id: "q2",
    request: { tool_name: "AskUserQuestion", input: {} },
  };
  await assert.rejects(
    m.answer({
      runId: id,
      questionId: "q2",
      source: "codex",
      reason: "routine",
    }),
    /limit/,
  );
  const audit = JSON.parse(
    await readFile(join(runDir(id), "answer-1.json"), "utf8"),
  );
  assert.equal(audit.source, "codex");
  assert.equal(audit.reason, "Reversible test fixture choice");
});
test("persisted state recovers exited runs without replaying work", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "recovery-"));
  process.env.FACTORY_HOME = root;
  t.after(() => rm(root, { recursive: true, force: true }));
  await initStore();
  const id = randomUUID();
  await import("node:fs/promises").then((f) => f.mkdir(runDir(id)));
  await atomic(join(runDir(id), "run.json"), {
    id,
    terminal: false,
    state: "running",
  });
  await atomic(join(runDir(id), "process.json"), { state: "exited" });
  const m = new Manager();
  assert.deepEqual(await m.status(id), {
    id,
    terminal: true,
    state: "interrupted",
  });
  assert.equal(m.runs.size, 0);
});

test("bridge upgrade shutdown is allowed only when no owned work is active", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "upgrade-shutdown-"));
  process.env.FACTORY_HOME = root;
  t.after(() => rm(root, { recursive: true, force: true }));
  await initStore();
  const manager = new Manager();
  assert.deepEqual(await manager.dispatch("shutdown"), { stopping: true });

  const id = randomUUID();
  await import("node:fs/promises").then((f) => f.mkdir(runDir(id)));
  await atomic(join(runDir(id), "process.json"), { state: "running" });
  assert.deepEqual(await manager.dispatch("shutdown"), { stopping: true });
  assert.equal(
    JSON.parse(await readFile(join(runDir(id), "process.json"), "utf8"))
      .state,
    "exited",
  );
  manager.draining = false;
  manager.busy = true;
  await assert.rejects(manager.dispatch("shutdown"), /delegation is starting/);
  assert.equal(manager.draining, false);
  manager.busy = false;
  await atomic(join(runDir(id), "process.json"), {
    state: "running",
    guardianPid: process.pid,
    guardianIdentity: await identity(process.pid),
  });
  await assert.rejects(
    manager.dispatch("shutdown"),
    /owned Claude process/,
  );
  assert.equal(manager.draining, false);
  manager.processOwnership = async () => "unknown";
  await assert.rejects(
    manager.dispatch("shutdown"),
    /could not be verified/,
  );
  assert.equal(manager.draining, false);
  manager.processOwnership = async () => "stale";
  await atomic(join(runDir(id), "process.json"), { state: "exited" });
  manager.runs.set(id, { terminal: false });
  await assert.rejects(manager.dispatch("shutdown"), /Active Claude runs/);
  assert.equal(manager.draining, false);
  manager.runs.clear();
  manager.draining = true;
  await assert.rejects(manager.start({}), /upgrade is in progress/);
});

test("real user answer resets autonomous budget even when configured limit is zero", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "user-answer-"));
  process.env.FACTORY_HOME = root;
  t.after(() => rm(root, { recursive: true, force: true }));
  await initStore();
  await configWrite({
    ...defaults(),
    mode: "manual",
    maxSupervisionReplies: 0,
  });
  const m = new Manager();
  m.send = () => {};
  const id = randomUUID();
  await import("node:fs/promises").then((f) => f.mkdir(runDir(id)));
  const task = await taskRead("user-task");
  task.supervisionReplies = 8;
  task.answerSequence = 8;
  await taskWrite(task);
  const run = {
    id,
    threadId: task.id,
    state: "needs_input",
    question: {
      id: "q",
      request: { tool_name: "Bash", input: { command: "echo approved" } },
    },
  };
  m.runs.set(id, run);
  await m.answer({
    runId: id,
    questionId: "q",
    source: "user",
    reason: "User explicitly approved this test command",
  });
  assert.equal((await taskRead(task.id)).supervisionReplies, 0);
  assert.equal((await taskRead(task.id)).answerSequence, 9);
  assert.equal(run.state, "running");
  const audit = JSON.parse(
    await readFile(join(runDir(id), "answer-9.json"), "utf8"),
  );
  assert.equal(audit.source, "user");
  run.question = {
    id: "next",
    request: { tool_name: "AskUserQuestion", input: {} },
  };
  await assert.rejects(
    m.answer({
      runId: id,
      questionId: "next",
      source: "codex",
      reason: "routine",
    }),
    /limit/,
  );
});

test("unverified orphan remains nonterminal and blocks replacement", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "orphan-state-"));
  process.env.FACTORY_HOME = root;
  t.after(() => rm(root, { recursive: true, force: true }));
  await initStore();
  const id = randomUUID();
  await import("node:fs/promises").then((f) => f.mkdir(runDir(id)));
  await atomic(join(runDir(id), "run.json"), {
    id,
    state: "running",
    terminal: false,
  });
  await atomic(join(runDir(id), "process.json"), {
    state: "running",
    guardianPid: 99999999,
    guardianIdentity: "gone",
    claudePid: process.pid,
    claudeIdentity: "different process",
  });
  const status = await new Manager().status(id);
  assert.equal(status.terminal, false);
  assert.equal(status.state, "cleanup_pending");
  assert.equal(
    JSON.parse(await readFile(join(runDir(id), "process.json"), "utf8")).state,
    "running",
  );
});

test("guardian crash cleanup records process exit before releasing run lock", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "orphan-tick-"));
  process.env.FACTORY_HOME = root;
  t.after(() => rm(root, { recursive: true, force: true }));
  await initStore();
  const id = randomUUID();
  await import("node:fs/promises").then((f) => f.mkdir(runDir(id)));
  await atomic(join(runDir(id), "process.json"), {
    state: "running",
    claudePid: 99999999,
    claudeIdentity: "former worker",
  });
  const m = new Manager();
  const run = {
    id,
    threadId: "t",
    terminal: false,
    state: "running",
    guardianExited: true,
    guardian: { stdin: { destroy() {}, destroyed: false } },
    offset: 0,
    lastLease: 0,
    grace: 0,
  };
  m.runs.set(id, run);
  await m.tick(run);
  assert.equal(m.runs.size, 0);
  assert.equal(run.terminal, true);
  assert.equal(
    JSON.parse(await readFile(join(runDir(id), "process.json"), "utf8")).state,
    "exited",
  );
});
test("inspect previews an unmapped model's fallback, and a launch carries it without a question", async () => {
  const { previewSelection } = await import("../src/service.mjs");
  const { claudeArgs } = await import("../src/claude.mjs");
  const snapshot = { model: "gpt-6.1-sol", reasoningEffort: "high" };
  const preview = previewSelection(defaults(), snapshot);
  assert.equal(preview.model, "opus");
  assert.equal(preview.source, "fallback");
  assert.equal(preview.codexModel, "gpt-6.1-sol");
  // The launch argv is built from the same selection: the provenance fields never reach
  // the CLI, and the model is the family alias the installed CLI resolves.
  const argv = claudeArgs(null, preview, "bypassPermissions");
  assert.equal(argv[argv.indexOf("--model") + 1], "opus");
  assert.equal(argv[argv.indexOf("--effort") + 1], "high");
  assert.ok(!argv.some((value) => /fallback|gpt-6\.1-sol/.test(String(value))));
  // A disabled fallback is reported by inspect rather than thrown at the coordinator.
  assert.match(
    previewSelection({ ...defaults(), modelFallback: null }, snapshot).error,
    /modelFallback is disabled/,
  );
});

test("remote Studio writes require verified current permissions and enabled root and target", async (t) => {
  const { execFileSync } = await import("node:child_process");
  const { mkdir } = await import("node:fs/promises");
  const { projectIdentity } = await import("../src/store.mjs");
  const directory = await mkdtemp(join(tmpdir(), "factory-remote-authority-"));
  const previous = process.env.FACTORY_HOME;
  process.env.FACTORY_HOME = join(directory, "factory");
  t.after(async () => {
    if (previous === undefined) delete process.env.FACTORY_HOME;
    else process.env.FACTORY_HOME = previous;
    await rm(directory, { recursive: true, force: true });
  });
  const cwd = join(directory, "root");
  const projectPath = join(directory, "target");
  for (const path of [cwd, projectPath]) {
    await mkdir(path);
    execFileSync("git", ["init", "-q", path]);
  }
  const rootId = randomUUID();
  const manager = new Manager();
  const sandbox = { type: "dangerFullAccess" };
  const args = { rootId, projectPath };
  const config = { ...defaults(), mode: "manual" };
  await configWrite(config);
  manager.snapshot = async (id) => {
    assert.equal(id, rootId);
    return { cwd, sandbox, approvalPolicy: "on-request" };
  };
  await assert.rejects(manager.factoryRemoteAuthorize(args), /cannot authorize Studio workspace writes/);
  manager.snapshot = async () => ({ cwd, sandbox, approvalPolicy: "never" });
  assert.deepEqual(await manager.factoryRemoteAuthorize(args), { authorized: true });
  await configWrite({ ...config, mode: "off" });
  await assert.rejects(manager.factoryRemoteAuthorize(args), /disabled for this task/);
  for (const path of [cwd, projectPath]) {
    const { project } = await projectIdentity(path);
    await configWrite({ ...config, projects: { [project]: "off" } });
    await assert.rejects(manager.factoryRemoteAuthorize(args), /disabled for repository/);
  }
  await configWrite(config);
  await taskWrite({ ...await taskRead(rootId), id: rootId, disabled: true });
  await assert.rejects(manager.factoryRemoteAuthorize(args), /disabled for this task/);
});
