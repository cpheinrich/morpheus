/**
 * How the poll guard is wired into a project: a checked-in shim and one
 * PreToolUse entry, the same entry in `.claude/settings.json` and
 * `.codex/hooks.json` because both read Claude Code's hook schema and both
 * name the shell tool `Bash`. `morpheus context install` (and so `init`)
 * writes them; `doctor` reports a project without them.
 */
export declare const POLL_GUARD_SCRIPT = ".morpheus/poll-guard.sh";
export declare const POLL_GUARD_MARKER = "# morpheus:poll-guard:v1";
/**
 * The hook command, run before **every** Bash call.
 *
 * It finds the shim from the project directory Claude Code exports, then from
 * the working directory's Git toplevel, and otherwise does nothing — a bare
 * `sh .morpheus/poll-guard.sh` would fail after the agent `cd`s into a
 * subdirectory, and a failing PreToolUse hook prints an error on every
 * command for the rest of the session. `sh -c` keeps the syntax POSIX
 * whatever shell the provider runs hooks through.
 */
export declare const POLL_GUARD_COMMAND: string;
/** Seconds. A guard that could hang would stall every command it inspects. */
export declare const POLL_GUARD_TIMEOUT = 10;
export declare const pollGuardHookEntry: () => {
    matcher: string;
    hooks: {
        type: string;
        command: string;
        timeout: number;
    }[];
};
/**
 * The checked-in shim. A shell prefilter keeps the cost of the common case —
 * a command that is not a CI poll — to one `sh` and a `case`, with no Node
 * start. Only a candidate reaches `morpheus poll-guard`, and only its exit 2
 * becomes a refusal: a missing CLI, an older one without the command, or any
 * other failure allows the call, so a session never depends on the guard.
 */
export declare const pollGuardScript: () => string;
