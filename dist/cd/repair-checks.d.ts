import { z } from "zod";
import { type GitHubApi } from "./store.js";
declare const run: z.ZodObject<{
    id: z.ZodNumber;
    workflow_id: z.ZodNumber;
    path: z.ZodString;
    check_suite_id: z.ZodNumber;
    run_number: z.ZodNumber;
    run_attempt: z.ZodNumber;
    head_sha: z.ZodString;
    head_branch: z.ZodString;
    event: z.ZodString;
    status: z.ZodString;
    conclusion: z.ZodNullable<z.ZodString>;
    repository: z.ZodObject<{
        id: z.ZodNumber;
        full_name: z.ZodString;
    }, z.core.$strip>;
    head_repository: z.ZodObject<{
        id: z.ZodNumber;
        full_name: z.ZodString;
    }, z.core.$strip>;
    referenced_workflows: z.ZodOptional<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        sha: z.ZodString;
        ref: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
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
