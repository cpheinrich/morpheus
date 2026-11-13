/**
 * The scaffold's `AGENTS.md` lines that a project cannot afford to lose.
 *
 * `morpheus init` writes the template once and never again, so a guidance
 * change in Morpheus reaches a consumer only when someone carries it there by
 * hand — and Evo's `AGENTS.md` never received the `wait-ci` line because its
 * rollout merged beside the change that introduced it. Nothing reported the
 * gap; agents there were simply never told. These anchors are what `doctor`
 * checks for, and a test holds the template (and Morpheus's own file) to them.
 *
 * Matched loosely — case, Markdown emphasis and line wrapping are ignored — so
 * a project may phrase the rule its own way. A missing anchor names the
 * guidance, not a line number, because the fix is to adopt the rule.
 */
export interface InstructionAnchor {
    /** Short name, as reported. */
    name: string;
    pattern: RegExp;
    /** What to carry over from the template. */
    add: string;
}
export declare const INSTRUCTION_ANCHORS: readonly InstructionAnchor[];
/** Emphasis, code spans and wrapping removed, so `**Break\nloops.**` still reads as `Break loops.`. */
export declare function normalizeInstructions(text: string): string;
export declare function missingInstructions(text: string, anchors?: readonly InstructionAnchor[]): InstructionAnchor[];
/**
 * Codex's default `project_doc_max_bytes`. Codex concatenates `AGENTS.md` files from the Git root
 * down to the directory it was launched in and stops at this many bytes in total, cutting the
 * file that crosses it mid-text (`codex-rs/core/src/agents_md.rs`). It is the one hard limit either
 * loader applies at this size: Claude Code loads a whole file up to 4 MiB and only advises
 * staying under 200 lines. This check estimates the cutoff for the root file at the default, not a session's configured limit.
 */
export declare const CODEX_PROJECT_DOC_MAX_BYTES: number;
export interface CodexTruncation {
    bytes: number;
    /** Bytes past the supplied budget. */
    lost: number;
    /** 1-based line holding the last byte Codex keeps. */
    line: number;
}
/** Null when the whole file fits, including at exactly the budget. */
export declare function codexTruncation(text: string, budget?: number): CodexTruncation | null;
