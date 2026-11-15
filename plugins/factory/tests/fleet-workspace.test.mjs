import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import childProcess, { execFileSync, spawn } from "node:child_process";
import { once, EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile, symlink } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { bindWorkspace, digest, verifyWorkspace } from "../src/fleet-workspace.mjs";
import { createFleetApi } from "../src/fleet-api.mjs";
import { readWorkerConfig } from "../src/gateway-worker.mjs";
import { createStudioExecutor } from "../src/fleet-execution.mjs";
import { authorizeFleetProjects } from "../scripts/fleet-mcp.mjs";
import { projectRun, dispatchFleet } from "../scripts/fleet-delegate.mjs";
import { checkoutWorkspace } from "../src/fleet-workspace-checkout.mjs";
import { observeFactory } from "../src/host/reporting/factory.mjs";

const git = (cwd, ...args) => execFileSync("/usr/bin/git", ["-C", cwd, ...args], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).trim();
const executorScript = fileURLToPath(new URL("../scripts/fleet-executor.mjs", import.meta.url));

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "factory-workspace-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const mirrors = {}, revisions = {}, repositories = [];
  const pointer = JSON.stringify({ repository: "https://github.com/example/fixture-credentials.git", path: "local/.credentials-fixture", command: "bin/credentials" });
  for (const project of ["app", "library"]) {
    const upstream = join(root, project);
    git(root, "init", "-q", upstream);
    git(upstream, "config", "user.email", "fixture@example.invalid");
    git(upstream, "config", "user.name", "Fixture");
    await writeFile(join(upstream, "source.txt"), "base\n");
    git(upstream, "add", "."); git(upstream, "commit", "-qm", "Base");
    const comparisonRevision = git(upstream, "rev-parse", "HEAD");
    await writeFile(join(upstream, "source.txt"), "published\n");
    if (project === "app") {
      await mkdir(join(upstream, ".morpheus"));
      await writeFile(join(upstream, ".morpheus", "credentials.json"), pointer);
    }
    git(upstream, "add", "."); git(upstream, "commit", "-qm", "Published");
    revisions[project] = git(upstream, "rev-parse", "HEAD");
    mirrors[project] = join(root, `${project}.git`);
    git(root, "init", "--bare", "-q", mirrors[project]);
    git(mirrors[project], "remote", "add", "origin", upstream);
    if (project === "app") git(mirrors[project], "fetch", "--depth=1", "origin", revisions[project]);
    repositories.push({ project, comparisonRef: "refs/remotes/origin/main", comparisonRevision,
      ...(project === "app" ? { credential: { reference: "build-tools", manifestSha256: digest(pointer) } } : {}) });
  }
  const operator = join(root, "operator"), cwd = join(root, "workspaces"), bin = join(root, "bin");
  await Promise.all([mkdir(operator), mkdir(cwd, { mode: 0o700 }), mkdir(bin)]);
  const companion = join(operator, "credentials");
  git(root, "init", "-q", companion);
  await mkdir(join(companion, "bin"));
  await writeFile(join(companion, "bin", "credentials"), '#!/bin/sh\n[ "$1" = run ] && [ "$2" = -- ] || exit 4\nshift 2\nexport SYNTHETIC_ACCESS=approved\nexec "$@"\n', { mode: 0o755 });
  git(companion, "add", "."); git(companion, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Wrapper");
  git(companion, "remote", "add", "origin", "https://github.com/example/fixture-credentials.git");
  const companionRevision = git(companion, "rev-parse", "HEAD");
  repositories[0].credential.revision = companionRevision;
  const policy = { id: "related", primary: "app", profile: "build", sandbox: "workspace-write", repositories };
  const intent = { id: policy.id, revisions };
  const host = { policy, mirrors, credentials: { "build-tools": { path: companion, repository: "https://github.com/example/fixture-credentials.git", revision: git(companion, "rev-parse", "HEAD") } } };
  const config = { version: 1, jobId: "workspace-fixture", cwd, gateway: { name: "fixture", provider: "codex", baseUrl: "https://gateway.invalid", keyRef: "env:FIXTURE_GATEWAY_KEY" },
    model: "gpt-6.1-sol", effort: "medium", sandbox: "workspace-write", approvalPolicy: "never", maxRunSeconds: 20, maxLogBytes: 65536, fleetWorkspace: host };
  const configPath = join(operator, "worker.json");
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  const preload = join(root, "operator-fixture.mjs");
  // The OS ownership/ACL observation is synthetic, as in the existing Full
  // Access fixture. All source, executor, wrapper and guardian paths are real.
  await writeFile(preload, `
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, relative } from 'node:path';
const config=${JSON.stringify(configPath)}, wrapper=${JSON.stringify(join(companion, "bin", "credentials"))};
const protectedPath = path => [config, wrapper].some(file => { const rel=relative(path,file); return rel==='' || (!rel.startsWith('..') && !rel.startsWith('/')); });
const { stat, access }=fs;
fs.stat=async(path,...args)=>{const info=await stat(path,...args);if(typeof path==='string'&&protectedPath(path)){info.uid=0;info.mode &= ~0o022; if(path===config)info.mode=(info.mode&~0o777)|0o640;}return info;};
fs.access=async(path,mode)=>{if(mode===2&&path===wrapper&&process.env.WRAPPER_WRITABLE==='1')return;if(mode===2&&typeof path==='string'&&protectedPath(path))throw Object.assign(new Error('fixture denied'),{code:'EACCES'});return access(path,mode);};
syncBuiltinESMExports();
`);
  const state = join(root, "state");
  const session = randomUUID();
  await writeFile(join(bin, "codex"), `#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
let prompt='';for await(const chunk of process.stdin)prompt+=chunk;
const cwd=process.cwd(), library=join(dirname(cwd),'library');
if(!existsSync(join(library,'source.txt')))process.exit(5);
for(const path of [cwd,library]){execFileSync('/usr/bin/git',['-C',path,'merge-base','HEAD','origin/main']);writeFileSync(join(path,'source.txt'),'worker edit');}
const cache=join(${JSON.stringify(root)},'owned-cache');mkdirSync(cache,{recursive:true});writeFileSync(join(cache,'build.txt'),'cache works');
execFileSync('morpheus',['credentials','run','--',process.execPath,'-e','if(process.env.SYNTHETIC_ACCESS!=="approved")process.exit(7)'],{cwd,stdio:'pipe'});
writeFileSync(join(cwd,'observed.json'),JSON.stringify({argv:process.argv.slice(2),prompt}));
console.log(JSON.stringify({type:'thread.started',thread_id:${JSON.stringify(session)}}));
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({outcome:'completed',summary:'synthetic source write cache wrapper passed',evidence:[],question:''})}}));
console.log(JSON.stringify({type:'turn.completed'}));
`, { mode: 0o700 });
  return { root, policy, intent, host, config, configPath, cwd, bin, preload, state, session, mirrors, revisions };
}

function memoryDb() {
  const docs = new Map();
  const doc = path => ({ path, get: async () => ({ data: () => structuredClone(docs.get(path)) }), set: async value => docs.set(path, value) });
  return { docs, doc, async runTransaction(fn) {
    return fn({ get: ref => ref.get(), set: (ref, value) => docs.set(ref.path, structuredClone(value)),
      update: (ref, value) => docs.set(ref.path, { ...docs.get(ref.path), ...structuredClone(value) }), delete: ref => docs.delete(ref.path) });
  } };
}

async function service(t, f) {
  const db = memoryDb();
  const project = { revision: "git", workspace: "related", workspaceKey: "related-lock", eligibleSlots: ["slot"],
    selection: { provider: "codex", gateway: "fixture", model: f.config.model } };
  const config = { projects: { app: project, library: project }, workspaces: { related: f.policy },
    users: { controller: { role: "controller", projects: ["app", "library"] }, worker: { role: "worker", hostId: "host", slotId: "slot" } } };
  db.docs.set("factorySlots/slot", { hostId: "host", capacity: 1, available: true, observedAt: 100 });
  const server = createServer(createFleetApi({ db, config, objects: {}, verifyToken: async uid => ({ uid }), clock: () => 100, log: () => {} }));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  async function call(op, input, role = "controller") {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1`, { method: "POST", headers: { Authorization: `Bearer ${role}` }, body: JSON.stringify({ op, rootId: "root", ...input }) });
    return { status: response.status, value: await response.json() };
  }
  return { db, call, config };
}

async function exchange(f, job, protectedConfig = true, environment = {}) {
  const child = spawn(process.execPath, [...(protectedConfig ? ["--import", f.preload] : []), executorScript, f.configPath, "app"], {
    env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}`, FACTORY_HOME: f.state, FIXTURE_GATEWAY_KEY: "synthetic-key", ...environment }, stdio: ["pipe", "pipe", "inherit"],
  });
  child.stdin.write(JSON.stringify(job) + "\n");
  let stdout = ""; child.stdout.on("data", chunk => { stdout += chunk; });
  assert.equal((await once(child, "close"))[0], 0);
  return JSON.parse(stdout).outcome;
}

function invocation(f, source, attemptId, extra = {}) {
  return { task: { source, selection: { provider: "codex", gateway: "fixture", model: f.config.model } },
    binding: { taskId: randomUUID(), attemptId, workspace: source.workspace }, checkout: { attemptId },
    gatewayBaseUrl: f.config.gateway.baseUrl, admissionId: randomUUID(), prompt: "Synthetic qualification", ...extra };
}

test("workspace authorization rejects extra repositories, moving refs, credentials and model overrides before placement", async t => {
  const f = await fixture(t), api = await service(t, f);
  const input = { project: "app", revision: f.revisions.app, workspace: f.intent, text: "fixture", messageId: "stable" };
  const submitted = await api.call("submit", input);
  assert.equal(submitted.status, 200);
  const binding = bindWorkspace(f.policy, f.intent);
  assert.deepEqual(submitted.value.task.source.workspace, binding);
  assert.equal((await api.call("submit", input)).value.task.id, submitted.value.task.id);
  for (const workspace of [ { ...f.intent, id: "other" }, { ...f.intent, revisions: { app: f.revisions.app } },
    { ...f.intent, revisions: { ...f.revisions, extra: f.revisions.app } }, { ...f.intent, revisions: { ...f.revisions, app: "main" } },
    { ...f.intent, credentials: ["other"] }, { ...f.intent, profile: "unapproved" } ]) {
    assert.notEqual((await api.call("submit", { ...input, messageId: randomUUID(), workspace })).status, 200);
  }
  assert.equal((await api.call("submit", { ...input, model: "other" })).status, 403);
  api.config.users.controller.projects = ["app"];
  assert.equal((await api.call("submit", input)).status, 403);
  api.config.users.controller.projects.push("library");
  const changed = { ...f.intent, revisions: { ...f.revisions, library: "0".repeat(40) } };
  assert.equal((await api.call("submit", { ...input, workspace: changed })).status, 500, "same message cannot change its pinned intent");
  assert.throws(() => verifyWorkspace(f.policy, { ...binding, profile: "other" }), /differs/);
  assert.throws(() => bindWorkspace({ ...f.policy, repositories: [{ ...f.policy.repositories[0], project: "../escape" }] }, f.intent));
  assert.throws(() => bindWorkspace({ ...f.policy, repositories: [{ ...f.policy.repositories[0], comparisonRef: "refs/heads/other" }] }, f.intent));
});

test("real service, supervisor, executor, guardian and wrapper return an exact workspace receipt", async t => {
  const f = await fixture(t), api = await service(t, f);
  const submitted = (await api.call("submit", { project: "app", revision: f.revisions.app, workspace: f.intent, text: "fixture", messageId: "one" })).value;
  const attemptId = randomUUID();
  const claimed = await api.call("claim", { taskId: submitted.task.id, attemptId }, "worker");
  assert.equal(claimed.status, 200);
  const task = claimed.value.task;
  const originalSpawn = childProcess.spawn;
  t.mock.method(childProcess, "spawn", (command, args, options) => {
    if (command === process.execPath) return originalSpawn(command, args, options);
    assert.equal(command, "/usr/bin/sudo");
    assert.deepEqual(args.slice(0, 5), ["-n", "-H", "-u", "fixture", "--"]);
    return originalSpawn(args[5], ["--import", f.preload, ...args.slice(6)], { ...options,
      env: { ...options.env, PATH: `${f.bin}:${process.env.PATH}`, FACTORY_HOME: f.state, FIXTURE_GATEWAY_KEY: "synthetic-key" } });
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const executor = createStudioExecutor({ account: "fixture", node: process.execPath, script: executorScript, workerConfig: f.configPath,
    project: "app", fleetWorkspace: f.host, gatewayBaseUrl: f.config.gateway.baseUrl }, null, async () => {});
  assert.equal(await executor.prepare(task, new AbortController().signal), true);
  const mutableWrapper = await exchange(f, invocation(f, task.source, attemptId), true, { WRAPPER_WRITABLE: "1" });
  assert.equal(mutableWrapper.diagnosticCode, "checkout_failed");
  assert.equal(mutableWrapper.invocation.launch, "never-launched");
  const store = f.host.credentials["build-tools"].path;
  await writeFile(join(store, "bin", "credentials"), "#!/bin/sh\nexit 77\n");
  const dirtyStore = await exchange(f, invocation(f, task.source, attemptId));
  assert.equal(dirtyStore.diagnosticCode, "checkout_failed");
  assert.equal(dirtyStore.invocation.launch, "never-launched");
  git(store, "restore", "bin/credentials");
  const admissionId = randomUUID();
  const output = await executor.execute({ task, admissionId, prompt: "Qualify synthetic source, build cache and wrapper", signal: new AbortController().signal });
  assert.equal(output.terminationVerified, true);
  assert.equal(output.result.outcome, "completed");
  assert.equal(output.invocation.sessionId, f.session);
  const primary = join(f.cwd, attemptId, "app"), library = join(f.cwd, attemptId, "library");
  for (const path of [primary, library]) {
    assert.equal(await readFile(join(path, "source.txt"), "utf8"), "worker edit");
    git(path, "fetch", "origin", "main");
    assert.equal(git(path, "symbolic-ref", "refs/remotes/origin/HEAD"), "refs/remotes/origin/main");
    assert.equal(git(path, "rev-parse", "--is-shallow-repository"), "false");
    assert.equal(git(path, "merge-base", "HEAD", "origin/main"), f.policy.repositories.find(r => r.project === path.split('/').at(-1)).comparisonRevision);
    assert.equal(await readFile(join(f.root, path.split('/').at(-1), "source.txt"), "utf8"), "published\n");
  }
  assert.equal(await readFile(join(f.root, "owned-cache", "build.txt"), "utf8"), "cache works");
  const observed = JSON.parse(await readFile(join(primary, "observed.json")));
  assert.ok(observed.argv.includes(`sandbox_workspace_write.writable_roots=${JSON.stringify([primary, library])}`));
  assert.match(observed.prompt, /Authorized workspace checkouts/);
  const record = JSON.parse(await readFile(join(f.state, "unattended", admissionId, "admission.json")));
  assert.deepEqual(record.binding.fleet.workspace, task.source.workspace);
  const unverified = await api.call("finish", { taskId: task.id, attemptId, outcome: "TASK_STATE_COMPLETED", result: null, cleanupVerified: false }, "worker");
  assert.deepEqual(unverified.value, { settled: false });
  assert.equal(api.db.docs.get("factoryWorkspaces/related-lock").attemptId, attemptId);
  const finished = await api.call("finish", { taskId: task.id, attemptId, outcome: "TASK_STATE_COMPLETED", result: { summary: "qualified" },
    cleanupVerified: true, admissionId, invocation: output.invocation }, "worker");
  assert.deepEqual(finished.value, { settled: true });
  const snapshot = (await api.call("get", { taskId: task.id })).value;
  assert.deepEqual(snapshot.receipt.source, task.source);
  assert.deepEqual(projectRun(snapshot, task.id).receipt, snapshot.receipt);
  assert.equal(api.db.docs.has("factoryWorkspaces/related-lock"), false);
  const recovered = await executor.recover(admissionId, task);
  assert.equal(recovered.terminationVerified, true);
  const wrong = structuredClone(task); wrong.source.workspace.profile = "other";
  assert.equal(await executor.recover(admissionId, wrong), false);
  const continued = await executor.execute({ task, admissionId: randomUUID(), resume: admissionId, prompt: "Resume exact workspace", signal: new AbortController().signal });
  assert.equal(continued.result.outcome, "completed");
  assert.equal(continued.invocation.sessionId, f.session);
  const denied = await executor.execute({ task: wrong, admissionId: randomUUID(), prompt: "No profile widening", signal: new AbortController().signal });
  assert.equal(denied.diagnosticCode, "workspace_policy_mismatch");
  assert.equal(denied.invocation.launch, "never-launched");
  const manifest = join(primary, ".morpheus", "credentials.json");
  const originalPointer = JSON.parse(await readFile(manifest, "utf8"));
  await writeFile(manifest, JSON.stringify({ ...originalPointer, unapproved: "changed bytes" }));
  const altered = await executor.execute({ task, admissionId: randomUUID(), resume: admissionId, prompt: "No changed manifest", signal: new AbortController().signal });
  assert.equal(altered.diagnosticCode, "checkout_failed");
  assert.equal(altered.invocation.launch, "never-launched");
  git(primary, "restore", ".morpheus/credentials.json");
  git(library, "update-ref", "refs/remotes/origin/main", f.revisions.library);
  const refChanged = await executor.execute({ task, admissionId: randomUUID(), resume: admissionId, prompt: "No changed base", signal: new AbortController().signal });
  assert.equal(refChanged.diagnosticCode, "checkout_failed");
  assert.equal(refChanged.invocation.launch, "never-launched");
});

test("executor refuses mutable policy, changed credential manifest, checkout traversal and altered comparison pins", async t => {
  const f = await fixture(t);
  const workspace = bindWorkspace(f.policy, f.intent), source = { project: "app", checkout: "git", revision: f.revisions.app, workspace };
  const job = invocation(f, source, randomUUID());
  await assert.rejects(readWorkerConfig(f.configPath), /protected operator configuration/);
  assert.deepEqual(await exchange(f, { op: "prepare", source, checkout: job.checkout }, false), {
    terminationVerified: false, result: { outcome: "failed", summary: "Studio executor could not prove completion." },
  });
  await assert.rejects(checkoutWorkspace(f.cwd, f.host, workspace, "../escape", "workspace-write"), /Invalid workspace attempt/);
  // A profile cannot widen sandbox permission, even with an otherwise matching policy.
  await assert.rejects(checkoutWorkspace(f.cwd, f.host, workspace, randomUUID(), "danger-full-access"), /profile/);
  const changed = structuredClone(workspace); changed.repositories[0].credential.reference = "foreign";
  const extraStore = { ...f.host, credentials: { ...f.host.credentials, foreign: f.host.credentials["build-tools"] } };
  await assert.rejects(checkoutWorkspace(f.cwd, extraStore, workspace, randomUUID(), "workspace-write"), /references/);
  const changedStore = structuredClone(f.host); changedStore.credentials["build-tools"].revision = "0".repeat(40);
  await assert.rejects(checkoutWorkspace(f.cwd, changedStore, workspace, randomUUID(), "workspace-write"), /references/);
  await assert.rejects(checkoutWorkspace(f.cwd, f.host, changed, randomUUID(), "workspace-write"), /differs/);
  const outside = join(f.root, "outside"); await mkdir(outside);
  const attemptId = randomUUID(); await symlink(outside, join(f.cwd, attemptId));
  await assert.rejects(checkoutWorkspace(f.cwd, f.host, workspace, attemptId, "workspace-write", true), /redirected/);
  assert.equal((await exchange(f, job)).diagnosticCode, "checkout_failed");
});


test("interactive and explicit controller authorization retain every claimed checkout", async t => {
  const f = await fixture(t);
  const paths = {};
  for (const project of ["app", "library"]) {
    paths[project] = join(f.root, `claim-${project}`);
    git(join(f.root, project), "worktree", "add", "--detach", paths[project], f.revisions[project]);
  }
  const saved = process.env.FACTORY_HOME;
  process.env.FACTORY_HOME = f.root;
  t.after(() => { if (saved === undefined) delete process.env.FACTORY_HOME; else process.env.FACTORY_HOME = saved; });
  const config = { projects: { app: join(f.root, "app"), library: join(f.root, "library") },
    workspaces: { related: { primary: "app", projects: ["app", "library"] } } };
  await writeFile(join(f.root, "fleet-controller.json"), JSON.stringify(config), { mode: 0o600 });
  const calls = [];
  const authorize = async (method, input) => { assert.equal(method, "factory.remoteAuthorize"); calls.push(input); };
  const args = { rootId: "root", placement: "fleet", cwd: paths.app, repos: [paths.library] };
  const inspection = await dispatchFleet("inspect", args, { authorize });
  assert.deepEqual(inspection.target.workspace, f.intent);
  assert.deepEqual(calls, ["app", "library"].map(project => ({ rootId: "root", projectPath: config.projects[project], checkoutPath: paths[project] })));
  calls.length = 0;
  await authorizeFleetProjects(config, "root", "app", f.intent, { checkoutPaths: paths }, authorize);
  assert.equal(calls.length, 2);
  await assert.rejects(dispatchFleet("inspect", { ...args, repos: [paths.library, paths.library] }, { authorize }), /workspace matches/);
  await assert.rejects(dispatchFleet("inspect", { ...args, repos: [] }, { authorize }), /workspace matches/);
  await writeFile(join(paths.library, "source.txt"), "dirty");
  await assert.rejects(dispatchFleet("inspect", args, { authorize }), /clean linked checkout/);
});

test("current unattended reporting maps every workspace checkout without granting cleanup", async t => {
  const f = await fixture(t), admissionId = randomUUID();
  const root = join(f.root, "report"), directory = join(root, "unattended", admissionId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const app = join(f.cwd, "app"), library = join(f.cwd, "library");
  const stamp = "Tue Nov 10 12:00:00 2026 123 501";
  const admission = { admissionId, state: "admitted", binding: { cwd: app, writableRoots: [app, library], jobId: "fixture", gateway: { name: "fixture", provider: "codex" } } };
  const process = { state: "running", runId: admissionId, guardianPid: 123, guardianIdentity: stamp };
  await writeFile(join(directory, "admission.json"), JSON.stringify(admission), { mode: 0o600 });
  await writeFile(join(directory, "process.json"), JSON.stringify(process), { mode: 0o600 });
  const report = await observeFactory({ roots: [root], channel: "unattended", hostId: "fixture", projects: { [app]: "example/app", [library]: "example/library" },
    census: async () => ({ markedRunIds: [admissionId], identities: { 123: stamp }, owned: {} }) });
  assert.equal(report.complete, true);
  assert.deepEqual(report.instances[0].projectIds, ["example/app", "example/library"]);
  assert.equal(report.instances[0].state, "running");
  assert.deepEqual(JSON.parse(await readFile(join(directory, "process.json"))), process);
});


test("supervisor preparation reports distinct sanitized stages at the execution boundary", async t => {
  const f = await fixture(t);
  const task = { id: randomUUID(), attempt: { id: randomUUID() }, source: { project: "app", checkout: "git", revision: f.revisions.app, workspace: bindWorkspace(f.policy, f.intent) } };
  const executor = createStudioExecutor({ account: "fixture", node: process.execPath, script: executorScript, workerConfig: f.configPath, project: "app", fleetWorkspace: f.host }, null, null);
  const unavailable = structuredClone(task);
  unavailable.source.workspace = bindWorkspace(f.policy, { ...f.intent, revisions: { ...f.revisions, library: "0".repeat(40) } });
  assert.deepEqual(await executor.prepare(unavailable, new AbortController().signal), { prepared: false, diagnosticCode: "source_fetch_failed" });
  let code = 0;
  t.mock.method(childProcess, "spawn", () => {
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough() });
    child.stdin.once("data", () => {
      child.stdout.end(JSON.stringify({ outcome: { prepared: false } }) + "\n");
      setImmediate(() => child.emit("close", code));
    });
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  assert.deepEqual(await executor.prepare(task, new AbortController().signal), { prepared: false, diagnosticCode: "checkout_failed" });
  code = 127;
  assert.deepEqual(await executor.prepare(task, new AbortController().signal), { prepared: false, diagnosticCode: "executor_invocation_failed" });
});

for (const diagnosticCode of ["source_fetch_failed", "checkout_failed", "executor_invocation_failed"]) {
  test(`the service and interactive consumer retain ${diagnosticCode} in the exact source receipt`, async t => {
    const f = await fixture(t), api = await service(t, f);
    const submitted = (await api.call("submit", { project: "app", revision: f.revisions.app, workspace: f.intent, text: "fixture", messageId: "stage" })).value;
    const taskId = submitted.task.id, attemptId = randomUUID();
    await api.call("claim", { taskId, attemptId }, "worker");
    assert.deepEqual((await api.call("finish", { taskId, attemptId, outcome: "TASK_STATE_FAILED", result: { summary: "Failed before launch", diagnosticCode },
      cleanupVerified: true, invocation: { launch: "never-launched", admissionId: null, sessionId: null } }, "worker")).value, { settled: true });
    const snapshot = (await api.call("get", { taskId })).value;
    assert.equal(snapshot.receipt.diagnosticCode, diagnosticCode);
    assert.deepEqual(snapshot.receipt.source, submitted.task.source);
    assert.equal(projectRun(snapshot, taskId).result.diagnosticCode, diagnosticCode);
  });
}
