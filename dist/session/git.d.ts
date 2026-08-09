/** `origin/main` unless a project says otherwise. */
export declare const DEFAULT_TRUNK = "origin/main";
export interface TrunkRef {
    remote: string;
    branch: string;
}
/**
 * What a trunk lookup found. Three answers, not two.
 *
 * `missing` and `unreachable` rode one `null` channel until a review caught
 * it, and the whole `fresh` verdict turns on this field: a repo whose default
 * branch is not `main`, or whose remote is not `origin`, was permanently
 * `unknown` — `pm claim` and `access sync` refused forever, with a message
 * blaming a network that was fine. The same declared-thing-that-does-not-exist
 * shape as a handle without an inbox, one layer down.
 */
export type TrunkObservation = {
    sha: string;
    reason?: undefined;
} | {
    sha: null;
    reason: "unreachable" | "missing";
};
export declare function parseTrunk(ref: string): TrunkRef;
/**
 * Which ref is this project's canonical trunk.
 *
 * A declared value wins, because `origin` is **not** always canonical: for a
 * fork contributor `origin` is their fork, which AGENTS.md already states in
 * the section on id allocation. Left hardcoded, a fork's `main` would sit
 * still while the real trunk moved and the lease would certify `fresh` — the
 * exact state the protocol exists to refuse, arriving with a ✓.
 *
 * Undeclared, `origin/HEAD` is asked before falling back, so a repo whose
 * default branch is `master` or `trunk` works without configuration.
 */
export declare function resolveTrunk(root: string, declared?: string): Promise<TrunkRef>;
/**
 * The tip of the trunk, straight from the remote.
 *
 * `ls-remote` rather than `rev-parse origin/main`, which reads a local ref
 * only as current as the last fetch — the exact "looks checked, is not"
 * failure the lease exists to catch.
 *
 * `--exit-code` is what separates the two failures: it exits 2 when no ref
 * matches, where a plain `ls-remote` exits 0 with empty output and is
 * indistinguishable from a dead network.
 */
export declare function trunkSha(root: string, trunk: TrunkRef): Promise<TrunkObservation>;
/**
 * What HEAD is on: a branch name, or the commit when detached.
 *
 * **`null` when the lookup failed**, which is not a name. `(detached)` was
 * both — `rev-parse --abbrev-ref HEAD` *succeeds* and prints the literal
 * `HEAD` when detached, so the sentinel only ever meant "the command failed",
 * and it was the one string that looked like an answer. Two failed lookups
 * then compared equal and the in-term short-circuit answered from a receipt
 * taken elsewhere: fail-open, in the one comparison added to fail closed.
 *
 * Detached resolves to the **commit**, because `HEAD` is the same string for
 * every commit — so `checkout <sha1>` then `checkout <sha2>` inside the term
 * would otherwise be the one branch change the comparison structurally cannot
 * see. `git worktree add ../wt <sha>` lands there directly.
 */
export declare function currentBranch(root: string): Promise<string | null>;
/**
 * The repository root of the *worktree* this process is in — not the common
 * git dir, which every worktree shares. Session identity is per-worktree, so
 * `--show-toplevel` is the right question.
 */
export declare function worktreeRoot(root: string): Promise<string>;
/**
 * What landed on the trunk between two SHAs, for a refresh to show rather
 * than merely assert. An agent told "the remote advanced" and nothing else
 * has to go looking; one `git log` is the difference between a prompt and an
 * answer.
 *
 * **`null` when the trunk could not be read, `[]` when the range is empty.**
 * The same split `doctor`'s `gitLines` was given, and for the same reason: the
 * fetch here transfers objects rather than doing one round trip, so it is what
 * hits the timeout after a day offline — and a caller that renders a failed
 * query as *"nothing on the trunk you do not have"* fails **open**, with the
 * most reassuring sentence available, in the branch added to stop a fail-open.
 */
export declare function trunkLog(root: string, trunk: TrunkRef, from: string, to: string): Promise<string[] | null>;
