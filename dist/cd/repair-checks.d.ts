import { z } from "zod";
import { type GitHubApi } from "./store.js";
declare const run: any;
type Run = z.infer<typeof run>;
export interface RepairCheckSubject {
    sha: string;
    ref?: string;
    repo?: {
        id: number;
        full_name: string;
    } | null;
}
export interface RepairCheckProof {
    checkIds: number[];
    superseded: {
        checkId: number;
        successorCheckId: number;
        oldRun: Run;
        successorRun: Run;
    }[];
}
/** Read-only cancellation exception; all other conclusions retain the strict gate. */
export declare function verifyRepairChecks(api: GitHubApi, name: string, subject: RepairCheckSubject, baseRepository?: {
    id: number;
    full_name: string;
} | null): Promise<RepairCheckProof>;
export {};
