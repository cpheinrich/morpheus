import { z } from "zod";

const time = z.iso.datetime({ precision: 3 });
const timing = z.object({
  source: z.literal("runner"),
  startedAt: time,
  endedAt: time,
  durationMs: z.number().int().positive(),
  evidence: z.string().min(1).max(512),
});

export const invocationReceipt = z.discriminatedUnion("launch", [
  z.object({
    launch: z.literal("session"), admissionId: z.uuid(), sessionId: z.uuid(),
    timing: timing.optional(),
  }),
  z.object({ launch: z.literal("never-launched"), admissionId: z.uuid().nullable(), sessionId: z.null() }),
  z.object({ launch: z.literal("unknown"), admissionId: z.uuid(), sessionId: z.null() }),
]);

// The executor uses only verified guardian and CLI evidence, never the model's result.
export function invocationFromWorker(output) {
  if (output?.terminationVerified !== true) return undefined;
  const { admissionId } = output;
  const candidate = output.launch === "session"
    ? { launch: "session", admissionId, sessionId: output.sessionId, timing: output.timing }
    : { launch: output.launch ?? "unknown", admissionId, sessionId: null };
  return invocationReceipt.safeParse(candidate).data;
}

export function notLaunched(admissionId = null) {
  return { launch: "never-launched", admissionId, sessionId: null };
}

export const receiptPath = (taskId) => `factoryReceipts/${taskId}`;
