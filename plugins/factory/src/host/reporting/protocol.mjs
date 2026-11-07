// Canonical v1 wire boundary. Darwin vendors this file verbatim until the first reviewed release.
import { z } from 'zod';
export const MAX_BYTES = 65536;
export const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/);
const stamp = z.iso.datetime({ offset: true });
const number = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const percent = number.max(100);
const project = z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/).max(150);
const projects = z.array(project).max(16);
const outcome = z.enum(['completed', 'needs_input', 'failed', 'interrupted']);
const label = z.string().min(1).max(160);
const labels = z.array(label).max(20);
const optionalLabel = label.nullable();
const job = z.strictObject({ repository: project, runId: number.int(), attempt: number.int().min(1),
  jobId: number.int(), runnerId: number.int().nullable(), name: label, currentStep: optionalLabel, state: z.enum(['queued','in_progress','completed','waiting','pending','requested']),
  conclusion: z.enum(['success','failure','cancelled','skipped','timed_out','action_required','neutral','stale','startup_failure']).nullable(),
  url: z.string().max(300).refine(v => /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+\/job\/\d+$/.test(v)) });
const instance = z.strictObject({ id, invocationId: z.string().uuid(), executor: z.enum(['codex','claude']),
  accountId: id.nullable(), projectIds: projects, state: z.enum(['running','starting','cleanup-unverified','unknown']),
  createdAt: stamp.nullable(), hostId: id, taskId: id.nullable(), model: optionalLabel, effort: z.enum(['none','minimal','low','medium','high','xhigh','max','ultra']).nullable() });
export const values = {
  machine: z.strictObject({ cpuPercent: percent.nullable(), memoryTotalBytes: number, memoryActiveBytes: number,
    diskAvailableBytes: number, diskTotalBytes: number, uptimeSeconds: number,
    hardwareModel:optionalLabel, chip:optionalLabel, logicalCores:number.int().positive().nullable(), osVersion:optionalLabel }),
  factory: z.strictObject({ complete: z.boolean(), instances: z.array(instance).max(64), lastOutcome: outcome.nullable() }),
  routes: z.strictObject({ enabled: z.boolean(), maxConcurrent: number.int().max(64),
    routes: z.array(z.strictObject({ id, provider: z.enum(['codex','claude']), accountId: id.nullable() })).max(16) }),
  quota: z.strictObject({ accountId: id, provider: z.enum(['codex','claude']),
    windows: z.array(z.strictObject({ name: z.enum(['5h','7d']), usedPercent: percent, resetsAt: stamp.nullable() })).max(2) }),
  dispatcher: z.strictObject({ serviceRunning: z.boolean().nullable(), configuredSlots: number.int().max(32), cpuPerSlot: number.int(),
    memoryMbPerSlot: number, allocations: z.array(z.strictObject({ slot: number.int(), projectId: project, runnerId: number.int().nullable() })).max(32),
    runningVms: number.int().nullable(), nullSlotsAmbiguous: z.literal(true), unreportedSlots:number.int(), simulatorLanes:number.int().positive().nullable(), roles:labels, labels }),
  runners:z.strictObject({complete:z.boolean(),registrations:z.array(z.strictObject({runnerId:number.int().positive(),projectId:project,
    scope:z.enum(['repository','organization']),roles:labels,labels})).max(64)}),
  github: z.strictObject({ jobs: z.array(job).max(100), runners: z.array(z.strictObject({ projectId: project, runnerId: number.int(),
    online: z.boolean(), busy: z.boolean(), labels })).max(100), orgCensus: z.enum(['unavailable','not-requested']) }),
  phone: z.strictObject({ lease: z.enum(['held','absent','unknown']), ready: z.boolean().nullable() }),
};
export const sampleSchema = z.strictObject({ kind: z.enum(Object.keys(values)), sampledAt: stamp,
  sourceObservedAt: stamp.nullable(), status: z.enum(['ok','partial','error']),
  errorCode: z.enum(['unavailable','incomplete','source-clock','invalid-source']).nullable(), value: z.unknown() });
export const reportSchema = z.strictObject({ schemaVersion: z.literal(1), hostId: id,
  samples: z.record(id, sampleSchema).refine(s => Object.keys(s).length > 0 && Object.keys(s).length <= 16) });
export function parseReport(input, now = Date.now()) {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) throw new Error('invalid-report');
  for (const sample of Object.values(parsed.data.samples)) {
    const time = Date.parse(sample.sampledAt);
    if (time > now + 60000 || time < now - 600000) throw new Error('source-clock');
    if (sample.sourceObservedAt && Date.parse(sample.sourceObservedAt) > time + 60000) throw new Error('source-clock');
    if (sample.status === 'error') {
      if (sample.value !== null || !sample.errorCode) throw new Error('invalid-report');
    } else if (!values[sample.kind].safeParse(sample.value).success || !sample.sourceObservedAt) throw new Error('invalid-report');
  }
  return parsed.data;
}
export function freshness(sample, now = Date.now()) {
  if (!sample || sample.status === 'error' || !sample.sourceObservedAt) return 'unknown';
  if (now - Date.parse(sample.sourceObservedAt) > 180000) return 'stale';
  return sample.status === 'partial' ? 'partial' : 'fresh';
}
