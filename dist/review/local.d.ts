import { z } from "zod";
import type { Finding } from "../check/pr.js";
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
}, z.core.$strict>;
export type LocalReviewRecord = z.infer<typeof ReviewRecord>;
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
