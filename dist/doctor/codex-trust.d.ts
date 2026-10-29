/**
 * The trust hash Codex computes for one command handler, or `null` when this
 * module does not reproduce it — an unknown event, a non-command handler, or a
 * field shape Codex would reject — so the caller reports "unverified" rather
 * than inventing a status.
 *
 * `JSON.stringify` matches `serde_json`'s compact output here: both escape only
 * `"`, `\` and control characters, with the same short forms and lowercase
 * `\u00xx`, and neither escapes `/` or non-ASCII.
 */
export declare function codexHookHash(event: string, matcher: unknown, handler: unknown, platform?: NodeJS.Platform): string | null;
export type HookTrust = "trusted" | "modified" | "untrusted" | "disabled" | "unverified";
export interface CodexHook {
    /** `hooks.json` event key, e.g. `PostToolUse`. */
    event: string;
    group: number;
    handler: number;
    /** The `hooks.state` key Codex looks up. */
    key: string;
    hash: string | null;
    command: string | null;
}
export interface TrustedHook extends CodexHook {
    trust: HookTrust;
}
/**
 * Every handler in a parsed `hooks.json`, keyed as Codex keys it. Indices are
 * positional over the raw arrays, as in Codex: a group or handler it skips
 * still consumes its index.
 */
export declare function listCodexHooks(document: unknown, sourcePath: string, platform?: NodeJS.Platform): {
    hooks: CodexHook[];
    problem?: string;
};
interface HookState {
    trustedHash?: string;
    enabled?: boolean;
}
export type CodexState = {
    kind: "absent";
} | {
    kind: "unusable";
    path: string;
    why: string;
} | {
    kind: "ok";
    path: string;
    hookState: Map<string, HookState>;
    projects: Map<string, string>;
};
export declare function codexHome(env?: NodeJS.ProcessEnv): string;
/**
 * Read `config.toml`'s `hooks.state` and `projects` tables. **Read-only.**
 *
 * A file that cannot be parsed is `unusable`, never an empty state: reading it
 * as "nothing trusted" would tell the user to re-trust hooks that already run,
 * which is the answer-shaped failure `learned.md` warns about.
 */
export declare function readCodexState(home: string): Promise<CodexState>;
export declare function trustOf(hook: CodexHook, state: Map<string, HookState>): HookTrust;
export interface HooksLocation {
    /** This checkout's root. */
    checkout: string;
    /** The main checkout, where Codex reads hooks and where `/hooks` must be run. */
    main: string;
    linkedWorktree: boolean;
}
/** Where Codex reads this checkout's project hooks from. */
export declare function codexHooksLocation(root: string): Promise<HooksLocation>;
export interface CodexTrustReport {
    /** `no-codex`: no Codex home on this machine, so nothing to report. */
    kind: "no-codex" | "no-hooks" | "unknown" | "checked";
    location?: HooksLocation;
    hooksPath?: string;
    /** Why trust could not be determined (`unknown`). */
    why?: string;
    /** Codex's project trust for the checkout; untrusted projects load no hooks at all. */
    projectTrusted?: boolean;
    hooks?: TrustedHook[];
    /** In a linked worktree: this checkout's own hooks differ from what Codex runs. */
    worktreeDiffers?: boolean;
}
export declare function codexTrustReport(root: string, home?: string): Promise<CodexTrustReport>;
/** A hook as a person scanning `/hooks` would recognise it. */
export declare function describeHook(hook: CodexHook): string;
export interface TrustFinding {
    severity: "warning";
    check: "codex-trust";
    message: string;
}
/** `doctor` findings for a report; none when every hook Codex reads is trusted. */
export declare function codexTrustFindings(report: CodexTrustReport): TrustFinding[];
export {};
