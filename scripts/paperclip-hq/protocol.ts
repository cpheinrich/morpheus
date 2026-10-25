import { createHash } from 'node:crypto';
import { z } from 'zod';

export const id = z.string().uuid();
const text = z.string().trim().min(1).max(200_000);
const conversation = z.object({ conversationId: id });
export const requestSchema = z.discriminatedUnion('action', [
  z.object({ operationId: id, companyId: id, action: z.literal('start'), args: z.object({ profile: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), prompt: text }).strict() }).strict(),
  z.object({ operationId: id, companyId: id, action: z.literal('followup'), args: conversation.extend({ prompt: text }).strict() }).strict(),
  z.object({ operationId: id, companyId: id, action: z.literal('answer'), args: conversation.extend({ questionId: z.string().min(1).max(200), answers: z.record(z.string(), z.string().max(20_000)).optional(), allow: z.boolean().optional() }).strict().refine(a => (a.answers !== undefined) !== (a.allow !== undefined), 'provide answers or allow') }).strict(),
  z.object({ operationId: id, companyId: id, action: z.literal('stop'), args: conversation.strict() }).strict(),
]);
export type CommandRequest = z.infer<typeof requestSchema>;
export type Actor = { uid: string; role: 'admin'; kind: 'user' };
export type Command = {
  version: 1; operationId: string; companyId: string; controllerId: string; configHash: string;
  request: CommandRequest; requestHash: string; actor: Actor;
  state: 'pending' | 'claimed' | 'applying' | 'completed' | 'unknown' | 'rejected';
  createdAt: number; expiresAt: number; updatedAt: number;
  fence?: string; leaseUntil?: number; result?: unknown; error?: string;
};
// Canonical object ordering makes retries independent of transport key ordering.
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
}
export const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export function boundedJson(value: unknown, bytes = 64 * 1024): unknown {
  const encoded = JSON.stringify(value);
  if (!encoded || Buffer.byteLength(encoded) > bytes) throw new Error('Receipt exceeds JSON bound');
  return JSON.parse(encoded);
}
export class TransportError extends Error {
  constructor(public code: 'unauthenticated' | 'permission-denied' | 'invalid-argument' | 'not-found' | 'failed-precondition' | 'already-exists', message: string) { super(message); }
}
