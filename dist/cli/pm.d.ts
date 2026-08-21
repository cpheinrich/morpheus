/** Validate every artifact under a product directory. Returns an exit code. */
export declare function validate(productDir: string): Promise<number>;
/** Retire legacy roadmap tables and regenerate the low-churn README indexes. */
export declare function index(productDir: string, check?: boolean): Promise<number>;
/** Create a new item and print its path. */
export declare function create(productDir: string, kind: string, title: string, opts: {
    priority?: string;
    goal?: string;
    slug?: string;
    issue?: string;
}, cwd: string): Promise<number>;
/** Add issue-closure intent to an item that already exists. */
export declare function linkIssue(productDir: string, id: string, rawIssue: string): Promise<number>;
/** Claim a roadmap item by staking its branch on the remote. */
export declare function claim(productDir: string, id: string, cwd: string): Promise<number>;
/**
 * List live claims, oldest activity flagged as possibly stale.
 *
 * Blocked claims are labelled rather than hidden. They hold a branch on
 * purpose — the partial work is on it — but reading them as active work is
 * exactly backwards: nothing moves them without an answer, and a claim that has
 * been sitting for nine days looks abandoned when it is in fact waiting.
 */
export declare function claims(productDir: string, cwd: string, staleDays?: number): Promise<number>;
/**
 * Records of blocked items that have not reached anyone yet — still in the
 * working tree, or committed and unpushed.
 *
 * **Both states, because both are invisible to whoever answers.** Only
 * checking the working tree missed the commonest route: `commitRecords`
 * committing and the push being rejected leaves a *clean* tree.
 *
 * Matching is deliberately narrow, and each part of it was a false report
 * first:
 *
 * - **Case-insensitive**, because `pm block` writes the worklog with
 *   `id.toLowerCase()` while the board holds the id uppercase.
 * - **An inbox counts only if its escalation has never reached a remote.**
 *   The inbox entry *is* the escalation and its path carries no id, so it
 *   cannot be matched by path — but neither "under `hq/team/`" nor "names a
 *   blocked id" narrows the right axis: `pm block` is what writes the id
 *   there, and the `❗` stays until the cycle archives it, which cannot happen
 *   while the item is blocked. Both reduce to *the inbox is dirty*, and fire
 *   on the routine cycle AGENTS.md mandates at the end of every session.
 *   The question is whether the pushed copy already carries the id.
 * - **`git log HEAD --not --remotes`, not `@{u}..HEAD`.** Two problems in
 *   one line. A two-dot *diff* is tree-to-tree, so a branch merely *behind*
 *   reported every upstream file as "on this machine only" — the same mistake
 *   `trunkChanges` was fixed for. And an upstream-relative range answers the
 *   wrong question: on a fresh branch with no upstream, records pushed long
 *   ago from `main` are not unsent. "In no remote" is the question, and it
 *   needs no upstream to ask.
 */
export interface UnsentRecords {
    paths: string[];
    /**
     * git could not be asked. The last place the `null`/`[]` split had not
     * reached, and once the tracked-modification path started working it became
     * the only remaining route to a silent report — in the check whose whole
     * purpose is that a dropped escalation cannot be silent.
     */
    unavailable: boolean;
}
export declare function unsentBlockRecords(cwd: string, blockedIds: string[], productDir: string): Promise<UnsentRecords>;
/**
 * Mark an item blocked, and commit the three records it writes.
 *
 * The git half lives here rather than in `pm/block.ts` so the writes stay
 * testable without a repository. Only the files it wrote are staged: `add -A`
 * would sweep whatever else is in the tree into a commit nobody intended, which
 * is the same reason `claim` stages explicitly.
 */
export interface BlockOutcome {
    code: number;
    /**
     * What this call wrote, with the content it read first, empty on every
     * failure path. The caller re-fingerprints these into its context receipt —
     * passing anything it did not write would have the receipt assert a record
     * was read that this session neither read nor wrote, and re-fingerprinting
     * without `before` would absorb a reply that landed inside the term.
     */
    written: {
        path: string;
        before: string | null;
    }[];
}
export declare function block(productDir: string, root: string, id: string, opts: {
    needs?: string;
    owner?: string;
    context?: string;
    push?: boolean;
}): Promise<BlockOutcome>;
/** Return a blocked item to in-progress. */
export declare function unblock(productDir: string, id: string): Promise<number>;
/**
 * Move merged items to shipped.
 *
 * With no id, reconciles every `review` item against merged pull requests.
 * With ids, marks those directly — the escape hatch for work that shipped
 * without a PR this tool can see.
 */
export declare function ship(productDir: string, ids: string[], cwd: string, check?: boolean): Promise<number>;
/**
 * Migrate integer roadmap ids to the dated scheme (MO-057).
 *
 * `--check` plans and reports without writing, which is how a repo confirms it
 * is already migrated. The order check runs in both modes and refuses rather
 * than warns: a board whose order silently changed is worse than one that was
 * not migrated.
 */
export declare function migrateIds(productDir: string, dryRun: boolean, repoRoot?: string): Promise<number>;
