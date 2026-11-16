import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { fetchStudioRevision, studioCheckout } from "../src/fleet-source.mjs";
import { dispatchFleet, fleetTarget } from "../scripts/fleet-delegate.mjs";
import { writePlacement } from "../src/fleet-placement.mjs";

const git = (cwd, ...args) => execFileSync("/usr/bin/git", ["-C", cwd, ...args], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).trim();

test("a Studio attempt fetches its exact commit, isolates edits, and resumes the same checkout", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "factory-git-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, "init", "-b", "main", "upstream");
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
  git(mirror, "fetch", "--depth=1", "origin", revision);
  assert.equal(git(mirror, "rev-parse", "--is-shallow-repository"), "true");
  const comparisonRevision = git(upstream, "rev-parse", "HEAD");
  const snapshot = await fetchStudioRevision(mirror, revision);
  assert.deepEqual(snapshot, { comparisonRef: "refs/remotes/origin/main", comparisonRevision });
  assert.equal(git(mirror, "rev-parse", "--is-shallow-repository"), "false");
  await writeFile(file, "advanced after observation\n");
  git(upstream, "commit", "-am", "Advance after observation");
  const binding = { mirror, attemptId: randomUUID(), ...snapshot };
  const cwd = await studioCheckout(root, binding, revision);
  assert.equal(git(cwd, "rev-parse", "HEAD"), revision);
  assert.equal(await readFile(join(cwd, "tracked.txt"), "utf8"), "requested\n");
  assert.equal(git(cwd, "remote", "get-url", "origin"), join(cwd, ".git"));
  assert.equal(git(cwd, "symbolic-ref", "refs/remotes/origin/HEAD"), "refs/remotes/origin/main");
  assert.equal(git(cwd, "ls-remote", "--exit-code", "origin", "refs/heads/main"), `${comparisonRevision}\trefs/heads/main`);
  git(cwd, "fetch", "--no-tags", "--no-write-fetch-head", "--", "origin", "refs/heads/main:refs/morpheus/test");
  assert.equal(git(cwd, "rev-parse", "refs/morpheus/test"), comparisonRevision);
  assert.equal(git(cwd, "merge-base", "HEAD", "origin/main"), revision);
  await writeFile(join(cwd, "tracked.txt"), "worker edit\n");
  assert.equal(await studioCheckout(root, binding, revision, true), cwd);
  assert.equal(await readFile(join(cwd, "tracked.txt"), "utf8"), "worker edit\n");
  const next = await studioCheckout(root, { ...binding, attemptId: randomUUID() }, revision);
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
  const shared = '{ "mode": "manual" }';
  await writeFile(join(root, "config.json"), shared, { mode: 0o600 });
  await writePlacement("fleet");
  assert.equal(await readFile(join(root, "config.json"), "utf8"), shared);
  assert.deepEqual(JSON.parse(await readFile(join(root, "fleet-placement.json"), "utf8")), { placement: "fleet" });
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

test("single-repository Fleet can still check out an unrelated published commit", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "factory-orphan-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, "init", "-b", "main", "upstream");
  const upstream = join(root, "upstream");
  git(upstream, "config", "user.email", "fixture@example.test");
  git(upstream, "config", "user.name", "Fixture");
  await writeFile(join(upstream, "main.txt"), "default branch");
  git(upstream, "add", "main.txt");
  git(upstream, "commit", "-m", "Main");
  const trunk = git(upstream, "rev-parse", "HEAD");
  git(upstream, "switch", "--orphan", "archive");
  await writeFile(join(upstream, "archive.txt"), "orphan source");
  git(upstream, "add", "archive.txt");
  git(upstream, "commit", "-m", "Archive");
  const revision = git(upstream, "rev-parse", "HEAD");
  git(upstream, "switch", "main");
  git(root, "init", "--bare", "mirror");
  const mirror = join(root, "mirror");
  git(mirror, "remote", "add", "origin", upstream);
  const comparison = await fetchStudioRevision(mirror, revision);
  const cwd = await studioCheckout(root, { ...comparison, mirror, attemptId: randomUUID() }, revision);
  assert.equal(git(cwd, "rev-parse", "HEAD"), revision);
  assert.equal(git(cwd, "ls-remote", "origin", "refs/heads/main"), [trunk, "refs/heads/main"].join("\t"));
  assert.throws(() => git(cwd, "merge-base", "HEAD", "origin/main"), { status: 1 });
  assert.equal(git(cwd, "diff", "--name-status", "HEAD", "origin/main"), "D\tarchive.txt\nA\tmain.txt");
});
