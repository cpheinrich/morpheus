import { type GhRunner, type GuardDeps } from "../wait-ci/index.js";
export declare const DEFAULT_TIMEOUT = "45m";
export interface WaitCiFlags {
    target?: string;
    extra: string[];
    repo?: string;
    timeout?: string;
    requiredOnly: boolean;
    run?: string;
    workflow?: string;
    branch?: string;
    sha?: string;
}
/** `gh` as a child process that never throws: a non-zero exit is data the loop decides about. */
export declare const ghRunner: GhRunner;
/**
 * The combinations that are a mistake rather than a request. Each mode has
 * one way to name what it waits for; a second one silently ignored would
 * wait on something other than what was typed.
 */
export declare function usageError(flags: WaitCiFlags): string | null;
/** `morpheus wait-ci` — block once on a PR's checks, or on one workflow run, and print the digest. */
export declare function waitCiCommand(flags: WaitCiFlags, gh?: GhRunner): Promise<number>;
/**
 * The checkout whose `local/sessions/` keeps the state: the primary one, not
 * the task worktree the agent is in. `pm cleanup` refuses to remove a worktree
 * holding any ignored file other than its own lease, so state written there
 * would turn every finished task into a manual cleanup — and a session that
 * moves between worktrees of one repository is still one session.
 */
export declare function guardRoot(cwd: string): Promise<string | null>;
export declare const guardDeps: GuardDeps;
/**
 * `morpheus poll-guard` — the PreToolUse hook's decision, reading the hook
 * payload on stdin. Exit 2 with the reason on stderr refuses the call; every
 * other path exits 0.
 */
export declare function pollGuardCommand(read?: () => Promise<string>, deps?: GuardDeps): Promise<number>;
