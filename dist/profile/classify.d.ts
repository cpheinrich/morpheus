import type { Phase } from "./types.js";
/**
 * Phase rules for shell commands, in priority order: the first rule that
 * matches *any* segment of a compound command wins. Priority, not position,
 * because `cd repo && pnpm test` is a check, and `git push && gh pr checks
 * --watch` is spent waiting on CI however it was spelled.
 *
 * Each rule is anchored to the start of a segment, after `cd`, environment
 * assignments and `pnpm`/`npx` runners are stripped — so `rg "pnpm test"` is a
 * search, not a check.
 */
export declare const COMMAND_RULES: ReadonlyArray<{
    phase: Phase;
    pattern: RegExp;
    why: string;
}>;
/** Split a shell command into the segments that each start a program. */
export declare function commandSegments(command: string): string[];
/**
 * The command as worth showing: leading `cd <dir> &&`, `export X=…;` and
 * `W=<path>;` prefixes removed, because in a worktree they are the same long
 * path on every call and would fill the whole truncated width.
 */
export declare function displayCommand(command: string): string;
export declare function classifyCommand(command: string): Phase;
/**
 * Classify one tool call. `input` is the tool's input object as recorded; only
 * the fields named here are read.
 */
export declare function classifyTool(tool: string, input: unknown): Phase;
/** Commands are recorded for timing analysis, so a prefix is enough and keeps payloads out. */
export declare const COMMAND_LIMIT = 120;
/**
 * Values that look like credentials are masked before a command is kept:
 * `FOO_TOKEN=…`, `--password …`, `Authorization: Bearer …`, and any long
 * unbroken key-shaped run. The command is evidence about time, not about
 * what was sent.
 */
export declare function redactCommand(command: string): string;
export declare function truncateCommand(command: string): string;
