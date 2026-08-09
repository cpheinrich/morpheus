/** The progress comment's body before the reviewer replaces it with a review. */
export declare const REVIEW_PLACEHOLDER = "I'll analyze this and get back to you.";
/** The action writes this into the tracking comment when its run aborts. */
export declare const REVIEW_ERROR_PREFIX = "**Claude encountered an error after";
/** Workflow sentinel: the pre-run comment list could not be read. */
export declare const UNREADABLE_COMMENT_SNAPSHOT = "__unreadable__";
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
