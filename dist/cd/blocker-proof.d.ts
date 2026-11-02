import { z } from "zod";
import { type AgentResult } from "./schema.js";
export declare const BLOCKER_PROOF_PREFIX = "morpheus-blocker-proof-v1:";
export declare const BLOCKER_PROOF_MAX_BYTES = 32768;
export declare const blockerBindingSchema: z.ZodObject<{
    workId: z.ZodString;
    invocationId: z.ZodString;
    fence: z.ZodNumber;
    taskDigest: z.ZodString;
    contextDigest: z.ZodString;
    claimedAt: z.ZodISODateTime;
    deadlineAt: z.ZodISODateTime;
}, z.core.$strict>;
export type BlockerBinding = z.infer<typeof blockerBindingSchema>;
export declare const blockerProofSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    binding: z.ZodObject<{
        workId: z.ZodString;
        invocationId: z.ZodString;
        fence: z.ZodNumber;
        taskDigest: z.ZodString;
        contextDigest: z.ZodString;
        claimedAt: z.ZodISODateTime;
        deadlineAt: z.ZodISODateTime;
    }, z.core.$strict>;
    reportedAt: z.ZodISODateTime;
    symptom: z.ZodObject<{
        summary: z.ZodString;
        identityRef: z.ZodString;
        observedAt: z.ZodISODateTime;
        evidenceRefs: z.ZodArray<z.ZodString>;
    }, z.core.$strict>;
    authority: z.ZodObject<{
        ref: z.ZodString;
        summary: z.ZodString;
        checkedAt: z.ZodISODateTime;
    }, z.core.$strict>;
    tried: z.ZodArray<z.ZodObject<{
        route: z.ZodString;
        action: z.ZodString;
        outcome: z.ZodString;
        observedAt: z.ZodISODateTime;
        checkedAt: z.ZodISODateTime;
        evidenceRefs: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    excluded: z.ZodArray<z.ZodObject<{
        route: z.ZodString;
        disposition: z.ZodEnum<{
            unavailable: "unavailable";
            unsafe: "unsafe";
            "outside-authority": "outside-authority";
            disproportionate: "disproportionate";
        }>;
        reason: z.ZodString;
        checkedAt: z.ZodISODateTime;
        evidenceRefs: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    noPracticalAction: z.ZodOptional<z.ZodObject<{
        boundary: z.ZodEnum<{
            "human-only-judgment": "human-only-judgment";
            "missing-authorized-access": "missing-authorized-access";
        }>;
        requiredPrincipal: z.ZodString;
        authorityRef: z.ZodString;
        explanation: z.ZodString;
        evidenceRefs: z.ZodArray<z.ZodString>;
    }, z.core.$strict>>;
    exhaustionReason: z.ZodString;
    missingCapability: z.ZodString;
    minimumExternalStep: z.ZodString;
    independentWork: z.ZodArray<z.ZodString>;
    nextWake: z.ZodObject<{
        event: z.ZodString;
        at: z.ZodISODateTime;
    }, z.core.$strict>;
}, z.core.$strict>;
export type BlockerProof = z.infer<typeof blockerProofSchema>;
export declare function blockerProofInstructions(binding: BlockerBinding): string;
export interface BlockerClaimReceipt {
    status: "rejected" | "cto-verification-required";
    reason: string;
    proofDigest?: string;
    attemptedResult: AgentResult;
}
export interface BlockerAssessment {
    result: AgentResult;
    claim?: BlockerClaimReceipt;
    continueImmediately: boolean;
}
/** Validate a candidate, never its truth or the CTO's independent acceptance. */
export declare function assessBlockedResult(result: AgentResult, binding: BlockerBinding, completedAt: string, currentContextDigest: string): BlockerAssessment;
