import { type Reach } from "../session/gate.js";
/**
 * Take a receipt, and **show the delta rather than just recording it**.
 *
 * A refresh that silently certifies is a refresh an agent can satisfy without
 * reading anything. Printing what moved — the records by name, and the trunk
 * commits by subject — means the command that certifies is also the command
 * that tells you what you missed.
 */
/**
 * `offline` reaches the *read* below and never the receipt: a refresh is
 * user-initiated and exists precisely to certify, so it has nothing to gain
 * from not asking.
 */
export declare function refresh(root: string, offline?: boolean): Promise<number>;
/** Exit non-zero when context is not fresh. For hooks and scripts. */
export declare function check(root: string, offline?: boolean): Promise<number>;
export declare function status(root: string, offline?: boolean): Promise<number>;
/**
 * The session-start message, injected into a new session's context by a hook.
 *
 * **Entirely local.** It makes no network call, so it takes no `offline`
 * argument: everything it prints comes from `localDelta`, which is computed
 * from the records alone. That matters because it runs from a hook at the
 * start of every session — a round trip here is bought for nothing, and on a
 * slow link its timeout would sit in front of the session.
 *
 * **Not read-only.** It discards the stored receipt, which is what makes the
 * lease session-scoped — so it belongs in a session-start hook and nowhere
 * else. Running it by hand mid-session costs one `context refresh`.
 *
 * **Always exits 0**, and that is the point rather than convenience. A hook
 * written as `morpheus context status || true` swallows a missing binary
 * exactly the way it swallows a stale lease — the check that skips what is
 * absent and reports the empty thing as correct. Exiting 0 deliberately, from
 * a command whose job is to inform, keeps the masking out of the shell.
 *
 * It does **not** take a receipt. At session start the agent has read nothing,
 * so a receipt minted here would certify the records were loaded by the act of
 * not loading them.
 */
export declare function brief(root: string): Promise<number>;
export interface Guarded {
    /** Non-null is the caller's exit code. */
    refused: number | null;
    /**
     * The offline exception was actually applied — an `unknown` observation and
     * a declaration, not just a declaration. Commands that degrade rather than
     * refuse read this.
     */
    contained: boolean;
}
/**
 * Enforce the gate for a governed command, or explain why not.
 *
 * Returned as a record so `refused` has to be destructured and checked;
 * ignoring it is a type error rather than a silently open gate.
 */
export declare function guard(root: string, action: string, reach: Reach, offline?: boolean): Promise<Guarded>;
