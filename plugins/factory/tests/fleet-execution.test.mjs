import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createStudioExecutors } from "../src/fleet-execution.mjs";

const task = (project, checkout = "git") => ({ source: { project, checkout } });

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
