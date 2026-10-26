import { z } from 'zod';
import { id } from './protocol.js';

export const projectionLimits = { issues: 100, agents: 50, commentsPerIssue: 5, commentsIssues: 10 } as const;
const stamp = z.number().int().nonnegative();
const short = z.string().max(200);
const comment = z.object({ id, body: z.string().max(2000), createdAt: z.string().max(64).nullable() }).strict();
export const projectionSchema = z.object({
  version: z.literal(1), companyId: id, observedAt: stamp,
  controller: z.object({ state: z.literal('online'), observedAt: stamp }).strict(),
  limits: z.object({ issues: z.literal(100), agents: z.literal(50), commentsPerIssue: z.literal(5), commentsIssues: z.literal(10) }).strict(),
  truncated: z.object({ issues: z.boolean(), agents: z.boolean(), comments: z.boolean() }).strict(),
  issues: z.array(z.object({ id, identifier: short, title: z.string().max(500), description: z.string().max(2000),
    status: short, priority: short, assigneeAgentId: id.nullable(), updatedAt: z.string().max(64).nullable(), comments: z.array(comment).max(5),
  }).strict()).max(100),
  agents: z.array(z.object({ id, name: short, role: short, status: short }).strict()).max(50),
}).strict().refine(value => value.issues.filter(issue => issue.comments.length).length <= projectionLimits.commentsIssues, 'Too many comment threads');
export type Projection = z.infer<typeof projectionSchema>;
export type PublishedProjection = Projection & { publishedAt: number };
export interface ProjectionStore {
  get(): Promise<PublishedProjection | null>;
  publish(value: PublishedProjection): Promise<void>;
}
export function firestoreProjectionStore(db: any, companyId: string): ProjectionStore {
  const ref = db.collection('paperclipTransport').doc(companyId).collection('projection').doc('latest');
  return {
    async get() { const snap = await ref.get(); return snap.exists ? snap.data() as PublishedProjection : null; },
    async publish(value) {
      await db.runTransaction(async (tx: any) => {
        const current = await tx.get(ref);
        if (current.exists && current.data().observedAt > value.observedAt) throw new Error('Older observation refused');
        tx.set(ref, value);
      });
    },
  };
}

// These are observations of untrusted source text, never HTML or instructions.
export function displayText(value: unknown, length: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/(?:sk-|gh[pousr]_|AIza)[A-Za-z0-9_-]{16,}/g, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/((?:api[_ -]?key|password|refresh[_ -]?token|secret|access[_ -]?token)\s*[:=]\s*)\S+/gi, '$1[redacted]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, length);
}

export async function boundedResponse(response: Response, maxBytes = 2 * 1024 * 1024): Promise<any> {
  if (!response.ok || !response.body) throw new Error('Source observation unavailable');
  const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > maxBytes) throw new Error('Source observation exceeds bound'); chunks.push(value); }
  } finally { await reader.cancel(); reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function paperclipProjection({ baseUrl, companyId, token, fetchImpl = fetch, now = Date.now }: {
  baseUrl: string; companyId: string; token: () => Promise<string>; fetchImpl?: typeof fetch; now?: () => number;
}) {
  const base = new URL(baseUrl); id.parse(companyId);
  if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Paperclip must use a credential-free loopback origin');
  async function get(path: string) {
    return boundedResponse(await fetchImpl(new URL(path, base), { redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${await token()}` } }));
  }
  function rows(value: unknown, companyRequired: boolean): any[] {
    if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || !id.safeParse(row.id).success || (companyRequired && row.companyId !== companyId))) throw new Error('Invalid or foreign Paperclip observation');
    return value;
  }
  return async (): Promise<Projection> => {
    const observedAt = now();
    const [allIssues, allAgents] = await Promise.all([
      get(`/api/companies/${companyId}/issues?limit=101`).then(value => rows(value, true)),
      get(`/api/companies/${companyId}/agents`).then(value => rows(value, true)),
    ]);
    const issues = allIssues.slice(0, 100); let commentsTruncated = issues.length > 10;
    const projected = [];
    for (const [index, issue] of issues.entries()) {
      const comments = index < 10 ? rows(await get(`/api/issues/${issue.id}/comments?limit=6`), true) : [];
      if (comments.some(row => row.issueId !== issue.id)) throw new Error('Foreign comment observation');
      if (comments.length >= 5) commentsTruncated = true;
      projected.push({ id: issue.id, identifier: displayText(issue.identifier, 200), title: displayText(issue.title, 500), description: displayText(issue.description, 2000),
        status: displayText(issue.status, 200), priority: displayText(issue.priority, 200), assigneeAgentId: id.safeParse(issue.assigneeAgentId).success ? issue.assigneeAgentId : null,
        updatedAt: typeof issue.updatedAt === 'string' ? issue.updatedAt.slice(0, 64) : null,
        comments: comments.slice(-5).map(row => ({ id: row.id, body: displayText(row.body, 2000), createdAt: typeof row.createdAt === 'string' ? row.createdAt.slice(0, 64) : null })),
      });
    }
    return projectionSchema.parse({ version: 1, companyId, observedAt, controller: { state: 'online', observedAt }, limits: projectionLimits,
      truncated: { issues: allIssues.length >= 100, agents: allAgents.length >= 50, comments: commentsTruncated }, issues: projected,
      agents: allAgents.slice(0, 50).map(row => ({ id: row.id, name: displayText(row.name, 200), role: displayText(row.role, 200), status: displayText(row.status, 200) })),
    });
  };
}
