/**
 * Read evidence: what a provider's tool hook saw this session read.
 *
 * `context refresh` used to be the agent's bare assertion that it had read
 * the records, and transcripts showed agents taking it without reading —
 * `cat … >/dev/null && morpheus context refresh`. A hook that runs after each
 * Read or shell call appends what the model was actually shown, and refresh
 * certifies a record only where that log covers it at the record's current
 * content.
 *
 * Deliberately node builtins only: this module sits on the hook's hot path,
 * which runs after every Read and shell call in every session.
 */
/** Per-worktree and gitignored, beside the lease — local observation, never a shared claim. */
export declare const READS_LOG: string;
/**
 * A run of matched lines counts only once it carries this much text. Blank
 * lines and `---` appear everywhere; a run that short says nothing about
 * which record was on screen. Records smaller than this need the whole record.
 */
export declare const MIN_RUN_CHARS = 16;
export type Provider = "claude" | "codex";
/** 1-based, inclusive. */
export interface Range {
    from: number;
    to: number;
}
export interface ReadEntry {
    v: 1;
    kind: "read";
    at: string;
    /** `sessionTag` of the provider session id — hashed, never the raw id. */
    session: string;
    /** The required record's id, worktree-relative (`.agent/decisions.md`). */
    record: string;
    /** `fingerprint()` of the whole record at the moment it was read. */
    fingerprint: string;
    from: number;
    to: number;
    /** The record's line count at that fingerprint. */
    lines: number;
    via: string;
}
/**
 * The hook ran in this session **and understood a tool result**. Refresh
 * enforces evidence only once this exists: a hook that is wired but untrusted
 * (Codex), added mid-session (Claude snapshots hooks at start) or unable to
 * parse a provider's payload must degrade to the old assertion with a warning,
 * never lock a session out.
 */
export interface LiveEntry {
    v: 1;
    kind: "live";
    at: string;
    session: string;
    provider: Provider;
}
export type EvidenceEntry = ReadEntry | LiveEntry;
export declare function sessionTag(id: string): string;
/**
 * Which provider session is running this process, from the environment each
 * provider exports to its shell tool. Claude Code sets `CLAUDECODE=1` and
 * `CLAUDE_CODE_SESSION_ID`; Codex sets `CODEX_THREAD_ID`. Null for a human
 * terminal or any other tool — refresh then falls back to the assertion.
 */
export declare function runnerSession(env?: NodeJS.ProcessEnv): {
    provider: Provider;
    tag: string;
} | null;
/** A record's lines as an editor numbers them: a trailing newline ends the last line. */
export declare function contentLines(text: string): string[];
/**
 * Parse the log, **counting** what could not be parsed rather than dropping it
 * in silence. A malformed line is missing evidence, which fails toward
 * refusing — but the refusal has to say the log was damaged, or the agent
 * re-reads a record whose evidence was there and unreadable.
 */
export declare function parseEvidence(text: string): {
    entries: EvidenceEntry[];
    malformed: number;
};
export declare function readEvidence(root: string): Promise<{
    entries: EvidenceEntry[];
    malformed: number;
}>;
/**
 * Append entries, pruning old ones once the log passes its cap. Appends are
 * single `write` calls well under the pipe-atomic size, so two hooks finishing
 * at once interleave whole lines rather than tearing one.
 */
export declare function appendEvidence(root: string, entries: readonly EvidenceEntry[], now?: Date): Promise<void>;
/** Sort and coalesce ranges, joining adjacent ones (`1–3` and `4–6` are `1–6`). */
export declare function mergeRanges(ranges: readonly Range[]): Range[];
/** What of `needed` is not inside `covered`. */
export declare function subtractRanges(needed: readonly Range[], covered: readonly Range[]): Range[];
export declare function formatRanges(ranges: readonly Range[]): string;
/**
 * Which of a record's lines appear, verbatim and in order, in text a tool
 * returned — credit by **content**, not by parsing the command.
 *
 * Parsing shell commands for `>/dev/null`, `| head`, `| wc` would be a guess
 * about what reached the model; the tool's own output is the answer. A
 * discarded or truncated read leaves nothing to match, so it earns nothing,
 * and `cat -n`/`grep -n` prefixes do not match either — conservative in the
 * direction that costs a re-read rather than a false certification.
 *
 * Runs start only at non-blank lines (blank lines repeat everywhere and would
 * make this quadratic) and then extend backwards over matching blank lines, so
 * a record's blank lines are still creditable as part of a real run.
 */
export declare function creditRuns(recordLines: readonly string[], outputLines: readonly string[]): Range[];
