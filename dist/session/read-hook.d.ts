import { type EvidenceEntry } from "./evidence.js";
/**
 * The PostToolUse hook: append what this tool call showed the model of the
 * project's required records to `local/sessions/reads.jsonl`.
 *
 * It never prints and never fails the tool call — a hook error on every Read
 * would be noise in every session, and missing evidence already fails safe:
 * refresh asks for the read rather than certifying it.
 */
/**
 * Shell output past these sizes is not credited. Claude Code keeps ~30,000
 * characters of a large Bash result in `tool_response.stdout` while showing
 * the model a 2 KB persisted preview (measured in local transcripts: stdout
 * 29,620–29,984 characters beside previews of 1,326–2,396), so text near that
 * size is not evidence of anything the model saw. Codex truncates tool output
 * for the model on its own, smaller terms; its cap is lower and line-bounded.
 */
export declare const CLAUDE_TEXT_CAP_BYTES = 20000;
export declare const OTHER_TEXT_CAP_BYTES = 8000;
export declare const OTHER_TEXT_CAP_LINES = 200;
type Json = Record<string, unknown>;
interface FileRead {
    path: string;
    from: number;
    count: number;
    /** What the tool returned, when the payload carries it — checked against disk. */
    content?: string;
}
/**
 * Claude Code's Read result: `tool_response` is the tool's own output,
 * `{ type: "text", file: { filePath, content, startLine, numLines, totalLines } }`
 * — the same object transcripts record as `toolUseResult`. `content` is the raw
 * lines without numbering, so it can be compared to the file.
 */
export declare function fileRead(payload: Json): FileRead | null;
/**
 * Text a shell-like tool returned. Claude's Bash result is
 * `{ stdout, stderr, … }`; Codex's payload shape for its shell tools is not
 * documented, so the common spellings are accepted and anything else is
 * treated as not understood — which keeps the session on the old assertion
 * rather than refusing reads the hook could not see.
 */
export declare function outputText(response: unknown): string | null;
/**
 * The Morpheus checkout containing `start`, without spawning Git — this runs
 * after every tool call. A worktree's `.git` is a file and a main checkout's a
 * directory; either marks the root.
 *
 * Only a checkout that ignores `local/` qualifies. The log must never become an
 * untracked file in a repository that did not opt into local session state.
 */
export declare function projectRoot(start: string): Promise<string | null>;
/**
 * Handle one hook payload. Returns what it appended, per checkout, for tests;
 * the CLI discards it.
 */
export declare function recordRead(raw: string, now?: Date): Promise<Map<string, EvidenceEntry[]>>;
/** CLI entry: read the payload from stdin, record, and always exit 0. */
export declare function runReadHook(): Promise<number>;
export {};
