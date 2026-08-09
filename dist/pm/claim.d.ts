/**
 * Claiming a roadmap item.
 *
 * The remote branch *is* the claim. Branch names already derive from the item
 * id, so making that load-bearing needs no new file, no new format, and no
 * shared service — the remote arbitrates across machines, and merging the PR
 * releases the claim by deleting the branch.
 *
 * Deliberately not an assignee field: anyone may point any agent at any item,
 * and ownership begins when work begins.
 */
export interface Claim {
    id: string;
    branch: string;
    /** Last committer on the branch, when it could be determined. */
    by?: string;
    /** ISO date of the last commit on the branch. */
    at?: string;
}
export declare class ClaimError extends Error {
}
/**
 * How to refresh remote-tracking refs before reading claims from them.
 *
 * **`--prune` is the load-bearing word.** Merging deletes the branch on origin,
 * but a plain fetch leaves the local `refs/remotes/origin/…` behind — so a
 * merged item keeps reading as claimed, forever, on every machine that ever
 * fetched it.
 *
 * One exported constant rather than the same array written twice, because it
 * already went wrong that way once: `reconcile` pruned and `listClaims` did not,
 * and the two disagreed about what was claimed while appearing to ask git the
 * same question. Same failure as the branch-id pattern that preceded this fix —
 * a second copy that drifts.
 */
export declare const FETCH_PRUNE: readonly ["fetch", "origin", "--prune", "--quiet"];
/** Branch prefix for an item: EV-014 -> ev-014- */
export declare function branchPrefix(id: string): string;
/**
 * The branch slug — the *same* function filenames use.
 *
 * These were two implementations with different rules: 40 characters cut
 * mid-word here, 64 at a word boundary there. The same item therefore got
 * `…-open-an-issue-and` on its branch and `…-may-open-a-pr-carrying` in its
 * filename, which is how the divergence was spotted. One function, one answer.
 */
export declare function slugify(title: string): string;
/** Remote branches that claim an item. Empty means the item is free. */
export declare function findClaims(id: string, cwd: string): Promise<string[]>;
/**
 * Sequence numbers already staked on the remote under an id prefix, or null
 * when origin could not be reached.
 *
 * Id allocation reads the item files on disk, which only hold ids that have
 * merged. An id another session claimed lives solely on its remote branch until
 * then, so allocation cannot see it and re-issues it — which it did, with
 * MO-038 held by a parallel session while local `main` stopped at MO-037.
 *
 * Null rather than an empty array on failure: "origin holds no claims" is
 * evidence, "origin was unreachable" is not, and collapsing them lets a network
 * blip render as a free id. Same reason `mergedPrs` returns null.
 *
 * @param idPrefix Everything before the digits, e.g. `MO-FR-` for a request or
 * `MO-G-2026-Q3-` for a goal — a goal's sequence restarts each period, so the
 * period is part of what identifies the run being counted.
 */
export declare function claimedNumbers(idPrefix: string, cwd: string): Promise<number[] | null>;
/**
 * Sequence numbers staked by `git ls-remote --heads` output.
 *
 * Split out from the lookup because the parsing is where this can quietly go
 * wrong — `mo-*` also matches the goal and request branches
 * (`mo-g-2026-q3-01-…`, `mo-fr-007-…`), and a roadmap allocation must not read
 * their numbers as its own. Requiring a digit immediately after the prefix is
 * what separates them: a roadmap allocation passes `MO-` and a goal branch's
 * next character is `g`, so it does not match.
 */
export declare function parseClaimedNumbers(lsRemote: string, idPrefix: string): number[];
/** Every live claim in the repo, newest activity first. */
export declare function listClaims(cwd: string): Promise<Claim[]>;
/**
 * Turn `for-each-ref` output into claims.
 *
 * Split out from the lookup for the same reason `parseClaimedNumbers` was: the
 * parsing is where this goes wrong, and it cannot be tested while it is welded
 * to a git call.
 *
 * It goes wrong *silently*, which is the part worth guarding. A branch this
 * fails to parse is not reported as unparseable — it is simply absent from the
 * result, and every caller reads absence as "no claim". `listClaims` carried a
 * private copy of the id pattern that MO-057 left behind, so under the current
 * scheme it returned an empty list from a remote full of claims.
 */
export declare function parseClaimRefs(forEachRefOutput: string): Claim[];
/** Whole days since an ISO timestamp. */
export declare function ageInDays(iso: string, now: Date): number;
export interface ClaimResult {
    id: string;
    branch: string;
    title: string;
    /** Items reconciled to shipped as a side effect of claiming. */
    shipped?: string[];
}
/**
 * Claim an item: verify nothing holds it, create the branch, mark the item
 * in-progress, and push immediately so the claim is visible to everyone else.
 */
export declare function claim(productDir: string, id: string, cwd: string): Promise<ClaimResult>;
