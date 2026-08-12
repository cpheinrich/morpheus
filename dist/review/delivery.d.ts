/** The progress comment's body before the reviewer replaces it with a review. */
export declare const REVIEW_PLACEHOLDER = "I'll analyze this and get back to you.";
/** The action writes this into the tracking comment when its run aborts. */
export declare const REVIEW_ERROR_PREFIX = "**Claude encountered an error";
/** Workflow sentinel: the pre-run comment list could not be read. */
export declare const UNREADABLE_COMMENT_SNAPSHOT = "__unreadable__";
/** Workflow sentinel: the pre-run read succeeded and found no comment for this run id. */
export declare const NO_PRIOR_COMMENT = "__none__";
/** Written by the action's post step only after it has finalized successfully. */
export declare const REVIEW_FINISHED_PREFIX = "**Claude finished @";
/** Morpheus-owned positive evidence that survives the pinned action's sanitizer. */
export declare const REVIEW_DELIVERED_SENTINEL = "[morpheus-review-delivered]: https://morpheus.invalid/review-delivered";
/** Pinned action asset rendered in an unfinished progress body. */
export declare const REVIEW_PROGRESS_SPINNER_ID = "5ac382c7-e004-429b-8e35-7feb3e8f9c6f";
export interface ReviewDelivery {
    beforeCommentId?: string;
    commentId?: string;
    body?: string;
}
export interface DeliveryAssessment {
    delivered: boolean;
    why: string;
}
/**
 * Whether this run left a new tracking comment that contains an actual review.
 *
 * Comment existence alone is not delivery: the action creates its progress
 * comment before the model reads the diff, then leaves either the placeholder
 * or an error body behind when it never manages to report. The final body is
 * therefore the evidence, while the before/after ids keep an older successful
 * review from certifying a broken current run.
 */
export declare function assessReviewDelivery(input: ReviewDelivery): DeliveryAssessment;
