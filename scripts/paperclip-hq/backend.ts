import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { boundedJson, digest, id, requestSchema, TransportError, type Command } from './protocol.js';
import type { CommandStore } from './store.js';
import { projectionSchema, type ProjectionStore } from './projection.js';

export type User = { uid: string; disabled?: boolean; email?: string; emailVerified?: boolean; customClaims?: { role?: string } };
export type Settings = { companyId: string; controllerId: string; connectorUid: string; profiles: string[]; allowedOrigins?: string[]; humans?: { uid: string; email: string }[] };
export type Auth = { uid: string } | undefined;
type Directory = (uid: string) => Promise<User>;
const fail = (code: ConstructorParameters<typeof TransportError>[0], message: string): never => { throw new TransportError(code, message); };

export function createBackend({ settings, store, projection, user, now = Date.now, claimMs = 120_000, commandMs = 30 * 60_000 }: {
  settings: Settings; store: CommandStore; projection?: ProjectionStore; user: Directory; now?: () => number; claimMs?: number; commandMs?: number;
}) {
  settings = z.object({
    companyId: id, controllerId: z.string().min(1).max(128), connectorUid: z.string().min(1).max(128),
    profiles: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)).min(1).max(100),
    allowedOrigins: z.array(z.url()).max(20).optional(),
    humans: z.array(z.object({ uid: z.string().min(1).max(128), email: z.email() }).strict()).max(20).optional(),
  }).strict().parse(settings);
  if (![claimMs, commandMs].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('Positive bounded command and claim durations required');
  const configHash = digest(settings);
  async function human(auth: Auth, write: boolean) {
    if (!auth?.uid) fail('unauthenticated', 'Sign in to HQ');
    if (auth!.uid === settings.connectorUid) fail('permission-denied', 'Connector cannot act as a human');
    let record: User;
    try { record = await user(auth!.uid); } catch { return fail('permission-denied', 'HQ identity unavailable'); }
    const configured = settings.humans?.some(person => person.uid === record.uid && record.emailVerified === true && person.email.toLowerCase() === record.email?.toLowerCase());
    if (record.uid !== auth!.uid || record.disabled || (!configured && !['admin', ...(write ? [] : ['employee'])].includes(record.customClaims?.role ?? ''))) fail('permission-denied', 'HQ role required');
    return record;
  }
  async function connector(auth: Auth) {
    if (!auth?.uid) fail('unauthenticated', 'Connector authentication required');
    if (auth!.uid !== settings.connectorUid) fail('permission-denied', 'Wrong connector identity');
    let record: User;
    try { record = await user(auth!.uid); } catch { return fail('permission-denied', 'Connector identity unavailable'); }
    if (record.uid !== auth!.uid || record.disabled) fail('permission-denied', 'Connector disabled');
  }
  function check(current: Command | null): asserts current is Command {
    if (!current) fail('not-found', 'Unknown HQ operation');
    if (current!.companyId !== settings.companyId || current!.controllerId !== settings.controllerId || current!.configHash !== configHash) fail('failed-precondition', 'HQ configuration changed; reconcile existing operation');
  }
  function fence(current: Command, token: string) {
    if (!token || token !== current.fence) fail('failed-precondition', 'Stale connector claim');
  }
  function operation(value: unknown) {
    const parsed = id.safeParse(value);
    if (!parsed.success) return fail('invalid-argument', 'Invalid operation ID');
    return parsed.data;
  }
  return {
    async publish(auth: Auth, input: unknown) {
      await connector(auth);
      if (Buffer.byteLength(JSON.stringify(input) ?? '') > 750 * 1024) fail('invalid-argument', 'HQ projection exceeds byte bound');
      const parsed = projectionSchema.safeParse(input);
      if (!parsed.success) fail('invalid-argument', 'Invalid bounded HQ projection');
      const value = parsed.data!;
      if (value.companyId !== settings.companyId) fail('permission-denied', 'Wrong HQ company');
      const publishedAt = now();
      if (value.observedAt > publishedAt + 30_000 || value.observedAt < publishedAt - 5 * 60_000 || value.controller.observedAt !== value.observedAt) fail('invalid-argument', 'Projection observation time is stale or invalid');
      if (!projection) fail('failed-precondition', 'Projection storage unavailable');
      await projection!.publish({ ...value, publishedAt });
      return { observedAt: value.observedAt, publishedAt };
    },
    async snapshot(auth: Auth, input: unknown) {
      await human(auth, false);
      if (!z.object({}).strict().safeParse(input).success) fail('invalid-argument', 'Snapshot takes no target override');
      if (!projection) fail('failed-precondition', 'Projection storage unavailable');
      return projection!.get();
    },
    async enqueue(auth: Auth, input: unknown) {
      const actor = await human(auth, true);
      const parsed = requestSchema.safeParse(input);
      if (!parsed.success) fail('invalid-argument', 'Invalid bounded HQ command');
      const request = parsed.data!;
      if (request.companyId !== settings.companyId) fail('permission-denied', 'Wrong HQ company');
      if (request.action === 'start' && !settings.profiles.includes(request.args.profile)) fail('permission-denied', 'Profile is not configured for this HQ');
      const requestHash = digest({ request, actorUid: actor.uid });
      return store.transaction(request.operationId, current => {
        if (current) {
          check(current);
          if (current.requestHash !== requestHash) fail('already-exists', 'Operation ID already binds different content or actor');
          return { value: current };
        }
        const stamp = now();
        const command: Command = { version: 1, operationId: request.operationId, companyId: settings.companyId,
          controllerId: settings.controllerId, configHash, request, requestHash,
          actor: { uid: actor.uid, role: 'admin', kind: 'user' }, state: 'pending',
          createdAt: stamp, updatedAt: stamp, expiresAt: stamp + commandMs };
        return { value: command, next: command };
      });
    },
    async read(auth: Auth, input: { operationId: unknown }) {
      await human(auth, false);
      const current = await store.get(operation(input.operationId)); check(current);
      // Requests are transient delivery, not a second conversation API.
      return { operationId: current.operationId, state: current.state, updatedAt: current.updatedAt,
        ...(current.result === undefined ? {} : { result: current.result }), ...(current.error ? { error: current.error } : {}) };
    },
    async pending(auth: Auth) {
      await connector(auth);
      const stamp = now();
      const candidates = await store.candidates(100);
      const available: string[] = [];
      for (const item of candidates) {
        if (item.state === 'applying' && item.leaseUntil! <= stamp) {
          await store.transaction(item.operationId, current => {
            check(current);
            if (current.state !== 'applying' || current.leaseUntil! > stamp) return { value: null };
            return { value: null, next: { ...current, state: 'unknown', updatedAt: stamp, error: 'Connector receipt missing; observe original operation before recovery' } };
          });
        } else if (item.state === 'pending' || (item.state === 'claimed' && item.leaseUntil! <= stamp)) available.push(item.operationId);
      }
      return available.slice(0, 25);
    },
    async inspect(auth: Auth, input: { operationId: unknown }) {
      await connector(auth);
      const current = await store.get(operation(input.operationId)); check(current);
      return current;
    },
    async claim(auth: Auth, input: { operationId: unknown }) {
      await connector(auth);
      return store.transaction(operation(input.operationId), current => {
        check(current); const stamp = now();
        if (current.expiresAt <= stamp && current.state !== 'applying') {
          if (['pending', 'claimed'].includes(current.state)) return { value: null, next: { ...current, state: 'rejected', updatedAt: stamp, error: 'HQ command expired before application' } };
          return { value: null };
        }
        if (current.state !== 'pending' && !(current.state === 'claimed' && current.leaseUntil! <= stamp)) return { value: null };
        const next: Command = { ...current, state: 'claimed', fence: randomUUID(), leaseUntil: stamp + claimMs, updatedAt: stamp };
        return { value: next, next };
      });
    },
    async beginApply(auth: Auth, input: { operationId: unknown; fence: string }) {
      await connector(auth);
      const op = operation(input.operationId), seen = await store.get(op); check(seen);
      // Refresh current Firebase user before admitting any delayed control operation.
      try { await human({ uid: seen.actor.uid }, true); }
      catch {
        await store.transaction(op, current => {
          check(current); fence(current, input.fence);
          if (current.state !== 'claimed') fail('failed-precondition', 'Operation is no longer claimable');
          return { value: null, next: { ...current, state: 'rejected', updatedAt: now(), error: 'Actor no longer authorized' } };
        });
        return fail('permission-denied', 'Actor no longer authorized');
      }
      return store.transaction(op, current => {
        check(current); fence(current, input.fence); const stamp = now();
        if (current.state !== 'claimed' || current.leaseUntil! <= stamp || current.expiresAt <= stamp) fail('failed-precondition', 'Claim expired or already applied');
        const next: Command = { ...current, state: 'applying', leaseUntil: stamp + claimMs, updatedAt: stamp };
        return { value: next, next };
      });
    },
    async complete(auth: Auth, input: { operationId: unknown; fence: string; result?: unknown; unknown?: boolean }) {
      await connector(auth);
      const result = input.unknown ? undefined : boundedJson(input.result);
      return store.transaction(operation(input.operationId), current => {
        check(current); fence(current, input.fence);
        if (current.state === 'completed' && !input.unknown && digest(current.result) === digest(result)) return { value: current };
        if (!['applying', 'unknown'].includes(current.state)) fail('failed-precondition', 'Operation has not begun applying');
        const next: Command = { ...current, state: input.unknown ? 'unknown' : 'completed', updatedAt: now(),
          ...(input.unknown ? { error: 'Native operation outcome unknown; observe original operation' } : { result, error: '' }) };
        return { value: next, next };
      });
    },
  };
}
