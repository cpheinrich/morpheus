import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { callableClient } from './lib/client.js';
import { createConnector } from './lib/connector.js';
import { projectionLimits } from './lib/projection.js';

const projectId = 'demo-morpheus-hq';
if (process.env.GCLOUD_PROJECT !== projectId || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:19200' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:19199') throw new Error('This test only runs on the dedicated demo emulators');
initializeApp({ projectId });
const auth = getAuth(), db = getFirestore();
const companyId = '11111111-1111-4111-8111-111111111111';
const callBase = `http://127.0.0.1:19201/${projectId}/us-central1`;
async function account(uid, role) {
  await auth.createUser({ uid, email: `${uid}@example.test`, password: 'emulator-only-password' });
  if (role) await auth.setCustomUserClaims(uid, { role });
  const response = await fetch('http://127.0.0.1:19199/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${uid}@example.test`, password: 'emulator-only-password', returnSecureToken: true }),
  });
  assert.equal(response.status, 200); const value = await response.json();
  return { token: value.idToken, call: callableClient(callBase, async () => value.idToken) };
}

test('real Auth + Functions + Firestore transport and outbound connector', async () => {
  const admin = await account('chris', 'admin'), staff = await account('staff', 'employee'), connector = await account('connector');
  const legacy = await account('legacy');
  const snapshot = { version: 1, companyId, observedAt: Date.now(), controller: { state: 'online', observedAt: 0 }, limits: projectionLimits,
    truncated: { issues: false, agents: false, comments: false }, issues: [], agents: [] };
  snapshot.controller.observedAt = snapshot.observedAt;
  assert.equal(await admin.call('snapshot'), null);
  await assert.rejects(admin.call('publish', snapshot), /403/);
  await assert.rejects(legacy.call('snapshot'), /403/);
  await auth.updateUser('legacy', { emailVerified: true });
  const published = await connector.call('publish', snapshot);
  assert.equal(published.observedAt, snapshot.observedAt);
  assert.deepEqual(await legacy.call('snapshot'), { ...snapshot, publishedAt: published.publishedAt });
  assert.deepEqual(await staff.call('snapshot'), await legacy.call('snapshot'));
  await assert.rejects(connector.call('snapshot'), /403/);
  await assert.rejects(connector.call('publish', { ...snapshot, observedAt: snapshot.observedAt - 1, controller: { ...snapshot.controller, observedAt: snapshot.observedAt - 1 } }), /500/);
  await auth.updateUser('legacy', { disabled: true });
  await assert.rejects(legacy.call('snapshot'), /403/);
  const directProjection = await fetch(`http://127.0.0.1:19200/v1/projects/${projectId}/databases/(default)/documents/paperclipTransport/${companyId}/projection/latest`, { headers: { authorization: `Bearer ${admin.token}` } });
  assert.equal(directProjection.status, 403, 'projection is callable-only even for HQ admins');
  const operationId = '22222222-2222-4222-8222-222222222222';
  const input = { operationId, companyId, action: 'start', args: { profile: 'codex-mini', prompt: 'Emulator task' } };
  const command = await admin.call('enqueue', input);
  assert.equal(command.actor.uid, 'chris'); assert.equal(command.actor.kind, 'user');
  assert.deepEqual(await admin.call('enqueue', input), command);
  await assert.rejects(staff.call('enqueue', { ...input, operationId: '33333333-3333-4333-8333-333333333333' }), /403/);
  await assert.rejects(admin.call('enqueue', { ...input, companyId: '33333333-3333-4333-8333-333333333333' }), /403/);
  await assert.rejects(admin.call('pending'), /403/);
  const direct = await fetch(`http://127.0.0.1:19200/v1/projects/${projectId}/databases/(default)/documents/paperclipTransport/${companyId}/commands/direct-write`, {
    method: 'PATCH', headers: { authorization: `Bearer ${admin.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ fields: { state: { stringValue: 'pending' } } }),
  });
  assert.equal(direct.status, 403, 'even HQ admins cannot forge transport ledger records');
  const dir = await mkdtemp(join(tmpdir(), 'hq-emulator-')); let launches = 0;
  try {
    const worker = createConnector({ directory: dir, companyId, controllerId: 'mbp-v1', connectorId: 'mbp', backend: connector.call,
      bridge: async (method, args) => {
        launches++; assert.equal(method, 'hq.start'); assert.equal(args.actor.uid, 'chris');
        const stored = await db.collection('paperclipTransport').doc(companyId).collection('commands').doc(operationId).get();
        assert.equal(stored.data().state, 'applying');
        return { operation: { operationId, state: 'receipted', conversationId: '44444444-4444-4444-8444-444444444444' }, work: { terminal: false } };
      } });
    await worker.tick(); await worker.tick(); assert.equal(launches, 1);
    const read = await staff.call('read', { operationId });
    assert.equal(read.state, 'completed'); assert.equal(read.result.work.terminal, false);
    assert.equal((await db.collection('paperclipTransport').doc(companyId).collection('commands').get()).size, 1);
    // Existing ID token still contains admin, but apply re-reads authoritative current role.
    const revokedId = '55555555-5555-4555-8555-555555555555';
    await admin.call('enqueue', { ...input, operationId: revokedId });
    const claim = await connector.call('claim', { operationId: revokedId });
    await auth.setCustomUserClaims('chris', { role: 'employee' });
    await assert.rejects(connector.call('beginApply', { operationId: revokedId, fence: claim.fence }), /403/);
    assert.equal((await staff.call('read', { operationId: revokedId })).state, 'rejected');
  } finally { await rm(dir, { recursive: true, force: true }); }
  console.log('Verified demo-only projection authorization, live legacy identity, monotonic publication, direct read denial, authenticated enqueue, duplicate refusal, one fake bridge invocation, receipt, and revoked actor. No native provider launched.');
});
