import { z } from "zod";
import { type CdState } from "./schema.js";
import { type GitHubStore } from "./store.js";
export declare const REPAIR_DIAGNOSTIC_MAX_BYTES = 16384;
export declare const repairDiagnosticSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    kind: z.ZodLiteral<"repair-diagnostic">;
    workId: z.ZodString;
    taskDigest: z.ZodString;
    intentId: z.ZodString;
    attemptId: z.ZodString;
    dispatchEffectId: z.ZodString;
    sourceSha: z.ZodString;
    controlSha: z.ZodString;
    runId: z.ZodString;
    runAttempt: z.ZodString;
    diagnostic: z.ZodObject<{
        summary: z.ZodString;
        evidence: z.ZodArray<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type RepairDiagnostic = z.infer<typeof repairDiagnosticSchema>;
export interface RepairDiagnosticReceipt {
    workId: string;
    taskDigest: string;
    intentId: string;
    attemptId: string;
    diagnosticId: string;
}
export interface RepairDiagnosticResult {
    head: string;
    replayed: boolean;
    result: RepairDiagnosticReceipt;
    eventId: string;
    eventOwner: string;
    verifiedReadbackHead: string;
    targetCurrent: boolean;
}
/** Pure evidence-only reducer; it never creates work or changes executor ownership. */
export declare function appendRepairDiagnostic(state: CdState, input: unknown): RepairDiagnosticReceipt;
/** Normal ledger CAS and verified readback; hashes attest content, not authority. */
export declare function recordRepairDiagnostic(store: GitHubStore, input: unknown): Promise<RepairDiagnosticResult>;
