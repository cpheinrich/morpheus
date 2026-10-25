// Deliberately excluded from default tests: this script can spend native allowance.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, lstat, realpath } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { callableClient } from './lib/client.js';
import { createConnector } from './lib/connector.js';

const exec = promisify(execFile);
const projectId = 'demo-morpheus-hq';
if (process.env.GCLOUD_PROJECT !== projectId || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:19200' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:19199') throw new Error('Dedicated demo emulators required');
if (!process.env.MORPHEUS_HQ_NATIVE_TARGET) throw new Error('Use run-qualification.mjs with an explicit native target');
const target = JSON.parse(await readFile(process.env.MORPHEUS_HQ_NATIVE_TARGET, 'utf8'));
assert.equal(target.authorization, 'controlled-native-qualification');
assert.equal(target.version, 1);
assert.match(target.sourceSha, /^[a-f0-9]{40}$/);
assert.match(target.nonce, /^[a-z0-9-]{10,80}$/);
assert.ok(Number.isInteger(target.maxTurnMs) && target.maxTurnMs >= 30_000 && target.maxTurnMs <= 300_000);
assert.ok(target.profiles.length >= 1 && target.profiles.length <= 2);
const poolHome = await realpath(target.poolHome), runtime = await realpath(target.runtime);
const manifestBytes = await readFile(join(runtime, 'source-manifest.json'));
assert.equal(createHash('sha256').update(manifestBytes).digest('hex'), target.sourceManifestSha256);
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.sourceSha, target.sourceSha);
for (const [path, expected] of Object.entries(manifest.files)) {
  assert.match(path, /^(src|scripts)\/[a-zA-Z0-9._/-]+\.mjs$/);
  assert.ok(!path.split('/').includes('..'));
  assert.equal(createHash('sha256').update(await readFile(join(runtime, path))).digest('hex'), expected, `Staged runtime drift: ${path}`);
}
for (const path of ['src/service.mjs', 'src/pool-hq.mjs', 'src/pool-runner.mjs', 'scripts/pool-runner.mjs']) assert.ok(manifest.files[path]);
assert.equal(await realpath(target.repository), await realpath(process.cwd()));
const proof = resolve(target.proofDirectory);
assert.ok(proof.startsWith(join(await realpath(target.repository), 'local') + '/'));
await mkdir(proof, { recursive: true, mode: 0o700 });
const save = (name, value) => writeFile(join(proof, name + '.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const pool = JSON.parse(await readFile(join(poolHome, 'pool.json'), 'utf8'));
assert.equal(pool.controller.baseUrl, target.baseUrl);
assert.equal(pool.controller.companyId, target.companyId);
assert.equal(pool.controller.projectId ?? null, target.projectId);
assert.equal(target.projectId, null, 'This qualification does not enroll a Paperclip project');
assert.equal(await lstat(join(poolHome, 'bridge.sock')).then(() => true, e => e.code === 'ENOENT' ? false : Promise.reject(e)), false, 'Existing Manager service must be quiescent before native qualification');
for (const name of await readdir(join(poolHome, 'pool/accounts'))) {
  assert.match(name, /\.json$/);
  assert.deepEqual(JSON.parse(await readFile(join(poolHome, 'pool/accounts', name), 'utf8')), [], 'Existing account reservations must be settled');
}
const token = (await readFile(pool.controller.tokenFile, 'utf8')).trim();
const { paperclipClient } = await import(pathToFileURL(join(runtime, 'src/pool-paperclip.mjs')));
const api = paperclipClient({ baseUrl: target.baseUrl, token });
for (const selected of target.profiles) {
  const p = pool.profiles[selected.name];
  assert.ok(p); assert.equal(p.provider, selected.provider); assert.equal(p.agentId, selected.agentId);
  assert.ok(['codex', 'claude'].includes(p.provider));
  assert.equal(p.host.transport, 'ssh');
  const agent = await api.get(`/agents/${p.agentId}`);
  assert.equal(agent.companyId, target.companyId); assert.equal(agent.status, 'paused');
  assert.equal(agent.adapterType, 'process');
  assert.deepEqual(agent.adapterConfig.args, [join(runtime, 'scripts/pool-runner.mjs')]);
  assert.equal(agent.runtimeConfig.heartbeat.enabled, false);
  assert.equal(agent.runtimeConfig.heartbeat.wakeOnDemand, true);
  const issues = [];
  for (let offset = 0; ; offset += 100) {
    const page = await api.get(`/companies/${target.companyId}/issues?assigneeAgentId=${p.agentId}&limit=100&offset=${offset}`);
    assert.ok(Array.isArray(page), 'Scoped issue array required before resume');
    issues.push(...page);
    if (page.length < 100) break;
    assert.ok(offset < 900, 'Issue census bound reached; inspect before resume');
  }
  assert.deepEqual(issues.filter(issue => issue.assigneeAgentId === p.agentId && !['done', 'cancelled'].includes(issue.status)).map(issue => issue.id), [], 'Existing unfinished work prevents test-agent resume');
}
// This is the only existing Pool home and account ledger; the staged source is private.
process.env.CODEX_CLAUDE_HOME = poolHome;
process.env.CODEX_CLAUDE_POOL = join(poolHome, 'pool.json');
const { call } = await import(pathToFileURL(join(runtime, 'src/client.mjs')));
const actor = { uid: target.adminUid, role: 'admin', kind: 'user' };
const scope = { connectorId: target.connectorId, companyId: target.companyId, actor };
initializeApp({ projectId });
const auth = getAuth();
async function account(uid, role) {
  await auth.createUser({ uid, email: `${uid}@example.test`, password: 'emulator-only-password' });
  if (role) await auth.setCustomUserClaims(uid, { role });
  const response = await fetch('http://127.0.0.1:19199/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${uid}@example.test`, password: 'emulator-only-password', returnSecureToken: true }),
  });
  assert.equal(response.status, 200);
  const value = await response.json();
  return callableClient(`http://127.0.0.1:19201/${projectId}/us-central1`, async () => value.idToken);
}
const admin = await account(target.adminUid, 'admin'), backend = await account(target.connectorUid);
const connectorOptions = { directory: join(proof, 'connector'), companyId: target.companyId, controllerId: target.controllerId,
  connectorId: target.connectorId, backend, bridge: (method, args) => call(method, args) };
let connector = createConnector(connectorOptions);
const owned = [], resumed = [], operations = [];
const record = { version: 1, startedAt: new Date().toISOString(), sourceSha: target.sourceSha, companyId: target.companyId, profiles: [], cleanup: [] };
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
async function observe(conversationId, deadline) {
  while (Date.now() < deadline) {
    const value = await call('hq.wait', { ...scope, conversationId, seconds: 25 });
    if (value.work.question) throw new Error('Native question requires actual authority; no automatic human reply');
    if (value.work.terminal) return value;
  }
  throw new Error('Native qualification deadline reached; stop owned turn');
}
try {
  // Persist the complete exact operator intent before resume/enqueue can cause work.
  await save('intent', { ...target, recordedAt: new Date().toISOString() });
  const profiles = await call('hq.profiles', scope);
  assert.ok(profiles, 'Owner-installed HQ mapping must pass before resume');
  for (const selected of target.profiles) {
    const p = pool.profiles[selected.name], deadline = Date.now() + target.maxTurnMs;
    const artifact = `hq-${target.nonce}-${p.provider}.json`;
    assert.equal(basename(artifact), artifact);
    const expected = { nonce: target.nonce, provider: p.provider, phase: 1 };
    const operationId = randomUUID();
    const input = { operationId, companyId: target.companyId, action: 'start', args: { profile: selected.name,
      prompt: `Controlled HQ transport qualification. Use your file-writing tool to create only ${artifact} in the current workspace containing exactly ${JSON.stringify(expected)} followed by a newline. Return completed with that filename as evidence. No shell command, delegation, network, configuration change, retry, extra file or new permission request. Stop after this small task.` } };
    await save(`${p.provider}-start-intent`, input);
    operations.push(operationId);
    resumed.push(p.agentId);
    await api.post(`/agents/${p.agentId}/resume`);
    assert.notEqual((await api.get(`/agents/${p.agentId}`)).status, 'paused');
    await admin('enqueue', input);
    let drop = true;
    connector = createConnector({ ...connectorOptions, backend: async (method, data) => {
      if (method === 'complete' && drop) { drop = false; throw new Error('Controlled disconnect after saved receipt'); }
      return backend(method, data);
    } });
    await assert.rejects(connector.tick(), /Controlled disconnect/);
    const applying = await backend('inspect', { operationId });
    assert.equal(applying.state, 'applying');
    connector = createConnector(connectorOptions); await connector.tick();
    const receipt = await admin('read', { operationId });
    assert.equal(receipt.state, 'completed');
    assert.equal(receipt.result.operation.state, 'receipted');
    const conversationId = receipt.result.work.conversationId;
    owned.push(conversationId);
    await save(`${p.provider}-receipt`, receipt);
    const final = await observe(conversationId, deadline);
    await save(`${p.provider}-final`, final);
    assert.deepEqual([final.work.state, final.work.termination], ['completed', 'verified']);
    // Same cloud command and fresh connector observe the receipt without a new turn.
    await admin('enqueue', input); await createConnector(connectorOptions).tick();
    const reattached = await call('hq.reattach', { ...scope, conversationId });
    assert.equal(reattached.work.turn, 1);
    const bytes = Buffer.from((await exec(p.host.ssh || 'ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=yes', p.host.target, `cat ${quote(join(p.workspace, artifact))}`], { timeout: 20_000, maxBuffer: 65_536 })).stdout);
    assert.deepEqual(JSON.parse(bytes.toString()), expected);
    await writeFile(join(proof, artifact), bytes, { flag: 'wx', mode: 0o600 });
    record.profiles.push({ name: selected.name, provider: p.provider, agentId: p.agentId, operationId, conversationId, issueId: (await readFile(join(poolHome, 'pool/conversations', conversationId, 'conversation.json'), 'utf8').then(JSON.parse)).issueId,
      final: final.work, artifact, artifactSha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, savedReceiptRecovery: true });
    console.log(JSON.stringify({ provider: p.provider, state: final.work.state, termination: final.work.termination, artifactSha256: record.profiles.at(-1).artifactSha256 }));
  }
} catch (error) {
  record.error = error.message;
  process.exitCode = 1;
} finally {
  // Even a lost start response can have created a turn. Observe its exact operation
  // journal before cleanup; never replay an uncertain native intent.
  for (const operationId of operations) {
    try {
      const value = await call('hq.operation', { ...scope, operationId });
      const conversationId = value.work?.conversationId;
      if (conversationId && !owned.includes(conversationId)) owned.push(conversationId);
    } catch { record.cleanup.push({ operationId, error: 'Operation observation unavailable' }); process.exitCode = 1; }
  }
  for (const conversationId of owned) {
    try {
      let value = await call('hq.status', { ...scope, conversationId });
      if (!value.work.terminal) {
        await call('hq.stop', { ...scope, actor: { ...actor, kind: 'agent' }, operationId: randomUUID(), conversationId });
        value = await call('hq.wait', { ...scope, conversationId, seconds: 25 });
      }
      record.cleanup.push({ conversationId, terminal: value.work.terminal, termination: value.work.termination });
      if (!value.work.terminal || !['verified', 'not-started'].includes(value.work.termination)) process.exitCode = 1;
    } catch { record.cleanup.push({ conversationId, error: 'Owned turn cleanup unverified' }); process.exitCode = 1; }
  }
  for (const agentId of resumed) {
    try { await api.post(`/agents/${agentId}/pause`); const agent = await api.get(`/agents/${agentId}`); assert.equal(agent.status, 'paused'); record.cleanup.push({ agentId, status: agent.status }); }
    catch { record.cleanup.push({ agentId, error: 'Agent pause unverified' }); process.exitCode = 1; }
  }
  record.finishedAt = new Date().toISOString();
  await save('result', record);
  if (owned.length === record.cleanup.filter(row => row.conversationId && row.terminal).length) await call('shutdown', {}).catch(() => { process.exitCode = 1; });
}
