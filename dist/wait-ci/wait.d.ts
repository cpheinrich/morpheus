/**
 * The impure half of `morpheus wait-ci`: one `gh` runner, one clock and one
 * sleep, all injected, so the loop's timing, SHA tracking and error handling
 * are tested with a scripted fake rather than against GitHub.
 */
export interface GhResult {
    code: number;
    stdout: string;
    stderr: string;
}
export type GhRunner = (args: string[]) => Promise<GhResult>;
export interface WaitDeps {
    gh: GhRunner;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
}
export interface WaitOptions {
    /** PR number, branch, or URL; the current branch's PR when absent. */
    target?: string;
    repo?: string;
    timeoutMs: number;
    requiredOnly: boolean;
}
export interface WaitResult {
    exitCode: number;
    output: string;
}
export declare const FIRST_DELAY_MS = 10000;
export declare const MAX_DELAY_MS = 60000;
export declare const BACKOFF = 1.5;
/** How long an empty check list is treated as "not created yet" before it is reported as no CI. */
export declare const NO_CHECKS_GRACE_MS: number;
/** Consecutive failed polls tolerated before giving up — one network blip must not end a 40-minute wait. */
export declare const MAX_POLL_ERRORS = 3;
/** Failed jobs whose logs are fetched; the rest are listed with their URL. */
export declare const MAX_LOGS = 5;
/** Log lines shared across all failed jobs, at most 60 each. */
export declare const LOG_BUDGET = 150;
/** The next sleep: geometric backoff, never past the cap or the deadline. */
export declare function nextDelay(previous: number | null, remainingMs: number): number;
/**
 * Wait for every check on a PR's head to finish, then digest the result.
 *
 * Prints nothing while waiting: the point is one tool call whose output is the
 * answer. A head that moves mid-wait is followed — the newest push is what the
 * caller needs a verdict on — and the move is named in the digest so results
 * from two commits are never presented as one.
 */
export declare function waitCi(deps: WaitDeps, opts: WaitOptions): Promise<WaitResult>;
