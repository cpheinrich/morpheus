/**
 * A gap between two consecutive transcript events longer than this is counted
 * as this long and no longer. Five minutes is longer than any single model
 * turn we have seen without an intervening event, and shorter than the gaps
 * that mean a person walked away — so a session left open overnight reads as
 * its working time plus at most five minutes per pause, not as twelve hours.
 *
 * Gaps that fall entirely inside a running tool call are exempt: a twenty-
 * minute `gh pr checks --watch` writes nothing until it returns, and that wait
 * is precisely the cost this command exists to show.
 */
export declare const IDLE_THRESHOLD_MS: number;
/**
 * A tool result arriving later than this after its call is a session that was
 * left and resumed — a permission prompt answered the next morning, an MCP call
 * that outlived its client — not work. Such a span keeps its measured duration
 * in `extract` but is not treated as busy time, and `report` sets it aside as
 * an outlier. The longest legitimate calls seen in practice (a full Python test
 * suite, a CI watch) run well under it.
 */
export declare const MAX_CREDIBLE_SPAN_MS: number;
export declare function credible(durationMs: number | null): durationMs is number;
export interface Interval {
    start: number;
    end: number;
}
/**
 * Active time across sorted-or-unsorted event timestamps (epoch ms): the sum
 * of consecutive gaps, each capped at `idleMs` unless a busy interval covers
 * it entirely.
 *
 * Time inside a `waiting` interval — the agent blocked on a person answering
 * a question or a permission prompt — is never active, however short. It is
 * removed from each gap before the cap applies, so a two-minute wait for an
 * answer is not counted as two minutes of agent work.
 */
export declare function activeTime(timestamps: number[], busy?: Interval[], idleMs?: number, waiting?: Interval[]): number;
/** Milliseconds of [from, to] that merged, sorted `intervals` cover. */
export declare function overlap(intervals: Interval[], from: number, to: number): number;
export declare function deriveItem(...sources: Array<string | null | undefined>): string | null;
/**
 * The repository a working directory belongs to, by its directory name.
 * Worktree layouts are recognised first, because a worktree's own basename is
 * a task name, not a repository:
 *
 * - `<repo>/.claude/worktrees/<name>` and `<repo>/local/worktrees/<name>`
 * - `<anything>/.morpheus-worktrees/<repo>-<12 hex>/<item>-<rand>` (and `.morpheus/worktrees`)
 * - `<anything>/.<repo>-worktrees/<repo>-<task>` for other tools' sibling worktrees
 * - `~/.codex/worktrees/<hash>/<repo>`
 *
 * Then `roots` — registered project paths — so a subdirectory such as
 * `evo/apps/ios` is attributed to `evo`. Anything else is its basename.
 */
export declare function deriveRepo(cwd: string | null | undefined, roots?: string[], home?: string): string | null;
/** Nearest-rank percentile of an unsorted list; null for an empty one. */
export declare function percentile(values: number[], p: number): number | null;
