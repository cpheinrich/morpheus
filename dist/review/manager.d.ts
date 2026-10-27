import { z } from "zod";
import type { Finding } from "../check/pr.js";
export declare const ManagerReviewRecord: any;
export type ManagerReviewRecord = z.infer<typeof ManagerReviewRecord>;
export declare function parseManagerReviewRecord(markdown: string): ManagerReviewRecord;
export declare function validateManagerReviewRecord(record: ManagerReviewRecord): void;
export interface ManagerReviewInput {
    root: string;
    body: string;
    labels: string[];
    /** Login that most recently applied the manager label, or undefined when it could not be read. */
    labelActor?: string | undefined;
    /**
     * The head the App cleared, from the newest marker in its own comments that carries one.
     * Undefined when there is none or it could not be read, which is refused.
     */
    clearedHead?: string | undefined;
    head: string;
    base: string;
}
/** True when the pull request asks to be judged on the manager's review rather than the author's. */
export declare function usesManagerReview(labels: string[]): boolean;
/** Read only committed evidence; paths and refs are data, never shell text. */
export declare function checkManagerReview(opts: ManagerReviewInput): Finding[];
