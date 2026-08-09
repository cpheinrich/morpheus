export declare function prompt(productDir: string, root: string): Promise<number>;
/**
 * Whether this change is worth spending a review on.
 *
 * Rung 2 reads code. A push that changes only records and board bookkeeping has
 * nothing for it, and the bill says so: of the seven review runs during MO-051's
 * rollout, **four reviewed pushes that changed no code** — three of them
 * successive edits to one roadmap item's prose — for $4.93 of $8.01.
 *
 * The predicate is `hasNoSubstantiveChange`, the same one `check pr` uses to
 * refuse a claimed branch that did no work and `pm ship` uses to refuse a merged
 * PR that did none. Three consumers now, one definition — this repo has spent
 * the day fixing bugs caused by the second copy of something.
 *
 * The trade is real and worth stating: the reviewer *did* find genuine problems
 * in item prose, including a claim that a file existed when it did not. This
 * gives that up to stop paying a dollar a push to re-read a paragraph. Prints a
 * reason either way so the skip is legible in the job log rather than silent.
 */
export interface NeededOptions {
    /** Body of the last review, when this is a re-review. */
    priorReview?: string;
}
export declare function needed(changedFiles: string[] | null, opts?: NeededOptions): {
    review: boolean;
    why: string;
};
/**
 * Prints `true` or `false` for the workflow to gate on. Always exits 0.
 *
 * `base` is the *previously reviewed* commit on a re-review, not the merge
 * base — so the question asked is "what has changed since anyone looked", which
 * is the one that decides whether looking again is worth it.
 */
export declare function reviewNeeded(base: string, priorReviewPath?: string, json?: boolean): number;
/** Verify that a reviewer run delivered a new, substantive tracking comment. */
export declare function reviewDelivery(beforeCommentId?: string, commentId?: string, bodyPath?: string): number;
