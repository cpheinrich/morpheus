import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend, type User } from '../scripts/paperclip-hq/backend.js';
import { projectionLimits, paperclipProjection, boundedResponse, type PublishedProjection } from '../scripts/paperclip-hq/projection.js';
import { firebaseToken, daemonOwnership, runDaemon, boundedBridgeCall } from '../scripts/paperclip-hq/runtime.js';
import type { CommandStore } from '../scripts/paperclip-hq/store.js';
import { createFunctions } from '../scripts/paperclip-hq/functions.js';

const companyId = '11111111-1111-4111-8111-111111111111', issueId = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const stamp = 1_000_000;
const input = () => ({ version: 1 as const, companyId, observedAt: stamp, controller: { state: 'online' as const, observedAt: stamp }, limits: projectionLimits,
  truncated: { issues: false, agents: false, comments: false }, issues: [], agents: [] });
const store: CommandStore = { async get() { return null; }, async candidates() { return []; }, async transaction(_id, update) { return update(null).value; } };
function backendFixture() {
  let current: PublishedProjection | null = null;
  const users = new Map<string, User>([['chris', { uid: 'chris', email: 'chris@example.test', emailVerified: true }], ['staff', { uid: 'staff', customClaims: { role: 'employee' } }], ['connector', { uid: 'connector' }]]);
  const backend = createBackend({ settings: { companyId, controllerId: 'mbp', connectorUid: 'connector', profiles: ['codex-mini'], humans: [{ uid: 'chris', email: 'chris@example.test' }] }, store,
    user: async uid => { const value = users.get(uid); if (!value) throw new Error(); return value; }, now: () => stamp,
    projection: { async get() { return current; }, async publish(value) { current = structuredClone(value); } },
  });
  return { users, backend };
}
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(path => rm(path, { force: true, recursive: true }))); });
async function directory() { const path = await mkdtemp(join(tmpdir(), 'hq-live-')); dirs.push(path); return path; }

describe('authenticated HQ projection', () => {
  it('caps each callable deployment at one instance with zero warm instances', () => {
    const options: unknown[] = [];
    const ref: any = { doc: () => ref, collection: () => ref };
    createFunctions({ onCall: (value: unknown, handler: unknown) => { options.push(value); return handler; }, HttpsError: Error,
      db: ref, auth: { async getUser() { throw new Error('not invoked during definition'); } },
      settings: { companyId, controllerId: 'mbp', connectorUid: 'connector', profiles: ['codex-mini'] },
    });
    expect(options).toHaveLength(9);
    expect(options).toEqual(Array(9).fill({ cors: false, maxInstances: 1, minInstances: 0 }));
  });
  it('publishes only as the live connector and reads only as current humans without target overrides', async () => {
    const { backend, users } = backendFixture();
    expect(await backend.snapshot({ uid: 'chris' }, {})).toBeNull();
    await expect(backend.publish({ uid: 'chris' }, input())).rejects.toMatchObject({ code: 'permission-denied' });
    await backend.publish({ uid: 'connector' }, input());
    expect(await backend.snapshot({ uid: 'staff' }, {})).toEqual({ ...input(), publishedAt: stamp });
    for (const auth of [undefined, { uid: 'connector' }, { uid: 'missing' }]) await expect(backend.snapshot(auth, {})).rejects.toThrow();
    await expect(backend.snapshot({ uid: 'chris' }, { companyId: other })).rejects.toMatchObject({ code: 'invalid-argument' });
    users.get('staff')!.customClaims = {};
    await expect(backend.snapshot({ uid: 'staff' }, {})).rejects.toMatchObject({ code: 'permission-denied' });
    users.get('connector')!.disabled = true;
    await expect(backend.publish({ uid: 'connector' }, input())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('requires exact legacy UID and live enabled verified matching email on reads and delayed writes', async () => {
    const { backend, users } = backendFixture();
    const request = { operationId: issueId, companyId, action: 'start', args: { profile: 'codex-mini', prompt: 'one task' } };
    expect((await backend.enqueue({ uid: 'chris' }, request)).actor).toEqual({ uid: 'chris', kind: 'user', role: 'admin' });
    for (const change of [{ emailVerified: false }, { email: 'changed@example.test' }, { disabled: true }, { uid: 'other' }]) {
      users.set('chris', { uid: 'chris', email: 'chris@example.test', emailVerified: true, ...change });
      await expect(backend.snapshot({ uid: 'chris' }, {})).rejects.toMatchObject({ code: 'permission-denied' });
      await expect(backend.enqueue({ uid: 'chris' }, request)).rejects.toMatchObject({ code: 'permission-denied' });
    }
  });
  it('bounds bytes, shape, company, row count and clock skew at their boundaries', async () => {
    const { backend } = backendFixture(), connector = { uid: 'connector' };
    for (const invalid of [{ ...input(), companyId: other }, { ...input(), nativeSessionId: 'secret' }, { ...input(), observedAt: stamp - 300001 },
      { ...input(), observedAt: stamp + 30001 }, { ...input(), controller: { state: 'online', observedAt: stamp - 1 } }, { ...input(), agents: Array(51).fill({ id: other, name: 'a', role: 'a', status: 'a' }) },
      { ...input(), private: 'x'.repeat(750 * 1024) }]) await expect(backend.publish(connector, invalid)).rejects.toThrow();
    for (const observedAt of [stamp - 300000, stamp + 30000]) expect(await backend.publish(connector, { ...input(), observedAt, controller: { state: 'online', observedAt } })).toEqual({ observedAt, publishedAt: stamp });
  });
});

describe('bounded Paperclip observations', () => {
  it('projects actual source rows, excludes private fields and redacts common credentials', async () => {
    const paths: string[] = [];
    const observe = paperclipProjection({ baseUrl: 'http://127.0.0.1:3100', companyId, now: () => stamp, token: async () => 'private-board', fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname; paths.push(path);
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer private-board');
      if (path.endsWith('/issues')) return Response.json([{ id: issueId, companyId, identifier: 'HQ-1', title: '<script>untrusted</script>', description: 'Bearer secret-token', status: 'todo', priority: 'high', assigneeAgentId: other, updatedAt: '2026-10-25', nativeSessionId: 'private-native', apiKey: 'private-api' }]);
      if (path.endsWith('/agents')) return Response.json([{ id: other, companyId, name: 'worker', role: 'engineer', status: 'idle', adapterConfig: { env: 'private-env' } }]);
      return Response.json([{ id: other, issueId, companyId, body: 'password=private-password', createdAt: '2026-10-25', authorUserId: 'private-user' }]);
    } });
    const value = await observe();
    expect(paths).toEqual([`/api/companies/${companyId}/issues`, `/api/companies/${companyId}/agents`, `/api/issues/${issueId}/comments`]);
    expect(value.issues[0]).toEqual({ id: issueId, identifier: 'HQ-1', title: '<script>untrusted</script>', description: '[redacted]', status: 'todo', priority: 'high', assigneeAgentId: other, updatedAt: '2026-10-25', comments: [{ id: other, body: 'password=[redacted]', createdAt: '2026-10-25' }] });
    expect(value.agents).toEqual([{ id: other, name: 'worker', role: 'engineer', status: 'idle' }]);
    expect(JSON.stringify(value)).not.toContain('private-');
    expect(value.truncated).toEqual({ issues: false, agents: false, comments: false });
  });
  it('caps observations and comment calls, marks partial data and rejects foreign company/comment associations', async () => {
    let comments = 0, foreign = false;
    const observe = paperclipProjection({ baseUrl: 'http://localhost:3100/', companyId, token: async () => 'token', fetchImpl: async url => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/issues')) return Response.json(Array(101).fill({ id: issueId, companyId }));
      if (path.endsWith('/agents')) return Response.json(Array(51).fill({ id: other, companyId }));
      comments++; return Response.json(Array(6).fill({ id: other, companyId, issueId: foreign ? other : issueId, body: 'comment' }));
    } });
    const value = await observe();
    expect([value.issues.length, value.agents.length, comments]).toEqual([100, 50, 10]);
    expect(value.issues.map(issue => issue.comments.length)).toEqual([...Array(10).fill(5), ...Array(90).fill(0)]);
    expect(value.truncated).toEqual({ issues: true, agents: true, comments: true });
    foreign = true; await expect(observe()).rejects.toThrow('Foreign comment');
    const foreignSource = paperclipProjection({ baseUrl: 'http://127.0.0.1:3100', companyId, token: async () => 'token', fetchImpl: async () => Response.json([{ id: issueId, companyId: other }]) });
    await expect(foreignSource()).rejects.toThrow('foreign');
    expect(() => paperclipProjection({ baseUrl: 'https://public.example', companyId, token: async () => '' })).toThrow('loopback');
    await expect(boundedResponse(new Response('12345'), 4)).rejects.toThrow('bound');
  });
});

describe('continuous connector runtime', () => {
  it('bounds an uncertain bridge wait without retrying its call', async () => {
    vi.useFakeTimers(); let calls = 0;
    try {
      const pending = boundedBridgeCall(async () => { calls++; return new Promise<never>(() => {}); }, 90000);
      const assertion = expect(pending).rejects.toThrow('outcome unknown');
      await vi.advanceTimersByTimeAsync(89999); expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1); await assertion; expect(calls).toBe(1);
    } finally { vi.useRealTimers(); }
  });
  it('refreshes the exact Firebase identity, atomically saves rotation and reuses only a fresh ID token', async () => {
    const dir = await directory(), file = join(dir, 'credential.json');
    await writeFile(file, JSON.stringify({ apiKey: 'public-api-key', refreshToken: 'refresh-one', uid: 'connector' }), { mode: 0o600 });
    let now = 1000, calls = 0;
    const token = firebaseToken(file, async (url, init) => {
      expect(String(url)).toBe('https://securetoken.googleapis.com/v1/token?key=public-api-key');
      expect(String(init?.body)).toBe(`grant_type=refresh_token&refresh_token=${calls++ ? 'refresh-two' : 'refresh-one'}`);
      return Response.json({ id_token: `id-${calls}`, refresh_token: 'refresh-two', user_id: 'connector', expires_in: '3600' });
    }, () => now);
    expect(await token()).toBe('id-1'); expect(await token()).toBe('id-1'); expect(calls).toBe(1);
    expect(JSON.parse(await readFile(file, 'utf8')).refreshToken).toBe('refresh-two');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    now += 3540000; expect(await token()).toBe('id-2'); expect(calls).toBe(2);
    const wrong = firebaseToken(file, async () => Response.json({ id_token: 'id', refresh_token: 'other', user_id: 'wrong', expires_in: '3600' }));
    await expect(wrong()).rejects.toThrow('identity');
    expect(JSON.parse(await readFile(file, 'utf8')).refreshToken).toBe('refresh-two');
  });
  it('holds one daemon owner until graceful release and backs off without replaying the pass concurrently', async () => {
    const dir = await directory(), release = await daemonOwnership(dir);
    await expect(daemonOwnership(dir)).rejects.toMatchObject({ code: 'EEXIST' });
    await release(); const second = await daemonOwnership(dir); await second();
    const shutdown = new AbortController(), delays: number[] = [], reports: string[] = []; let calls = 0;
    await runDaemon({ signal: shutdown.signal, pollMs: 5000, pass: async () => { calls++; if (calls < 3) throw new Error('private-error'); if (calls === 4) shutdown.abort(); },
      report: state => reports.push(state), wait: async ms => { delays.push(ms); } });
    expect(delays).toEqual([10000, 20000, 5000]);
    expect(reports).toEqual(['retrying', 'retrying', 'observed', 'observed']); expect(calls).toBe(4);
    await expect(runDaemon({ signal: shutdown.signal, pollMs: 0, pass: async () => {} })).rejects.toThrow('5000');
  });
});
