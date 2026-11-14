import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { fetchStudioRevision, studioCheckout } from "../src/fleet-source.mjs";
import { dispatchFleet, fleetTarget } from "../scripts/fleet-delegate.mjs";

const git = (cwd, ...args) => execFileSync("/usr/bin/git", ["-C", cwd, ...args], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).trim();

test("a Studio attempt fetches its exact commit, isolates edits, and resumes the same checkout", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "factory-git-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, "init", "upstream");
  const upstream = join(root, "upstream");
  git(upstream, "config", "user.email", "fixture@example.test");
  git(upstream, "config", "user.name", "Fixture");
  const file = join(upstream, "tracked.txt");
  await writeFile(file, "requested\n");
  git(upstream, "add", "tracked.txt");
  git(upstream, "commit", "-m", "Requested");
  const revision = git(upstream, "rev-parse", "HEAD");
  await writeFile(file, "new tip\n");
  git(upstream, "commit", "-am", "New tip");
  git(root, "init", "--bare", "mirror");
  const mirror = join(root, "mirror");
  git(mirror, "remote", "add", "origin", upstream);
  await fetchStudioRevision(mirror, revision);
  const binding = { mirror, attemptId: randomUUID() };
  const cwd = await studioCheckout(root, binding, revision);
  assert.equal(git(cwd, "rev-parse", "HEAD"), revision);
  assert.equal(await readFile(join(cwd, "tracked.txt"), "utf8"), "requested\n");
  await writeFile(join(cwd, "tracked.txt"), "worker edit\n");
  assert.equal(await studioCheckout(root, binding, revision, true), cwd);
  assert.equal(await readFile(join(cwd, "tracked.txt"), "utf8"), "worker edit\n");
  const next = await studioCheckout(root, { mirror, attemptId: randomUUID() }, revision);
  assert.equal(await readFile(join(next, "tracked.txt"), "utf8"), "requested\n");
  await assert.rejects(studioCheckout(root, binding, revision), { code: "EEXIST" });
  await assert.rejects(studioCheckout(root, { mirror, attemptId: "../upstream" }, revision), /Invalid Studio checkout/);
  await assert.rejects(fetchStudioRevision(mirror, "main"), /Invalid Studio source/);
  await assert.rejects(fetchStudioRevision(mirror, "0".repeat(40)));

  git(upstream, "worktree", "add", "--detach", join(root, "claim"), revision);
  const config = { projects: { fixture: upstream } };
  assert.deepEqual(await fleetTarget(config, join(root, "claim")), { project: "fixture", revision });
  await assert.rejects(fleetTarget(config, upstream), /clean linked checkout/);
  await writeFile(join(root, "claim", "tracked.txt"), "dirty\n");
  await assert.rejects(fleetTarget(config, join(root, "claim")), /clean linked checkout/);
  const cwdForInspect = join(root, "claim");
  git(cwdForInspect, "restore", "tracked.txt");
  const before = process.env.FACTORY_HOME;
  process.env.FACTORY_HOME = root;
  t.after(() => {
    if (before === undefined) delete process.env.FACTORY_HOME;
    else process.env.FACTORY_HOME = before;
  });
  // A local source check must not imply that the remote endpoint is reachable.
  const localConfig = { ...config, endpoint: "https://localhost:1" };
  await writeFile(join(root, "fleet-controller.json"), JSON.stringify(localConfig), { mode: 0o600 });
  const rootId = randomUUID();
  const inspect = await dispatchFleet("inspect", { rootId, placement: "fleet", cwd: cwdForInspect }, {
    authorize(method, input) {
      assert.equal(method, "factory.remoteAuthorize");
      assert.deepEqual(input, { rootId, projectPath: upstream, checkoutPath: cwdForInspect });
    },
  });
  assert.equal(inspect.admission, "pending");
  assert.equal(inspect.availability, "unknown");
  assert.equal(inspect.quota, null);
  assert.equal(await dispatchFleet("inspect", { rootId, cwd: cwdForInspect }), undefined);
  await writeFile(join(root, "config.json"), JSON.stringify({ defaultPlacement: "fleet" }), { mode: 0o600 });
  const auto = await dispatchFleet("inspect", { rootId, cwd: cwdForInspect }, {
    authorize(method, input) {
      assert.equal(method, "factory.remoteAuthorize");
      assert.equal(input.checkoutPath, cwdForInspect);
    },
  });
  assert.deepEqual(auto, inspect);
  const runId = randomUUID();
  assert.equal(await dispatchFleet("status", { rootId, runId }), undefined, "existing local runs keep their route");
  assert.equal(await dispatchFleet("inspect", { rootId, placement: "local" }), undefined);
  await assert.rejects(dispatchFleet("inspect", { rootId, cwd: upstream }), /clean linked checkout/);
  await assert.rejects(dispatchFleet("delegate", { rootId, cwd: upstream, prompt: "test" }), /clean linked checkout/);
});
