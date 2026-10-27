import { z } from "zod";
import { type CdState } from "./schema.js";
import { type GitHubStore } from "./store.js";
export declare const REPAIR_DIAGNOSTIC_MAX_BYTES = 16384;
export declare const repairDiagnosticSchema: any;
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
