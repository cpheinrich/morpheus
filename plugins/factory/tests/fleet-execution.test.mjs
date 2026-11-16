import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, realpath, rm, stat, symlink } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { createStudioExecutor, createStudioExecutors } from "../src/fleet-execution.mjs";

const task = (project, checkout = "git") => ({ source: { project, checkout } });

test("the Studio supervisor retains acknowledged deadline artifacts only with live authority and verified cleanup", async (t) => {
  const config = { account: "fixture", node: "/node", script: "/executor", workerConfig: "/worker", project: "fixture" };
  const request = { id: "task", attempt: { id: "attempt" }, source: { project: "fixture" }, selection: {} };
  const files = [{ name: "notes.txt", type: "text/plain", bytes: "YQ==" },
    { name: "waveform.mp4", type: "video/mp4", bytes: "Yg==" }];
  let reply;
  let launches = 0;
  t.mock.method(childProcess, "spawn", () => {
    launches++;
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough() });
    child.stdin.once("data", () => {
      for (const artifact of files) child.stdout.write(JSON.stringify({ artifact }) + "\n");
      child.stdout.end(JSON.stringify({ outcome: reply }) + "\n");
      setImmediate(() => child.emit("close", 0));
    });
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });

  for (const scenario of ["deadline", "partially uploaded", "unverified", "aborted", "ordinary failure"]) {
    const controller = new AbortController();
    const calls = [];
    const previousLaunches = launches;
    reply = { terminationVerified: scenario !== "unverified", result: { outcome: "failed" },
      diagnosticCode: scenario === "ordinary failure" ? undefined : "deadline_reached" };
    const executor = createStudioExecutor(config, async (operation, args) => {
      assert.equal(operation, "upload");
      calls.push(args);
      if (scenario === "partially uploaded" && calls.length === 2) throw new Error("fixture offline");
      return { name: args.name };
    }, async () => {
      if (scenario === "aborted") controller.abort();
    });
    const output = await executor.execute({ task: request, admissionId: "admission", prompt: "fixture", signal: controller.signal });
    if (scenario === "deadline" || scenario === "partially uploaded") {
      assert.deepEqual(calls, files.map(file => ({ ...file, taskId: "task", attemptId: "attempt" })));
      assert.equal(output.diagnosticCode, "deadline_reached");
      assert.equal(output.result.outcome, "failed");
      assert.deepEqual(output.result.artifacts, scenario === "deadline" ? ["notes.txt", "waveform.mp4"] : ["notes.txt"]);
    } else {
      assert.deepEqual(calls, []);
    }
    if (scenario === "aborted") assert.equal(launches, previousLaunches);
    if (scenario === "unverified") assert.deepEqual(output, { terminationVerified: false });
  }
});

test("late cleanup uploads only a result returned for the exact live admission", async (t) => {
  const config = { account: "fixture", node: "/node", script: "/executor", workerConfig: "/worker", project: "fixture" };
  const task = { id: "task", attempt: { id: "attempt" }, source: { project: "fixture" } };
  const calls = [];
  const requests = [];
  const artifact = { name: "handoff.json", type: "application/json", bytes: "e30=" };
  let grant = true;
  let revokeBeforeResult = false;
  let proof = {
    admissionId: "owned",
    terminationVerified: true,
    invocation: { launch: "session" },
    result: { outcome: "completed" },
  };
  t.mock.method(childProcess, "spawn", () => {
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough() });
    child.stdin.once("data", (data) => {
      requests.push(JSON.parse(data.toString().split("\n")[0]));
      if (revokeBeforeResult) grant = false;
      child.stdout.write(JSON.stringify({ artifact }) + "\n");
      child.stdout.end(JSON.stringify({ outcome: proof }) + "\n");
      setImmediate(() => child.emit("close", 0));
    });
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const executor = createStudioExecutor(config, async (operation, args) => {
    calls.push([operation, args]);
    return { name: args.name };
  });
  await executor.recover("owned", task);
  assert.equal(requests[0].recovery, undefined);
  assert.deepEqual(calls, []);
  const authority = { signal: new AbortController().signal, canPublish: () => grant };
  const restored = await executor.recover("owned", task, authority);
  assert.deepEqual(requests[1].recovery.source, task.source);
  assert.deepEqual(restored.result.artifacts, ["handoff.json"]);
  revokeBeforeResult = true;
  await executor.recover("owned", task, authority);
  revokeBeforeResult = false;
  grant = true;
  proof = { ...proof, admissionId: "foreign" };
  assert.equal(await executor.recover("owned", task, authority), false);
  assert.deepEqual(calls, [["upload", { ...artifact, taskId: "task", attemptId: "attempt" }]]);
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "factory-executors-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const one = join(root, "One.git"), two = join(root, "two.git"), alias = join(root, "alias.git");
  await Promise.all([mkdir(one), mkdir(two), symlink(one, alias)]);
  const primary = { account: "exec1", node: "/node", script: "/executor", workerConfig: "/worker1",
    project: "one", sourceMirror: one };
  const extra = { account: "exec2", workerConfig: "/worker2", sourceMirror: two };
  return { primary, extra, alias };
}

test("Studio routes both projects to their own account and mirror, including recovery", async (t) => {
  const { primary, extra } = await fixture(t);
  const created = [];
  const runner = createStudioExecutors({ ...primary, additionalGitProjects: { two: extra } }, null, null, (route) => {
    created.push(route);
    return {
      prepare: async () => route.sourceMirror,
      execute: async () => route.account,
      recover: async (id) => [route.workerConfig, id],
    };
  });
  assert.deepEqual(created, [primary, { ...primary, ...extra, project: "two", sourceMirror: await realpath(extra.sourceMirror) }]);
  assert.equal(await runner.prepare(task("one")), created[0].sourceMirror);
  assert.equal(await runner.prepare(task("two")), created[1].sourceMirror);
  assert.equal(await runner.execute({ task: task("one", "fixture") }), "exec1");
  assert.equal(await runner.execute({ task: task("two") }), "exec2");
  for (const source of [task("unknown"), task("constructor"), task("two", "fixture")]) {
    assert.equal(await runner.prepare(source), false);
    const output = await runner.execute({ task: source });
    assert.equal(output.terminationVerified, true);
    assert.equal(output.result.outcome, "failed");
    assert.equal(await runner.recover("admission", source), false);
  }
  assert.deepEqual(await runner.recover("admission", task("two")), ["/worker2", "admission"]);
  assert.deepEqual(await runner.recover("admission", task("one")), ["/worker1", "admission"]);
});

test("Studio refuses malformed and duplicate Git routes, including mirror aliases", async (t) => {
  const { primary, extra, alias } = await fixture(t);
  for (const additionalGitProjects of [[], { one: extra }, { two: { ...extra, account: primary.account } },
    { two: { ...extra, sourceMirror: primary.sourceMirror + "/." } }, { two: { ...extra, sourceMirror: alias } },
    { two: { ...extra, sourceMirror: "relative" } }, { "bad/project": extra }]) {
    assert.throws(() => createStudioExecutors({ ...primary, additionalGitProjects }), /Invalid|Duplicate/);
  }
});

test("Studio rejects a case alias of the primary mirror on case-insensitive filesystems", async (t) => {
  const { primary, extra } = await fixture(t);
  const sourceMirror = primary.sourceMirror.replace(/One[.]git$/, "one.git");
  try {
    await stat(sourceMirror);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    t.skip("case-sensitive filesystem");
    return;
  }
  const additionalGitProjects = { two: { ...extra, sourceMirror } };
  assert.throws(() => createStudioExecutors({ ...primary, additionalGitProjects }), /Duplicate Studio Git mirror/);
});

test("preparation distinguishes source fetch, executor invocation and checkout failures without raw diagnostics", async t => {
  const config = { account: "fixture", node: "/node", script: "/executor", workerConfig: "/worker", project: "fixture", sourceMirror: "/unavailable-fixture" };
  const task = { source: { project: "fixture", checkout: "git", revision: "1".repeat(40) }, attempt: { id: "attempt" } };
  const source = createStudioExecutor(config, null, null);
  assert.deepEqual(await source.prepare(task, new AbortController().signal), { prepared: false, diagnosticCode: "source_fetch_failed" });
  t.mock.method(childProcess, "spawn", () => { throw new Error("private raw invocation diagnostic"); });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  // A non-Git legacy execution exercises invocation failure without source IO.
  const failed = await source.execute({ task: { id: "task", attempt: task.attempt, source: { project: "fixture" }, selection: {} },
    admissionId: "admission", signal: new AbortController().signal });
  // Quota must be available before the invocation boundary.
  assert.equal(failed.invocation.launch, "never-launched");
  const execute = createStudioExecutor(config, null, async () => {});
  assert.deepEqual(await execute.execute({ task: { id: "task", attempt: task.attempt, source: { project: "fixture" }, selection: {} },
    admissionId: "admission", signal: new AbortController().signal }), { terminationVerified: false, diagnosticCode: "executor_invocation_failed" });
});
