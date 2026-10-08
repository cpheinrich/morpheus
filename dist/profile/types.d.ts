/**
 * Row shapes for `morpheus profile`. One `session` row per transcript (a
 * subagent is its own session with a `parentSessionId`), one `span` row per
 * tool call. Everything here is derived from transcripts already on disk; no
 * field is self-reported by an agent.
 */
export type Provider = "claude" | "codex";
export declare const PHASES: readonly ["context", "checks", "ci-wait", "wait", "review", "git", "gh", "build", "browser", "simulator", "subagent", "read/search", "edit", "other"];
export type Phase = (typeof PHASES)[number];
/** Who a session was working for. A reviewer is a subagent whose job is review. */
export type Role = "main" | "subagent" | "reviewer";
export interface TokenTotals {
    /** Uncached input. */
    input: number;
    cacheRead: number;
    cacheCreation: number;
    /** Includes thinking/reasoning tokens, which both providers bill as output. */
    output: number;
    /** The thinking/reasoning subset of `output`, where the provider reports it. */
    thinking: number;
}
export interface ModelUsage {
    model: string;
    effort: string | null;
    requests: number;
    tokens: TokenTotals;
}
export interface SessionRow {
    kind: "session";
    provider: Provider;
    sessionId: string;
    parentSessionId: string | null;
    isSidechain: boolean;
    role: Role;
    /** Subagent type or nickname, when the transcript records one. */
    agentType: string | null;
    cwd: string | null;
    repo: string | null;
    branch: string | null;
    /** Roadmap item id, `MO-26-10-07-20.37.19`, from the branch or the worktree path. */
    item: string | null;
    models: string[];
    efforts: string[];
    start: string | null;
    end: string | null;
    wallMs: number;
    activeMs: number;
    requests: number;
    toolCalls: number;
    tokens: TokenTotals;
    /** Context size of the first model request: what a session pays before it has done anything. */
    firstTurnContextTokens: number | null;
    byModel: ModelUsage[];
    /** Claude's own `cost-state` line, when present. Codex records none. */
    costUSD: number | null;
    file: string;
}
export interface SpanRow {
    kind: "span";
    provider: Provider;
    sessionId: string;
    isSidechain: boolean;
    role: Role;
    repo: string | null;
    tool: string;
    phase: Phase;
    start: string;
    durationMs: number | null;
    /** Bash/exec command, truncated — never output, file contents or prompts. */
    command: string | null;
    /** Launched in the background, so `durationMs` is the launch, not the work. */
    background: boolean;
    /** Share of the issuing request's tokens, split across the tool calls it made. */
    inputTokens: number | null;
    outputTokens: number | null;
}
export type ProfileRow = SessionRow | SpanRow;
/** A line or file that could not be read. Reported, never thrown. */
export interface ProfileIssue {
    file: string;
    line: number | null;
    message: string;
}
export declare function emptyTokens(): TokenTotals;
export declare function addTokens(into: TokenTotals, from: TokenTotals): void;
export declare function totalTokens(t: TokenTotals): number;
