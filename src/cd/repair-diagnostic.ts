import { z } from "zod";
import { canonical, decimal, digest, hash, sha, type AgentWork, type CdState } from "./schema.js";
import { invariant } from "./state.js";
import { type GitHubStore } from "./store.js";

export const REPAIR_DIAGNOSTIC_MAX_BYTES = 16_384;
const identifier = z.string().regex(/^[A-Za-z0-9_.:-]+$/).min(1).max(160);
const text = (maximum: number) => z.string().min(1).max(maximum).refine(value => value.trim().length > 0, "Diagnostic text cannot be blank");
export const repairDiagnosticSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal("repair-diagnostic"),
  workId: identifier, taskDigest: digest, intentId: identifier, attemptId: identifier,
  dispatchEffectId: identifier, sourceSha: sha, controlSha: sha,
  runId: decimal.max(32), runAttempt: decimal.max(32),
  diagnostic: z.object({ summary: text(8192), evidence: z.array(text(4096)).max(8) }).strict(),
}).strict();
export type RepairDiagnostic = z.infer<typeof repairDiagnosticSchema>;
export interface RepairDiagnosticReceipt {
  workId: string; taskDigest: string; intentId: string; attemptId: string; diagnosticId: string;
}
export interface RepairDiagnosticResult {
  head: string; replayed: boolean; result: RepairDiagnosticReceipt; eventId: string; eventOwner: string;
  verifiedReadbackHead: string; targetCurrent: boolean;
}
function prepare(input: unknown) {
  // Zod copies the entire input before any asynchronous read or CAS retry.
  const evidence = repairDiagnosticSchema.parse(input), encoded = canonical(evidence);
  invariant(Buffer.byteLength(encoded, "utf8") <= REPAIR_DIAGNOSTIC_MAX_BYTES, "Repair diagnostic exceeds 16384 UTF-8 bytes");
  const diagnosticId = hash(encoded), transitionId = `repair-diagnostic-${diagnosticId}`;
  const receipt: RepairDiagnosticReceipt = { workId: evidence.workId, taskDigest: evidence.taskDigest, intentId: evidence.intentId, attemptId: evidence.attemptId, diagnosticId };
  return { evidence, encoded, transitionId, receipt };
}
type Prepared = ReturnType<typeof prepare>;
function target(state: CdState, input: Prepared): AgentWork {
  const evidence = input.evidence, intent = state.intents[evidence.intentId], work = state.agents[evidence.workId];
  invariant(intent?.id === evidence.intentId && intent.state === "repairing" && !intent.receipt, "Diagnostic intent is not an undelivered current repair");
  invariant(work?.id === evidence.workId && work.intentId === intent.id && ["pending", "running", "waiting"].includes(work.state), "Diagnostic repair work is missing, complete or belongs to another intent");
  const siblings = Object.values(state.agents).filter(item => item.intentId === intent.id);
  invariant(siblings.filter(item => item.state !== "complete").length === 1 && Number.isSafeInteger(work.strategy) && work.strategy > 0 && siblings.every(item => item === work || item.state === "complete" && item.strategy < work.strategy), "Diagnostic target is not the unique latest repair work");
  invariant(work.taskDigest === evidence.taskDigest && typeof work.task === "string" && hash(work.task) === evidence.taskDigest, "Diagnostic repair task digest differs");
  const attempt = intent.attempts.at(-1);
  invariant(attempt?.id === evidence.attemptId && attempt.status === "failed", "Diagnostic requires the latest failed attempt");
  invariant(intent.source === evidence.sourceSha && attempt.sourceSha === evidence.sourceSha && attempt.controlSha === evidence.controlSha && attempt.dispatchEffectId === evidence.dispatchEffectId, "Diagnostic execution identity differs from the current immutable attempt");
  // Failed attempts must already own both run fields. Never bind a new run here.
  invariant(attempt.runId === evidence.runId && attempt.runAttempt === evidence.runAttempt, "Diagnostic requires the exact already-bound Actions run attempt");
  invariant(Array.isArray(work.evidence) && work.evidence.every(item => typeof item === "string") && work.evidence.filter(item => item === input.encoded).length <= 1, "Diagnostic repair evidence is malformed or duplicated");
  return work;
}
function append(state: CdState, input: Prepared): RepairDiagnosticReceipt {
  const work = target(state, input);
  if (!work.evidence.includes(input.encoded)) work.evidence.push(input.encoded);
  return input.receipt;
}
/** Pure evidence-only reducer; it never creates work or changes executor ownership. */
export function appendRepairDiagnostic(state: CdState, input: unknown): RepairDiagnosticReceipt { return append(state, prepare(input)); }

function readback(state: CdState, input: Prepared): void {
  const { evidence } = input, work = state.agents[evidence.workId], intent = state.intents[evidence.intentId];
  const attempt = intent?.attempts.find(item => item.id === evidence.attemptId), transition = state.transitions[input.transitionId];
  invariant(z.uuid().safeParse(transition?.owner).success && canonical(transition?.result) === canonical(input.receipt), "Repair diagnostic transition receipt differs");
  invariant(work?.id === evidence.workId && work.intentId === evidence.intentId && work.taskDigest === evidence.taskDigest && hash(work.task) === evidence.taskDigest && Array.isArray(work.evidence) && work.evidence.filter(item => item === input.encoded).length === 1, "Repair diagnostic is missing from exact work readback");
  invariant(intent?.id === evidence.intentId && attempt && attempt.sourceSha === evidence.sourceSha && attempt.controlSha === evidence.controlSha && attempt.dispatchEffectId === evidence.dispatchEffectId && attempt.runId === evidence.runId && attempt.runAttempt === evidence.runAttempt, "Repair diagnostic immutable attempt readback differs");
}
function currentTarget(state: CdState, input: Prepared): boolean {
  try { target(state, input); return true; } catch { return false; }
}

/** Normal ledger CAS and verified readback; hashes attest content, not authority. */
export async function recordRepairDiagnostic(store: GitHubStore, input: unknown): Promise<RepairDiagnosticResult> {
  const prepared = prepare(input);
  // A genuine prior note remains recorded after the normal owner progresses. A
  // replay acknowledges that note; it grants no new applicability or execution.
  const before = (await store.read()).state;
  if (before.transitions[prepared.transitionId]) readback(before, prepared);
  else target(before, prepared);
  const transaction = await store.transact(prepared.transitionId, "record-repair-diagnostic", new Date().toISOString(), state => append(state, prepared));
  const final = await store.read(); readback(final.state, prepared);
  invariant(canonical(transaction.result) === canonical(prepared.receipt), "Repair diagnostic transaction receipt differs");
  return { head: transaction.head, replayed: transaction.replayed, result: transaction.result, eventId: prepared.transitionId, eventOwner: final.state.transitions[prepared.transitionId]!.owner!, verifiedReadbackHead: final.head, targetCurrent: currentTarget(final.state, prepared) };
}
