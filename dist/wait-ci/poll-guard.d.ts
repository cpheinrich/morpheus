/**
 * The PreToolUse poll guard: on the third `gh run view`, `gh run watch` or
 * `gh pr checks` of one target in one agent session, refuse the call and hand
 * back the single `morpheus wait-ci` command that replaces the loop.
 *
 * Instructions alone did not move the number: transcripts from 2026-09-24 to
 * 2026-10-28 show Claude sessions polling CI 4.6–7.8 times each *after*
 * `wait-ci` existed and `AGENTS.md` said "never poll", and `wait-ci` itself
 * almost never run. Each poll re-reads the whole conversation to learn
 * "still running". A refusal at the moment of the third poll, carrying the
 * exact replacement, is the cheapest point at which to change the behaviour.
 *
 * Two polls are allowed on purpose — a look before and after a push is not a
 * loop — and reading a log (`--log`, `--log-failed`) or opening the browser
 * is never counted, because that is how a failure is diagnosed, not awaited.
 */
/** The poll that is refused. The first `POLL_LIMIT - 1` are allowed. */
export declare const POLL_LIMIT = 3;
export interface PollTarget {
    /** What is being watched, independent of the flags used to look at it. */
    key: string;
    /** The poll as recognised, for the refusal. */
    display: string;
    /** The one wait that replaces the loop. */
    waitCommand: string;
    kind: "run" | "pr";
}
/**
 * A command line as simple commands, each a list of words with quotes
 * removed. Not a shell parser — enough to find `gh` in `a && gh …`,
 * `x=$(gh …)`, `while …; do gh …; done` and a quoted `--jq` argument, which
 * is where the polls in the transcripts sit.
 */
export declare function simpleCommands(command: string): string[][];
/** A value pasted into the suggested command, quoted only when the shell would otherwise split or expand it. */
export declare function shellWord(value: string): string;
/**
 * A heredoc's body is data — a note or a script being written — not commands
 * this call runs, so a `gh run view` line inside one is not a poll.
 */
export declare function withoutHeredocBodies(command: string): string;
/** Every CI poll in one command line, in order; a target polled twice in one line appears twice. */
export declare function pollTargets(command: string, cwd?: string): PollTarget[];
export interface GuardState {
    version: 1;
    sessionId: string;
    /** Allowed polls per {@link PollTarget.key}. */
    counts: Record<string, number>;
}
export type Decision = {
    allow: true;
    state: GuardState;
} | {
    allow: false;
    target: PollTarget;
    count: number;
};
/**
 * Count this call's polls and decide. A refused call did not run, so it is
 * not recorded: the next attempt at the same target is refused again, and a
 * second target named in the refused line keeps its count.
 */
export declare function decide(state: GuardState, targets: PollTarget[], limit?: number): Decision;
export declare function refusal(target: PollTarget, count: number): string;
/** The state file for one session, under the repository's ignored `local/sessions/`. */
export declare function statePath(root: string, sessionId: string): string;
export declare function parseState(raw: string | null, sessionId: string): GuardState;
export interface GuardDeps {
    /** The repository root whose `local/sessions/` holds the state; null outside a repository. */
    root: (cwd: string) => Promise<string | null>;
    read: (path: string) => Promise<string | null>;
    write: (path: string, data: string) => Promise<void>;
}
export interface GuardResult {
    /** 0 allows the call; 2 refuses it, which both Claude Code and Codex read as "block". */
    exitCode: 0 | 2;
    message?: string;
}
/**
 * One PreToolUse invocation. Anything it cannot read — no session id, no
 * repository, an unwritable state file — allows the call: the guard steers,
 * it must never be the reason a session cannot run a command.
 */
export declare function runPollGuard(input: string, deps: GuardDeps, fallbackCwd?: string): Promise<GuardResult>;
