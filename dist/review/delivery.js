/** The progress comment's body before the reviewer replaces it with a review. */
export const REVIEW_PLACEHOLDER = "I'll analyze this and get back to you.";
/** The action writes this into the tracking comment when its run aborts. */
export const REVIEW_ERROR_PREFIX = "**Claude encountered an error after";
/** Workflow sentinel: the pre-run comment list could not be read. */
export const UNREADABLE_COMMENT_SNAPSHOT = "__unreadable__";
/**
 * Whether this run left a new tracking comment that contains an actual review.
 *
 * Comment existence alone is not delivery: the action creates its progress
 * comment before the model reads the diff, then leaves either the placeholder
 * or an error body behind when it never manages to report. The final body is
 * therefore the evidence, while the before/after ids keep an older successful
 * review from certifying a broken current run.
 */
export function assessReviewDelivery(input) {
    const commentId = input.commentId?.trim();
    const beforeCommentId = input.beforeCommentId?.trim();
    const body = input.body?.trim() ?? "";
    if (beforeCommentId === UNREADABLE_COMMENT_SNAPSHOT) {
        return { delivered: false, why: "could not establish the tracking-comment state before the run" };
    }
    if (!commentId) {
        return { delivered: false, why: "no tracking comment was created" };
    }
    if (beforeCommentId && commentId === beforeCommentId) {
        return { delivered: false, why: "the latest tracking comment belongs to an earlier run" };
    }
    if (!body) {
        return { delivered: false, why: "the new tracking comment is empty" };
    }
    if (body.includes(REVIEW_PLACEHOLDER)) {
        return { delivered: false, why: "the new tracking comment still contains the initial placeholder" };
    }
    if (body.includes(REVIEW_ERROR_PREFIX)) {
        return { delivered: false, why: "the new tracking comment reports that Claude encountered an error" };
    }
    return { delivered: true, why: "a new tracking comment contains the completed review" };
}
//# sourceMappingURL=delivery.js.map