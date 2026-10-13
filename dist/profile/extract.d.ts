import { type SubagentMeta } from "./claude.js";
import type { ProfileIssue, ProfileRow, SessionRow, SpanRow } from "./types.js";
export interface ExtractOptions {
    /** `YYYY-MM-DD`; sessions that started before local midnight of this day are skipped. */
    since?: string;
    /**
     * Substring of each session's derived repository name, case-insensitive. Not
     * matched against the path: every task worktree sits under
     * `.morpheus-worktrees/` and every scratchpad under a path naming its parent
     * project, so `--repo morpheus` would otherwise pull in all of them.
     */
    repo?: string;
    claudeDir?: string;
    codexDir?: string;
    roots?: string[];
    home?: string;
}
export interface Extraction {
    sessions: SessionRow[];
    spans: SpanRow[];
    issues: ProfileIssue[];
    files: number;
}
/** Parse `--since`. Returns null for a malformed date so the caller can refuse it. */
export declare function sinceMs(since: string | undefined): number | null | undefined;
interface ClaudeFile {
    path: string;
    subagent?: SubagentMeta;
}
/**
 * `~/.claude/projects/<encoded-cwd>/<session>.jsonl`, plus subagents at
 * `<encoded-cwd>/<session>/subagents/agent-<id>.jsonl` with a sibling
 * `.meta.json` naming the agent type and the description it was given.
 */
export declare function discoverClaude(root: string): Promise<{
    files: ClaudeFile[];
    issues: ProfileIssue[];
}>;
/**
 * Read every transcript under the two providers' directories and return
 * session and span rows. A file not modified since `since` cannot hold a
 * session that started after it, so it is skipped unread.
 */
export declare function extract(options?: ExtractOptions): Promise<Extraction>;
export declare function toJsonl(rows: ProfileRow[]): string;
export {};
