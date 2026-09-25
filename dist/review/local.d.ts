import { z } from "zod";
import type { Finding } from "../check/pr.js";
declare const FollowUp: z.ZodObject<{
    reviewerSession: z.ZodString;
    commit: z.ZodString;
    base: z.ZodOptional<z.ZodString>;
    scopeReason: z.ZodOptional<z.ZodString>;
    humanAuthorization: z.ZodOptional<z.ZodObject<{
        approvedBy: z.ZodString;
        approvedAt: z.ZodISODateTime;
        reason: z.ZodString;
    }, z.core.$strict>>;
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
 * author and a reviewer trading fixes and findings indefinitely: a turn is spent to resolve
 * what the previous one left blocked, or on a late correction after a clearance that names
 * its scope decision, and nothing after the last one is automatic.
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
    trunkIntegrations: z.ZodOptional<z.ZodArray<z.ZodObject<{
        commit: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strict>>>;
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
        roadmap: z.ZodOptional<z.ZodString>;
        condition: z.ZodOptional<z.ZodObject<{
            paths: z.ZodArray<z.ZodString>;
            evidence: z.ZodString;
        }, z.core.$strict>>;
        conditionMet: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    followUp: z.ZodOptional<z.ZodObject<{
        reviewerSession: z.ZodString;
        commit: z.ZodString;
        base: z.ZodOptional<z.ZodString>;
        scopeReason: z.ZodOptional<z.ZodString>;
        humanAuthorization: z.ZodOptional<z.ZodObject<{
            approvedBy: z.ZodString;
            approvedAt: z.ZodISODateTime;
            reason: z.ZodString;
        }, z.core.$strict>>;
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
        humanAuthorization: z.ZodOptional<z.ZodObject<{
            approvedBy: z.ZodString;
            approvedAt: z.ZodISODateTime;
            reason: z.ZodString;
        }, z.core.$strict>>;
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
/** The trunk base the reviewer's clearance covered: the latest recorded integration, else the original. */
export declare function coveredBase(record: LocalReviewRecord): string;
/** Findings the reviewer pre-cleared and the author fixed under the stated condition. */
export declare function conditionallyCleared(record: LocalReviewRecord): string[];
/** Initial-review ceilings in minutes; a follow-up gets half. Small was 5 until the data showed only creative accounting. */
export declare const REVIEW_BUDGET_MINUTES: {
    readonly small: 10;
    readonly normal: 15;
    readonly high: 30;
};
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
