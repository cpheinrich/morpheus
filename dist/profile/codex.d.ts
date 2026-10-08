import type { ParsedSession } from "./claude.js";
import { type TokenTotals } from "./types.js";
export interface CodexParseOptions {
    file: string;
    roots?: string[];
    home?: string;
}
/**
 * OpenAI reports `input_tokens` inclusive of the cached part; Claude reports
 * them separately. Normalised here to Claude's split so the two providers sum.
 */
export declare function codexUsage(usage: unknown): TokenTotals;
/**
 * Streaming parser for one Codex rollout file. v1 reads what is reliably
 * present in current rollouts: `session_meta`, `turn_context` (model, effort),
 * `token_count` events, and completed items (commands, MCP calls, file
 * changes, collaboration calls). Older rollout formats yield a session row with
 * whatever of those they carry.
 */
export declare class CodexTranscript {
    private readonly options;
    private lineNo;
    private readonly issues;
    private readonly timestamps;
    private meta;
    private model;
    private effort;
    private readonly models;
    private readonly efforts;
    private readonly byModel;
    private readonly tokens;
    private lastTotal;
    private requests;
    private firstTurn;
    private readonly spans;
    private readonly busy;
    private turnCwd;
    constructor(options: CodexParseOptions);
    push(line: string): void;
    /**
     * `token_count` events repeat: the same cumulative total is re-emitted
     * around tool calls. A response is counted only when the cumulative total
     * moves, and its own `last_token_usage` is what is attributed to the model
     * and effort in force at that moment.
     */
    private tokenCount;
    private item;
    finish(): ParsedSession;
}
export declare function parseCodexTranscript(text: string, options: CodexParseOptions): ParsedSession;
