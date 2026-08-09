/** The progress comment's body before the reviewer replaces it with a review. */
export const REVIEW_PLACEHOLDER = "I'll analyze this and get back to you.";
/** The action writes this into the tracking comment when its run aborts. */
export const REVIEW_ERROR_PREFIX = "**Claude encountered an error";
/** Workflow sentinel: the pre-run comment list could not be read. */
export const UNREADABLE_COMMENT_SNAPSHOT = "__unreadable__";
/** Workflow sentinel: the pre-run read succeeded and found no comment for this run id. */
export const NO_PRIOR_COMMENT = "__none__";
/** Written by the action's post step only after it has finalized successfully. */
export const REVIEW_FINISHED_PREFIX = "**Claude finished @";
/** Morpheus-owned positive evidence required by the versioned reviewer persona. */
export const REVIEW_DELIVERED_SENTINEL = "<!-- morpheus:review-delivered -->";
/** Pinned action asset kept on the first line of an unfinished progress body. */
export const REVIEW_PROGRESS_SPINNER_ID = "5ac382c7-e004-429b-8e35-7feb3e8f9c6f";
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
    if (!beforeCommentId) {
        return { delivered: false, why: "no pre-run tracking-comment snapshot reached the verifier" };
    }
    if (beforeCommentId === UNREADABLE_COMMENT_SNAPSHOT) {
        return { delivered: false, why: "could not establish the tracking-comment state before the run" };
    }
    if (!commentId) {
        return { delivered: false, why: "no tracking comment was created" };
    }
    if (beforeCommentId !== NO_PRIOR_COMMENT && commentId === beforeCommentId) {
        return { delivered: false, why: "the latest tracking comment belongs to an earlier run" };
    }
    if (!body) {
        return { delivered: false, why: "the new tracking comment is empty" };
    }
    const separator = body.indexOf("\n---\n");
    const header = separator >= 0 ? body.slice(0, separator).trim() : body;
    const reviewBody = separator >= 0 ? body.slice(separator + 5).trim() : "";
    if (header.startsWith(REVIEW_ERROR_PREFIX)) {
        return { delivered: false, why: "the new tracking comment reports that Claude encountered an error" };
    }
    if (!header.startsWith(REVIEW_FINISHED_PREFIX)) {
        return { delivered: false, why: "the new tracking comment has no completed-review marker" };
    }
    if (reviewBody === REVIEW_PLACEHOLDER) {
        return { delivered: false, why: "the finalized tracking comment still contains only the initial placeholder" };
    }
    const firstLine = reviewBody.split("\n", 1)[0] ?? "";
    if (firstLine.includes(REVIEW_PROGRESS_SPINNER_ID)) {
        return { delivered: false, why: "the finalized tracking comment still has the action's progress spinner" };
    }
    if (!reviewBody.includes(REVIEW_DELIVERED_SENTINEL)) {
        return { delivered: false, why: "the finalized tracking comment lacks Morpheus's delivery sentinel" };
    }
    const substantiveReview = reviewBody.replace(REVIEW_DELIVERED_SENTINEL, "").trim();
    if (!substantiveReview) {
        return { delivered: false, why: "the finalized tracking comment contains no review" };
    }
    return { delivered: true, why: "a new tracking comment contains the completed review" };
}
//# sourceMappingURL=delivery.js.map