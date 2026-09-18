import { z } from "zod";
import type { Finding } from "../check/pr.js";
declare const FollowUp: z.ZodObject<{
    reviewerSession: z.ZodString;
    commit: z.ZodString;
    base: z.ZodOptional<z.ZodString>;
    scopeReason: z.ZodOptional<z.ZodString>;
    outcome: z.ZodEnum<{
        blocked: "blocked";
        incomplete: "incomplete";
        cleared: "cleared";
    }>;
    elapsedMinutes: z.ZodNumber;
    summary: z.ZodString;
}, z.core.$strict>;
export type ReviewFollowUp = z.infer<typeof FollowUp>;
/**
 * Reviewer turns after the initial review. Three turns in total is the cap that stops an
 * author and a reviewer trading fixes and findings indefinitely: a third turn exists only
 * to resolve what the second left blocked, and nothing after it is automatic.
 */
export declare const MAX_FOLLOW_UPS = 2;
export declare const ReviewRecord: z.ZodObject<{
    version: z.ZodLiteral<1>;
    base: z.ZodString;
    reviewed: z.ZodString;
    covered: z.ZodString;
    authorSession: z.ZodString;
    reviewerSession: z.ZodString;
    risk: z.ZodEnum<{
        small: "small";
        normal: "normal";
        high: "high";
    }>;
    elapsedMinutes: z.ZodNumber;
    extensionReason: z.ZodOptional<z.ZodString>;
    outcome: z.ZodEnum<{
        blocked: "blocked";
        incomplete: "incomplete";
        complete: "complete";
    }>;
    summary: z.ZodString;
    documentationIntegrations: z.ZodOptional<z.ZodArray<z.ZodObject<{
        base: z.ZodString;
        commit: z.ZodString;
        reason: z.ZodString;
        sources: z.ZodArray<z.ZodObject<{
            commit: z.ZodString;
            reviewRecord: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
    findings: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        severity: z.ZodEnum<{
            minor: "minor";
            substantive: "substantive";
            incidental: "incidental";
        }>;
        description: z.ZodString;
        paths: z.ZodArray<z.ZodString>;
        disposition: z.ZodEnum<{
            fixed: "fixed";
            open: "open";
            deferred: "deferred";
            disputed: "disputed";
        }>;
        response: z.ZodString;
    }, z.core.$strict>>;
    followUp: z.ZodOptional<z.ZodObject<{
        reviewerSession: z.ZodString;
        commit: z.ZodString;
        base: z.ZodOptional<z.ZodString>;
        scopeReason: z.ZodOptional<z.ZodString>;
        outcome: z.ZodEnum<{
            blocked: "blocked";
            incomplete: "incomplete";
            cleared: "cleared";
        }>;
        elapsedMinutes: z.ZodNumber;
        summary: z.ZodString;
    }, z.core.$strict>>;
    followUps: z.ZodOptional<z.ZodArray<z.ZodObject<{
        reviewerSession: z.ZodString;
        commit: z.ZodString;
        base: z.ZodOptional<z.ZodString>;
        scopeReason: z.ZodOptional<z.ZodString>;
        outcome: z.ZodEnum<{
            blocked: "blocked";
            incomplete: "incomplete";
            cleared: "cleared";
        }>;
        elapsedMinutes: z.ZodNumber;
        summary: z.ZodString;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type LocalReviewRecord = z.infer<typeof ReviewRecord>;
/** Follow-up turns in order, whichever field the record used. */
export declare function followUpTurns(record: LocalReviewRecord): ReviewFollowUp[];
/** The trunk base the clearance finally covered: the latest recorded integration, else the original. */
export declare function coveredBase(record: LocalReviewRecord): string;
export declare function reviewRequired(config: unknown): boolean;
export declare function git(root: string, args: string[]): string;
export declare function parseReviewRecord(markdown: string): LocalReviewRecord;
export declare function validateReviewRecord(record: LocalReviewRecord): void;
/** Read only committed evidence; paths and refs are data, never shell text. */
export declare function checkLocalReview(opts: {
    root: string;
    body: string;
    labels: string[];
    head: string;
    base: string;
}): Finding[];
export {};
