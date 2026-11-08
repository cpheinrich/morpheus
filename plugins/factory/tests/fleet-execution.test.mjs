import assert from "node:assert/strict";
import { test } from "node:test";
import { createStudioExecutors } from "../src/fleet-execution.mjs";

const primary = {
  account: "executor", node: "/node", script: "/executor", workerConfig: "/worker",
  project: "one", sourceMirror: "/one.git",
};
const task = (project, checkout = "git") => ({ source: { project, checkout } });

test("Studio routes both projects to their own mirrors and recovers through the shared worker", async () => {
  const created = [];
  const runner = createStudioExecutors({ ...primary, additionalGitMirrors: { two: "/two.git" } }, null, null, (route) => {
    created.push(route);
    return {
      prepare: async () => route.sourceMirror,
      execute: async () => route.project,
      recover: async (id) => [route.workerConfig, id],
    };
  });
  assert.deepEqual(created, [primary, { ...primary, project: "two", sourceMirror: "/two.git" }]);
  assert.equal(await runner.prepare(task("one")), "/one.git");
  assert.equal(await runner.prepare(task("two")), "/two.git");
  assert.equal(await runner.execute({ task: task("one", "fixture") }), "one");
  assert.equal(await runner.execute({ task: task("two") }), "two");
  for (const source of [task("unknown"), task("constructor"), task("two", "fixture")]) {
    assert.equal(await runner.prepare(source), false);
    assert.equal((await runner.execute({ task: source })).terminationVerified, true);
    assert.equal((await runner.execute({ task: source })).result.outcome, "failed");
  }
  assert.deepEqual(await runner.recover("admission"), ["/worker", "admission"]);
});

test("Studio refuses malformed and duplicate extra Git routes before running", () => {
  for (const additionalGitMirrors of [[], { one: "/two.git" }, { two: "/one.git" }, { two: "relative" }, { "bad/project": "/two.git" }]) {
    assert.throws(() => createStudioExecutors({ ...primary, additionalGitMirrors }), /Invalid/);
  }
});
