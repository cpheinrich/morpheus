import { type Phase, type SessionRow, type SpanRow, type TokenTotals } from "./types.js";
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
export interface Report {
    sessions: number;
    mainSessions: number;
    activeMs: number;
    wallMs: number;
    tokens: TokenTotals;
    costUSD: number;
    byPhase: PhaseLine[];
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
export declare function buildReport(sessions: SessionRow[], spans: SpanRow[]): Report;
export declare function formatDuration(ms: number): string;
export declare function formatTokens(n: number): string;
export declare function renderReport(r: Report, heading: string): string;
