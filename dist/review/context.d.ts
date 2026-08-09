import { type ReviewContext } from "./prompt.js";
/** Where the reviewer persona lives. Versioned, so it is reviewable itself. */
export declare const PERSONA_PATH = ".github/agent-review-prompt.md";
export declare class ReviewError extends Error {
}
export interface LoadOptions {
    root: string;
    productDir: string;
    branch: string;
}
/**
 * Gather everything the reviewer needs to know about intent.
 *
 * The persona is required — running rung 2 with no persona would produce a
 * generic "look for bugs" review, which is the rung below with a model bolted
 * on. Everything else is optional and its absence is reported to the reviewer
 * rather than hidden from it.
 */
export declare function loadReviewContext(opts: LoadOptions): Promise<ReviewContext>;
