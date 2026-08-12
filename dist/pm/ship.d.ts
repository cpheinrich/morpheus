export interface MergedPr {
    number: number;
    branch: string;
    /** Paths the PR changed, or null when the list could not be read. */
    files: string[] | null;
}
/**
 * Merged pull requests, or null when `gh` cannot answer.
 *
 * Null and empty mean very different things here — no PRs found is evidence,
 * `gh` being absent is not — so they must not collapse into the same value.
 */
export declare function mergedPrs(cwd: string): Promise<MergedPr[] | null>;
export type ShipOutcome = 
/** Marked shipped, with the PR that did it when one was found. */
{
    kind: "shipped";
    id: string;
    pr?: number;
}
/** Still claimed — the branch is on origin, so it has not merged. */
 | {
    kind: "open";
    id: string;
    branch: string;
}
/**
 * Merged, but the branch survived on origin — so it still reads as a live
 * claim and `pm claim` would refuse the item forever. Worth its own state:
 * a false claim is more damaging than a stale status, because it blocks
 * work rather than merely describing it wrongly.
 */
 | {
    kind: "stale";
    id: string;
    branch: string;
    pr: number;
}
/** No branch and no merged PR. Reported, never assumed. */
 | {
    kind: "unconfirmed";
    id: string;
}
/**
 * Backlog with a merged PR against its prefix. Reported without writing: the
 * item may have been reopened on purpose, and reconciliation cannot tell a
 * deliberate reopen from a status nobody updated.
 */
 | {
    kind: "reopened";
    id: string;
    pr: number;
}
/**
 * The merged PR changed nothing but records and board bookkeeping, so it did
 * not do this item's work. Reported without writing — this is the state that
 * marked MO-010 shipped against a PR that only moved the inbox.
 */
 | {
    kind: "no-work";
    id: string;
    pr: number;
    branch: string;
}
/**
 * Blocked with a merged PR against it. Reported without writing, for a
 * stronger reason than `reopened`: a merged PR on a blocked item is the
 * *expected* state, not evidence of completion. `pm block` records what is
 * outstanding in `needs:`, and `pm claim` deliberately leaves the branch on
 * origin so the partial work stays reachable. So the merged groundwork and
 * the unfinished item are both true at once, and only a human clearing
 * `needs:` can tell reconciliation which way to resolve it.
 */
 | {
    kind: "blocked";
    id: string;
    pr: number;
    needs?: string;
};
export interface ReconcileResult {
    outcomes: ShipOutcome[];
    /** True when `gh` was unavailable, so nothing could be confirmed. */
    blind: boolean;
}
/**
 * True when a merged PR demonstrably did not do its item's work.
 *
 * `check pr` blocks this before a merge, but a gate only covers what passes
 * through it — all three historical instances merged green because the rule did
 * not exist yet. This is the same predicate from the other side, which is why
 * it comes from `paths.ts` rather than being restated here.
 *
 * `files === null` means the list could not be read, which is not evidence of
 * anything. Shipping proceeds in that case: refusing on an unread list would
 * stall every reconcile the day `gh` renames a field, and the failure this
 * guards against needs positive evidence, not its absence.
 */
export declare function didNoWork(pr: MergedPr): boolean;
/** Rewrite one item's status, and record the PR when we know it. */
export declare function markShipped(productDir: string, id: string, pr?: number): Promise<void>;
/**
 * Move every merged `review` item to shipped.
 *
 * Confirms each one against a merged pull request whose head branch carries
 * the item's prefix. When `gh` is unavailable nothing is written — reporting
 * candidates is useful, but marking work shipped because a branch is missing
 * would let a hand-deleted branch quietly rewrite the roadmap.
 */
export declare function reconcile(productDir: string, cwd: string, opts?: {
    write: boolean;
}): Promise<ReconcileResult>;
export declare function formatReconcile(r: ReconcileResult): string;
