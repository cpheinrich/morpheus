/**
 * The session-start hook, as one literal.
 *
 * Claude Code and Codex read the same shape — `hooks.SessionStart[].hooks[]`
 * with a `type` and a `command` — from two different files, so the wiring is
 * one fact expressed twice rather than two designs. Keeping the literal here
 * rather than in `init/templates.ts` puts it beside the protocol it belongs
 * to; the scaffold imports it.
 *
 * The checked-in shim can detect a binary that predates `self` without asking
 * that binary to update itself. It only inspects; consented installation is a
 * separate bootstrap command.
 */
export declare const SESSION_START_COMMAND = "sh .morpheus/session-start.sh";
/**
 * The two files, byte-identical when neither exists yet.
 *
 * That is a coincidence of both tools converging on Claude Code's schema, not
 * a reason to write one file and symlink it: `.claude/settings.json` is a
 * whole settings document that also carries permissions, plugins and a theme,
 * while `.codex/hooks.json` holds hooks and nothing else. They diverge the
 * moment either project sets anything else.
 */
export declare const claudeSettingsFile: () => string;
export declare const codexHooksFile: () => string;
export declare const CLAUDE_SETTINGS = ".claude/settings.json";
export declare const CODEX_HOOKS = ".codex/hooks.json";
export declare const MANIFEST = "morpheus.json";
/**
 * `present` and `blocked` are the two that matter. Everything else is a
 * write that happened.
 */
export type Outcome = "created" | "updated" | "present" | "blocked";
export interface Repair {
    /** Repository-relative path. */
    target: string;
    outcome: Outcome;
    /** What was done, or why it could not be. Always populated. */
    detail: string;
}
export interface InstallOptions {
    /** `false` inspects and reports without touching the filesystem. */
    write: boolean;
    /** The inbox handle to declare. Looked up from `gh` when omitted. */
    handle?: string;
}
/**
 * Wire this project's session-start hooks and inbox declaration.
 *
 * Returns one `Repair` per target rather than a single verdict: two of the
 * three can be blocked for reasons the other two know nothing about, and a
 * command that collapsed them into "failed" would send someone looking at the
 * wrong file.
 */
export declare function installContext(root: string, opts: InstallOptions): Promise<Repair[]>;
