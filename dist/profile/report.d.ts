import { type Phase, type ProfileIssue, type SessionRow, type SessionSource, type SpanRow, type TokenTotals } from "./types.js";
export interface PhaseLine {
    phase: Phase;
    calls: number;
    mainMs: number;
    sidechainMs: number;
    tokens: number;
    outputTokens: number;
}
export interface GroupLine {
    key: string;
    sessions: number;
    activeMs: number;
    tokens: TokenTotals;
    costUSD: number;
}
export interface ModelLine {
    model: string;
    effort: string;
    requests: number;
    tokens: TokenTotals;
    /** Active time of sessions whose most-used model×effort this is. */
    activeMs: number;
}
export interface CommandLine {
    command: string;
    calls: number;
    totalMs: number;
    maxMs: number;
    phase: Phase;
}
export interface SourceLine {
    source: SessionSource;
    sessions: number;
    mainSessions: number;
}
export interface Report {
    sessions: number;
    mainSessions: number;
    /** Where the sessions were read from, every source listed even when empty. */
    bySource: SourceLine[];
    /** Codex sessions found in more than one file and counted once; see `Extraction.duplicates`. */
    duplicates: number;
    activeMs: number;
    wallMs: number;
    tokens: TokenTotals;
    costUSD: number;
    byPhase: PhaseLine[];
    byProvider: GroupLine[];
    byRepo: GroupLine[];
    byRole: GroupLine[];
    byModel: ModelLine[];
    firstTurn: Array<{
        provider: string;
        sessions: number;
        p50: number | null;
        p90: number | null;
        max: number | null;
    }>;
    slowest: Array<{
        command: string;
        durationMs: number;
        phase: Phase;
        repo: string | null;
        start: string;
    }>;
    repeated: CommandLine[];
    sidechainShare: {
        activeTime: number;
        tokens: number;
    };
    /** Spans longer than `MAX_CREDIBLE_SPAN_MS`, left out of every time figure. */
    outliers: Array<{
        tool: string;
        durationMs: number;
        repo: string | null;
        start: string;
    }>;
}
export declare const TOP_N = 10;
/**
 * Group key for "repeated commands": the command with its leading `cd …`
 * and environment assignments removed, so the same check run from two
 * worktrees counts as one command.
 */
export declare function commandKey(command: string): string;
export declare function buildReport(sessions: SessionRow[], spans: SpanRow[], options?: {
    duplicates?: number;
}): Report;
export declare function formatDuration(ms: number): string;
export declare function formatTokens(n: number): string;
export declare function renderReport(r: Report, heading: string): string;
/**
 * The skipped lines and files, grouped by what was wrong, naming the files. A bare count such as
 * "3 × unparseable JSON" cannot be acted on: which transcript, and which line, is the diagnosis.
 * The home directory is shortened to `~`; at most `maxFiles` files are named per message.
 */
export declare function summarizeIssues(issues: ProfileIssue[], options?: {
    home?: string;
    maxFiles?: number;
}): string[];
