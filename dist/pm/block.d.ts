/**
 * Blocking an item: the third exit.
 *
 * An agent that can only finish or fail will, on meeting real ambiguity, take
 * the worse of the two — it guesses, and ships something plausible. Escalating
 * is cheap and shipping half-baked is expensive, and that asymmetry has to be
 * structural, because advice loses to momentum.
 *
 * Three records, because each answers a different question later: the **item**
 * says the work is stopped and why (read by the board and the heartbeat), the
 * **worklog** says what was attempted before stopping (read by a human picking
 * it up), and the **inbox** puts the question in front of the person who can
 * answer it. Writing only the first is how a blocker becomes invisible.
 *
 * Git is deliberately not done here. `claim` commits because the branch *is*
 * the claim; for blocking, version control is incidental, and keeping it out
 * makes this testable against a temp directory rather than a repo.
 */
export declare class BlockError extends Error {
}
export interface BlockOptions {
    productDir: string;
    /** Repo root — worklog and inbox are resolved from it. */
    root: string;
    id: string;
    /** What would actually unblock this. */
    needs: string;
    /** Inbox owner, by GitHub handle. */
    owner: string;
    agent?: "claude" | "codex" | "human";
    /** Free prose: what was attempted before stopping. */
    context?: string;
}
export interface BlockResult {
    id: string;
    title: string;
    /** Files written, repo-relative-ish absolute paths, in write order. */
    written: string[];
    /**
     * The inbox as it was **immediately before** this call appended to it, or
     * null if it did not exist. The caller re-fingerprints the record into its
     * context receipt, and may only do so when this still matches what the
     * receipt asserts — otherwise a reply that landed inside the term would be
     * absorbed and the evidence of it lost.
     */
    inboxBefore: string | null;
    /** True when the person had no inbox and one was created. */
    inboxCreated: boolean;
    /** Explicit because generated files may be appended after it in `written`. */
    inboxPath: string;
    /** True when this call repaired or replaced a block that already existed. */
    alreadyBlocked: boolean;
    /** Validation problems that prevented a safe index refresh. */
    indexIssues: string[];
}
/**
 * Mark an item blocked and route the question to its owner.
 *
 * The claim is deliberately **not** released. The partial work lives on that
 * branch, so re-taking the item means checking it out rather than starting
 * again — but a blocked claim holds no lane in the heartbeat's ceiling, or one
 * unanswered question would consume a slot forever.
 */
export declare function block(opts: BlockOptions): Promise<BlockResult>;
export interface UnblockResult {
    id: string;
    title: string;
    path: string;
}
/**
 * Return a blocked item to `in-progress` and clear its `needs`.
 *
 * `needs` is removed rather than kept for history — a stale need reads as
 * current, which is worse than never having written one. The worklog entry is
 * the history, and it stays.
 */
export declare function unblock(productDir: string, id: string): Promise<UnblockResult>;
