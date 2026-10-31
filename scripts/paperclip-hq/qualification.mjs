import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { callableClient } from './lib/client.js';
import { createConnector } from './lib/connector.js';
import { poolFixture, until } from '../../plugins/factory/tests/pool-fixtures.mjs';
import { hqProfileDigest } from '../../plugins/factory/src/pool-hq.mjs';
import { loadPool } from '../../plugins/factory/src/pool-config.mjs';
import { projectIdentity } from '../../plugins/factory/src/store.mjs';

const projectId = 'demo-morpheus-hq';
if (process.env.GCLOUD_PROJECT !== projectId || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:19200' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:19199') throw new Error('Dedicated demo emulators required');
initializeApp({ projectId });
const auth = getAuth(), db = getFirestore();
const companyId = '11111111-1111-4111-8111-111111111111';
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

test('Firebase transport reaches the actual Manager HQ facade, question path and saved receipt exactly once', async t => {
  const fx = await poolFixture(t, { provider: 'claude', transport: 'ssh' });
  fx.pool.controller.companyId = companyId;
  await fx.writePool(fx.pool);
  const pool = fx.coordinator();
  pool.manager.snapshot = async () => { throw new Error('HQ must not construct desktop authorization'); };
  const parsed = await loadPool();
  await writeFile(join(fx.coord, 'hq.json'), JSON.stringify({ version: 1, connectorId: 'mbp', companyId,
    controller: { baseUrl: fx.pool.controller.baseUrl, companyId, projectId: null },
    profiles: { [fx.name]: { repository: fx.coordinatorCwd, project: (await projectIdentity(fx.coordinatorCwd)).project, profileSha256: hqProfileDigest(parsed.profiles[fx.name]) } },
  }), { mode: 0o600 });
  const admin = await account('qualification-admin', 'admin'), backend = await account('connector');
  const directory = join(fx.root, 'connector');
  await mkdir(directory, { mode: 0o700 });
  const bridge = (method, args) => pool.manager.dispatch(method, args);
  const options = { directory, companyId, controllerId: 'mbp-v1', connectorId: 'mbp', backend, bridge };
  const operationId = randomUUID();
  const input = { operationId, companyId, action: 'start', args: { profile: fx.name, prompt: 'ASK WRITE qualification.txt fixture-proof' } };
  await admin('enqueue', input);
  let loseReceipt = true;
  const disconnected = createConnector({ ...options, backend: async (method, data) => {
    if (method === 'complete' && loseReceipt) { loseReceipt = false; throw new Error('fixture disconnected after durable receipt'); }
    return backend(method, data);
  } });
  await assert.rejects(disconnected.tick(), /fixture disconnected/);
  const command = await backend('inspect', { operationId });
  assert.equal(command.state, 'applying');
  assert.equal(fx.paperclip.count('POST', /\/issues$/), 1);
  // A fresh connector instance reads the saved local receipt; it cannot repost start.
  const connector = createConnector(options);
  await connector.tick();
  const receipt = await admin('read', { operationId });
  assert.equal(receipt.state, 'completed');
  assert.equal(receipt.result.work.terminal, false);
  assert.equal(receipt.result.operation.state, 'receipted');
  const conversationId = receipt.result.work.conversationId;
  const issueId = [...fx.paperclip.issues.keys()][0];
  const run = fx.run(fx.paperclip.startRun(issueId));
  const waiting = await until(async () => {
    const value = await bridge('hq.status', { connectorId: 'mbp', companyId, actor: { uid: 'qualification-admin', role: 'admin', kind: 'user' }, conversationId });
    return value.work.question ? value : null;
  });
  assert.equal(waiting.work.question.id, 'q1');
  const answerId = randomUUID();
  await admin('enqueue', { operationId: answerId, companyId, action: 'answer', args: { conversationId, questionId: 'q1', answers: { 'Color?': 'blue' } } });
  await connector.tick();
  assert.equal(await run, 0);
  const final = await bridge('hq.status', { connectorId: 'mbp', companyId, actor: { uid: 'qualification-admin', role: 'admin', kind: 'user' }, conversationId });
  assert.deepEqual([final.work.terminal, final.work.state, final.work.termination, final.work.result.summary], [true, 'completed', 'verified', 'answered blue wrote qualification.txt']);
  assert.equal(await readFile(join(fx.profile.workspace, 'qualification.txt'), 'utf8'), 'fixture-proof\n');
  await admin('enqueue', input); await connector.tick();
  assert.equal(fx.paperclip.count('POST', /\/issues$/), 1);
  assert.equal((await fx.lines('claude-calls.jsonl')).length, 1);
  const ledger = await db.collection('paperclipTransport').doc(companyId).collection('commands').get();
  assert.equal(ledger.size, 2);
  assert.equal((await admin('read', { operationId: answerId })).state, 'completed');
});
