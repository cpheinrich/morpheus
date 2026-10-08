import { type ProfileIssue, type SessionRow, type SpanRow, type TokenTotals } from "./types.js";
/** What `<session>/subagents/agent-<id>.meta.json` says about a subagent transcript. */
export interface SubagentMeta {
    parentSessionId: string;
    agentId: string;
    agentType?: string | null;
    description?: string | null;
}
export interface ParseOptions {
    file: string;
    subagent?: SubagentMeta;
    /** Registered project paths, so subdirectories attribute to their repository. */
    roots?: string[];
    home?: string;
}
export interface ParsedSession {
    session: SessionRow | null;
    spans: SpanRow[];
    issues: ProfileIssue[];
}
export declare function claudeUsage(usage: unknown): TokenTotals;
/**
 * Streaming parser for one Claude Code transcript. Feed it lines with `push`,
 * then `finish`. Unparseable lines become issues; nothing throws.
 *
 * Claude Code writes one line per content block, so a single API response
 * spans several `assistant` lines sharing `message.id`, each repeating the
 * same `usage`. Usage is therefore counted once per message id — summing per
 * line would double or triple every token figure.
 */
export declare class ClaudeTranscript {
    private readonly options;
    private lineNo;
    private readonly issues;
    private readonly timestamps;
    private readonly requests;
    private readonly toolUses;
    private readonly results;
    private sessionId;
    private cwds;
    private branches;
    private sidechain;
    private cost;
    constructor(options: ParseOptions);
    push(line: string): void;
    private issue;
    private assistant;
    private user;
    finish(): ParsedSession;
}
/** Convenience for tests and small inputs: parse a whole transcript held in memory. */
export declare function parseClaudeTranscript(text: string, options: ParseOptions): ParsedSession;
