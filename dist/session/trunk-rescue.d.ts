/**
 * Over this many missing trunk commits, or this many days since the oldest of
 * them landed, a behind checkout stops being "a session that has not pulled
 * yet" and becomes a stuck one. Twenty commits is a busy day across this
 * fleet; three days is longer than any healthy checkout goes without a
 * session-start fetch. Lakina's incident was 188 commits and 23 days, so
 * either threshold alone would have fired within the first week.
 */
export declare const STALE_BEHIND_COMMITS = 20;
export declare const STALE_BEHIND_DAYS = 3;
export interface TrunkDirt {
    /** Staged or unstaged modifications, deletions, renames and additions to the index. */
    tracked: string[];
    /** Untracked, non-ignored files. */
    untracked: string[];
}
/**
 * Parse `git status --porcelain=v1`, with or without `-z`.
 *
 * Every entry is either tracked or untracked: an entry this cannot read is
 * counted as tracked rather than skipped, so a parse failure blocks the
 * fast-forward visibly instead of reading as a clean checkout.
 */
export declare function parsePorcelain(raw: string, nul?: boolean): TrunkDirt;
/**
 * Where `dist/<path>` would have been compiled from, or `null` when the path
 * is not recognisable build output. `tsc -p tsconfig.build.json` maps
 * `src/x/y.ts` to `dist/x/y.{js,d.ts,js.map,d.ts.map}`.
 */
export declare function buildSourceCandidates(path: string): string[] | null;
/**
 * Untracked build output whose source no longer exists — the shape that
 * blocked `morpheus self install` on a checkout that had compiled modules
 * later deleted. Safe to delete; reported, never deleted here.
 */
export declare function orphanBuildOutputs(root: string, untracked: string[], exists?: (path: string) => Promise<boolean>): Promise<string[]>;
export interface Lag {
    behind: number;
    /** ISO commit date of the oldest trunk commit this checkout lacks. */
    oldest: string | null;
}
export type LagSeverity = "current" | "behind" | "stale";
/** `stale` once either threshold is crossed; `behind` otherwise; `current` at zero. */
export declare function lagSeverity(lag: Lag, now: Date): LagSeverity;
export declare function lagDays(lag: Lag, now: Date): number | null;
export declare function measureLag(root: string, target: string): Promise<Lag>;
/** A merge, rebase, cherry-pick, revert or bisect in progress — never rescued mid-operation. */
export declare function operationInProgress(root: string): Promise<string | null>;
export declare function readDirt(root: string): Promise<TrunkDirt>;
/** `wip/trunk-YYYY-MM-DD-<host>`, suffixed `-2`, `-3`… past any name already taken. */
export declare function wipBranchName(date: string, host: string, taken: ReadonlySet<string>): string;
/** Pacific, like roadmap ids, so two machines name the same day the same way. */
export declare function pacificDate(now: Date): string;
export declare function shortHost(raw: string): string;
export interface CommandResult {
    code: number;
    stdout: string;
    stderr: string;
}
export type CommandRunner = (command: string, args: string[], cwd: string) => Promise<CommandResult>;
export interface RescueDeps {
    /** Runs `gh`; injectable so tests never reach GitHub. */
    runner?: CommandRunner;
    hostname?: string;
    now?: Date;
    /** The remote the WIP branch is pushed to. Defaults to `origin`. */
    pushRemote?: string;
}
export interface TrunkTarget {
    /** e.g. `origin/main`, for messages. */
    trunk: string;
    /** e.g. `main`. */
    branch: string;
    /** The fetched trunk commit. */
    sha: string;
}
export type RescueResult = {
    outcome: "clean";
    dirt: TrunkDirt;
    orphans: string[];
} | {
    outcome: "skipped";
    reason: string;
    dirt: TrunkDirt;
    orphans: string[];
} | {
    outcome: "rescued";
    dirt: TrunkDirt;
    orphans: string[];
    wipBranch: string;
    commit: string;
    /** The remote the branch was (or was to be) pushed to. */
    remote: string;
    pushed: boolean;
    pushError?: string;
    prUrl?: string;
    prError?: string;
    lag: Lag;
};
export declare function rescuePrBody(input: {
    root: string;
    host: string;
    date: string;
    trunk: string;
    lag: Lag;
    ahead: number;
    diffstat: string;
    tracked: string[];
    untracked: string[];
    orphans: string[];
    now: Date;
}): string;
/**
 * Paths whose staged content differs from both HEAD and the working tree
 * (`MM`, `AM`, `AD`, `RM`…). Committing the working tree would drop the
 * staged version, so these are refused rather than silently flattened.
 */
export declare function divergentStaged(raw: string): string[];
/**
 * The one file a human edits by hand to reply to agents. A reply typed on a
 * trunk checkout must reach the session that starts there to read it, so its
 * presence stops the rescue instead of moving it to a draft PR.
 */
export declare const HUMAN_RECORDS = "hq/team/";
/** `owner/repo` from a GitHub remote URL, or null. */
export declare function githubRepo(url: string): string | null;
/**
 * Move tracked edits on the trunk branch to a WIP branch, reset the checkout
 * to its own HEAD, then push and open a draft pull request. Does not
 * fast-forward; the caller does that once this returns.
 *
 * Everything between proving the commit and resetting is local and fast. The
 * network (push, `gh`) comes after the reset, so a write landing during it —
 * an IDE autosave, Xcode regenerating the project file — lands on the reset
 * tree and survives, instead of being reset away unrecorded.
 */
export declare function rescueDirtyTrunk(root: string, target: TrunkTarget, deps?: RescueDeps): Promise<RescueResult>;
/** The one-line-plus-detail report `context brief` prints after a rescue attempt. */
export declare function formatRescue(result: RescueResult, trunk: string): string[];
/** Prominent lag warning for a checkout still behind after startup. */
export declare function formatLag(lag: Lag, trunk: string, now: Date): string[];
export declare const shellQuote: (s: string) => string;
