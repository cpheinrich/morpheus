import { z } from "zod";
import type { Finding } from "../check/pr.js";
export declare const ManagerReviewRecord: z.ZodObject<{
    version: z.ZodLiteral<1>;
    managerSession: z.ZodString;
    reviewed: z.ZodString;
    covered: z.ZodString;
    priorReview: z.ZodObject<{
        state: z.ZodEnum<{
            complete: "complete";
            none: "none";
            invalid: "invalid";
            stalled: "stalled";
            exhausted: "exhausted";
        }>;
        note: z.ZodString;
    }, z.core.$strict>;
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
            noted: "noted";
        }>;
        response: z.ZodString;
    }, z.core.$strict>>;
    trunkIntegrations: z.ZodOptional<z.ZodArray<z.ZodObject<{
        commit: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strict>>>;
    outcome: z.ZodEnum<{
        cleared: "cleared";
        escalated: "escalated";
    }>;
    summary: z.ZodString;
}, z.core.$strict>;
export type ManagerReviewRecord = z.infer<typeof ManagerReviewRecord>;
export declare function parseManagerReviewRecord(markdown: string): ManagerReviewRecord;
export declare function validateManagerReviewRecord(record: ManagerReviewRecord): void;
export interface ManagerReviewInput {
    root: string;
    body: string;
    labels: string[];
    /** Login that most recently applied the manager label, or undefined when it could not be read. */
    labelActor?: string | undefined;
    head: string;
    base: string;
}
/** True when the pull request asks to be judged on the manager's review rather than the author's. */
export declare function usesManagerReview(labels: string[]): boolean;
/** Read only committed evidence; paths and refs are data, never shell text. */
export declare function checkManagerReview(opts: ManagerReviewInput): Finding[];
