import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackend, type User, type Settings } from '../scripts/paperclip-hq/backend.js';
import { createConnector, journalName } from '../scripts/paperclip-hq/connector.js';
import { digest, type Command } from '../scripts/paperclip-hq/protocol.js';
import type { CommandStore } from '../scripts/paperclip-hq/store.js';

const companyId = '11111111-1111-4111-8111-111111111111', operationId = '22222222-2222-4222-8222-222222222222';
const settings: Settings = { companyId, controllerId: 'mbp-v1', connectorUid: 'connector', profiles: ['codex-mini'] };
const admin = { uid: 'chris' }, machine = { uid: 'connector' };
function fixture() {
  const data = new Map<string, Command>(); let stamp = 1000;
  const users = new Map<string, User>([['chris', { uid: 'chris', customClaims: { role: 'admin' } }], ['staff', { uid: 'staff', customClaims: { role: 'employee' } }], ['connector', { uid: 'connector' }]]);
  // Serialize transactions like Firestore (test concurrent calls rather than mock a race away).
  let tail: Promise<unknown> = Promise.resolve();
  const store: CommandStore = {
    async get(id) { return structuredClone(data.get(id) ?? null); },
    async transaction<T>(id: string, change: (current: Command | null) => { value: T; next?: Command }) {
      const result = tail.then(() => { const outcome = change(structuredClone(data.get(id) ?? null)); if (outcome.next) data.set(id, structuredClone(outcome.next)); return structuredClone(outcome.value); });
      tail = result.catch(() => {}); return result;
    },
    async candidates(limit) { return [...data.values()].filter(c => ['pending', 'claimed', 'applying'].includes(c.state)).sort((a,b) => a.createdAt-b.createdAt).slice(0,limit).map(c => structuredClone(c)); },
  };
  const backend = createBackend({ settings, store, user: async uid => { const value = users.get(uid); if (!value) throw new Error('no user'); return value; }, now: () => stamp, claimMs: 100, commandMs: 500 });
  const input = { operationId, companyId, action: 'start', args: { profile: 'codex-mini', prompt: 'Check one task' } };
  return { data, users, backend, store, input, advance: (ms: number) => stamp += ms };
}
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function directory() { const value = await mkdtemp(join(tmpdir(), 'hq-transport-')); dirs.push(value); return value; }

describe('HQ command transport', () => {
  it('refuses unknown configuration fields and zero claim durations', () => {
    const f = fixture();
    expect(() => createBackend({ settings: { ...settings, arbitrary: true } as any, store: f.store, user: async () => f.users.get('chris')! })).toThrow();
    expect(() => createBackend({ settings, store: f.store, user: async () => f.users.get('chris')!, claimMs: 0 })).toThrow('Positive');
  });

  it('enqueues once across key order and refuses reused ID with different payload or actor', async () => {
    const f = fixture(); const a = await f.backend.enqueue(admin, f.input);
    expect(await f.backend.enqueue(admin, { args: f.input.args, action: 'start', companyId, operationId })).toEqual(a);
    expect(f.data.size).toBe(1);
    await expect(f.backend.enqueue(admin, { ...f.input, args: { ...f.input.args, prompt: 'different' } })).rejects.toMatchObject({ code: 'already-exists' });
    f.users.set('other', { uid: 'other', customClaims: { role: 'admin' } });
    await expect(f.backend.enqueue({ uid: 'other' }, f.input)).rejects.toMatchObject({ code: 'already-exists' });
  });
  it('derives human actor and refuses wrong company, arbitrary source, profile, connector and employee writes', async () => {
    const f = fixture();
    for (const auth of [undefined, machine, { uid: 'staff' }, { uid: 'missing' }]) await expect(f.backend.enqueue(auth, f.input)).rejects.toThrow();
    await expect(f.backend.enqueue(admin, { ...f.input, actor: { uid: 'root' } })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(f.backend.enqueue(admin, { ...f.input, companyId: operationId })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(f.backend.enqueue(admin, { ...f.input, args: { ...f.input.args, profile: 'arbitrary' } })).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await f.backend.enqueue(admin, f.input)).actor).toEqual({ uid: 'chris', role: 'admin', kind: 'user' });
  });
  it('fences expired claimants exactly at expiry and never reclaims applying work', async () => {
    const f = fixture(); await f.backend.enqueue(admin, f.input);
    const first = await f.backend.claim(machine, { operationId });
    expect(await f.backend.claim(machine, { operationId })).toBeNull();
    f.advance(100);
    const second = await f.backend.claim(machine, { operationId });
    expect(second!.fence).not.toBe(first!.fence);
    await expect(f.backend.beginApply(machine, { operationId, fence: first!.fence! })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect((await f.backend.beginApply(machine, { operationId, fence: second!.fence! })).state).toBe('applying');
    f.advance(100);
    expect(await f.backend.pending(machine)).toEqual([]);
    expect(f.data.get(operationId)!.state).toBe('unknown');
    expect(await f.backend.claim(machine, { operationId })).toBeNull();
    await expect(f.backend.complete(machine, { operationId, fence: first!.fence!, result: {} })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect((await f.backend.complete(machine, { operationId, fence: second!.fence!, result: { operation: 'stop requested' } })).state).toBe('completed');
  });
  it('admits one concurrent claimant and refreshes revoked actor before applying', async () => {
    const f = fixture(); await f.backend.enqueue(admin, f.input);
    const claims = await Promise.all([f.backend.claim(machine, { operationId }), f.backend.claim(machine, { operationId })]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    f.users.get('chris')!.customClaims = { role: 'employee' };
    await expect(f.backend.beginApply(machine, { operationId, fence: claims.find(Boolean)!.fence! })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(f.data.get(operationId)!.state).toBe('rejected');
  });
  it('rejects expired queued commands, changed configuration, disabled connector and invalid IDs', async () => {
    const f = fixture(); await f.backend.enqueue(admin, f.input); f.advance(500);
    expect(await f.backend.claim(machine, { operationId })).toBeNull(); expect(f.data.get(operationId)!.state).toBe('rejected');
    const changed = createBackend({ settings: { ...settings, controllerId: 'other-mac' }, store: f.store, user: async () => f.users.get('connector')! });
    await expect(changed.inspect(machine, { operationId })).rejects.toMatchObject({ code: 'failed-precondition' });
    f.users.get('connector')!.disabled = true;
    await expect(f.backend.pending(machine)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(f.backend.read(admin, { operationId: '../../secret' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('returns a bounded receipt to employees without copying request prompts', async () => {
    const f = fixture(); await f.backend.enqueue(admin, f.input); const claim = await f.backend.claim(machine, { operationId });
    await f.backend.beginApply(machine, { operationId, fence: claim!.fence! });
    await expect(f.backend.complete(machine, { operationId, fence: claim!.fence!, result: 'x'.repeat(65536) })).rejects.toThrow('bound');
    const result = { operation: { state: 'receipted' }, work: { state: 'stopping', terminal: false } };
    await f.backend.complete(machine, { operationId, fence: claim!.fence!, result });
    expect(await f.backend.read({ uid: 'staff' }, { operationId })).toEqual({ operationId, state: 'completed', updatedAt: 1000, result });
    expect(JSON.stringify(await f.backend.read(admin, { operationId }))).not.toContain('Check one task');
    expect((await f.backend.complete(machine, { operationId, fence: claim!.fence!, result })).result).toEqual(result);
  });
});

describe('outbound connector', () => {
  it('finishes the admitted action and stops claiming further work after shutdown', async () => {
    const f = fixture(), dir = await directory(), shutdown = new AbortController();
    await f.backend.enqueue(admin, f.input);
    await f.backend.enqueue(admin, { ...f.input, operationId: '33333333-3333-4333-8333-333333333333' });
    let calls = 0;
    await createConnector({ directory: dir, companyId, controllerId: settings.controllerId, connectorId: 'mbp', backend: (method, args) => (f.backend[method] as any)(machine, args), bridge: async () => { calls++; shutdown.abort(); return { ok: true }; } }).tick(shutdown.signal);
    expect(calls).toBe(1);
    expect(f.data.get(operationId)!.state).toBe('completed');
    expect(f.data.get('33333333-3333-4333-8333-333333333333')!.state).toBe('pending');
  });
  it('delivers accepted uppercase and lowercase UUIDs once, including case-only aliases on a Mac', async () => {
    const f = fixture(), dir = await directory();
    const upper = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', lower = upper.toLowerCase();
    await f.backend.enqueue(admin, { ...f.input, operationId: upper });
    await f.backend.enqueue(admin, { ...f.input, operationId: lower });
    await f.backend.enqueue(admin, f.input);
    const seen: string[] = [];
    const connector = createConnector({ directory: dir, companyId, controllerId: settings.controllerId, connectorId: 'mbp', backend: (method, args) => (f.backend[method] as any)(machine, args), bridge: async (_method, args) => { seen.push(args.operationId as string); return { operationId: args.operationId }; } });
    await connector.tick(); await connector.tick();
    expect(seen).toEqual([upper, lower, operationId]);
    expect(journalName(upper).toLowerCase()).not.toBe(journalName(lower).toLowerCase());
    for (const value of seen) expect(JSON.parse(await readFile(join(dir, journalName(value)), 'utf8')).operationId).toBe(value);
  });
  it('republishes an uppercase UUID saved receipt after acknowledgement loss without another bridge call', async () => {
    const f = fixture(), dir = await directory(), upper = 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB';
    await f.backend.enqueue(admin, { ...f.input, operationId: upper }); let failAck = true, calls = 0;
    const make = () => createConnector({ directory: dir, companyId, controllerId: settings.controllerId, connectorId: 'mbp', backend: (method, args) => { if (method === 'complete' && failAck) return Promise.reject(new Error('ack lost')); return (f.backend[method] as any)(machine, args); }, bridge: async () => { calls++; return { received: true }; } });
    await expect(make().tick()).rejects.toThrow('ack lost'); failAck = false;
    await make().tick(); expect(calls).toBe(1); expect(f.data.get(upper)!.state).toBe('completed');
    expect(JSON.parse(await readFile(join(dir, journalName(upper)), 'utf8')).state).toBe('acked');
  });

  it('resumes a prepared journal only after fresh server fencing and authorization', async () => {
    const f = fixture(), dir = await directory(); await f.backend.enqueue(admin, f.input); const command = await f.backend.claim(machine, { operationId });
    await writeFile(join(dir, journalName(operationId)), JSON.stringify({ version: 1, operationId, requestHash: command!.requestHash, fence: command!.fence, state: 'prepared' }));
    f.advance(100); let calls = 0;
    await createConnector({ directory: dir, companyId, controllerId: settings.controllerId, connectorId: 'mbp', backend: (method, args) => (f.backend[method] as any)(machine, args), bridge: async () => { calls++; return { ok: true }; } }).tick();
    expect(calls).toBe(1); expect(f.data.get(operationId)!.fence).not.toBe(command!.fence);
    expect(f.data.get(operationId)!.state).toBe('completed');
  });
  it('does not replay after server applying acknowledgement was lost before local intent update', async () => {
    const f = fixture(), dir = await directory(); await f.backend.enqueue(admin, f.input); const command = await f.backend.claim(machine, { operationId });
    await f.backend.beginApply(machine, { operationId, fence: command!.fence! });
    await writeFile(join(dir, journalName(operationId)), JSON.stringify({ version: 1, operationId, requestHash: command!.requestHash, fence: command!.fence, state: 'prepared' }));
    let calls = 0;
    await createConnector({ directory: dir, companyId, controllerId: settings.controllerId, connectorId: 'mbp', backend: (method, args) => (f.backend[method] as any)(machine, args), bridge: async () => { calls++; return {}; } }).tick();
    expect(calls).toBe(0); expect(f.data.get(operationId)!.state).toBe('unknown');
  });
  it('refuses a journal symlink and an existing connector lock without launching', async () => {
    const f = fixture(), dir = await directory(), target = await directory();
    const make = (directory: string) => createConnector({ directory, companyId, controllerId: settings.controllerId, connectorId: 'mbp', backend: (method, args) => (f.backend[method] as any)(machine, args), bridge: async () => { throw new Error('must not launch'); } });
    await symlink(target, join(dir, 'linked'));
    await expect(make(join(dir, 'linked')).tick()).rejects.toThrow('symlink');
    await writeFile(join(dir, 'connector.lock'), '{}');
    await expect(make(dir).tick()).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(join(dir, 'connector.lock'), 'utf8')).toBe('{}');
  });

  it('journals before invoking shared bridge and retains receipt when acknowledgement disconnects', async () => {
    const f = fixture(), dir = await directory(); let calls = 0, failAck = true;
    await f.backend.enqueue(admin, f.input);
    const connector = createConnector({ directory: dir, companyId, controllerId: settings.controllerId, connectorId: 'mbp',
      backend: async (method, args) => { if (method === 'complete' && failAck) throw new Error('disconnected'); return (f.backend[method] as any)(machine, args); },
      bridge: async (method, args) => {
        expect(method).toBe('hq.start'); expect(args.actor).toEqual({ uid: 'chris', role: 'admin', kind: 'user' });
        expect(JSON.parse(await readFile(join(dir, journalName(operationId)), 'utf8')).state).toBe('applying');
        expect(f.data.get(operationId)!.state).toBe('applying'); calls++;
        return { operation: { operationId, state: 'receipted' }, work: { terminal: false } };
      } });
    await expect(connector.tick()).rejects.toThrow('disconnected');
    expect(calls).toBe(1); failAck = false; await connector.tick();
    expect(calls).toBe(1); expect(f.data.get(operationId)!.state).toBe('completed');
    expect(JSON.parse(await readFile(join(dir, journalName(operationId)), 'utf8')).state).toBe('acked');
  });
  it('never repeats a bridge call after unknown outcome, including reconnect', async () => {
    const f = fixture(), dir = await directory(); let calls = 0; await f.backend.enqueue(admin, f.input);
    const connector = createConnector({ directory: dir, companyId, controllerId: settings.controllerId, connectorId: 'mbp', backend: (method, args) => (f.backend[method] as any)(machine, args), bridge: async () => { calls++; throw new Error('response lost after create'); } });
    await connector.tick(); await connector.tick(); expect(calls).toBe(1); expect(f.data.get(operationId)!.state).toBe('unknown');
  });
  it('handles interrupted applying journal as unknown without launching a worker', async () => {
    const f = fixture(), dir = await directory(); await f.backend.enqueue(admin, f.input); const command = await f.backend.claim(machine, { operationId });
    await f.backend.beginApply(machine, { operationId, fence: command!.fence! });
    await writeFile(join(dir, journalName(operationId)), JSON.stringify({ version: 1, operationId, requestHash: command!.requestHash, fence: command!.fence, state: 'applying' }));
    let calls = 0;
    await createConnector({ directory: dir, companyId, controllerId: settings.controllerId, connectorId: 'mbp', backend: (method, args) => (f.backend[method] as any)(machine, args), bridge: async () => { calls++; } }).tick();
    expect(calls).toBe(0); expect(f.data.get(operationId)!.state).toBe('unknown');
  });
  it('refuses a foreign response before any bridge call', async () => {
    const f = fixture(), dir = await directory(); const command = await f.backend.enqueue(admin, f.input); let calls = 0;
    await expect(createConnector({ directory: dir, companyId, controllerId: settings.controllerId, connectorId: 'mbp', backend: async method => method === 'pending' ? [operationId] : { ...command, companyId: operationId }, bridge: async () => { calls++; } }).tick()).rejects.toThrow('foreign');
    expect(calls).toBe(0);
  });
});
