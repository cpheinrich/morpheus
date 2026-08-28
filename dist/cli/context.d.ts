import { type Reach } from "../session/gate.js";
import { type MorpheusInstallStatus } from "../self.js";
import { type AutoUpdatePreference } from "../self-auto-update.js";
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
 * The project-context half is entirely local. One bounded `ls-remote` also
 * checks the installed Morpheus commit: this hook is the one device-wide
 * chokepoint that reaches every project and is where CLI drift can be noticed
 * before a local generator disagrees with canonical CI. An explicit offline
 * declaration skips that check and prints no stale claim.
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
export interface BriefOptions {
    offline?: boolean;
    morpheus?: MorpheusInstallStatus;
    autoUpdatePreference?: AutoUpdatePreference;
}
export declare function brief(root: string, opts?: BriefOptions): Promise<number>;
/**
 * Wire the session-start hooks and the inbox declaration, or say why not.
 *
 * The counterpart to `brief`: that command runs *because* this one has been
 * run. `morpheus init` writes the same wiring into a new project, and nothing
 * carried it into a project that already existed — so this is the repair path,
 * idempotent, and the one to reach for on an established repository.
 *
 * `--check` reports without writing, for CI and for `doctor`'s
 * recommendation to be worth making.
 */
export declare function install(root: string, opts: {
    check: boolean;
    handle?: string;
}): Promise<number>;
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
