import { type QuotaSnapshot } from "./schema.js";
export declare const CLAUDE_USAGE_SOURCE = "Claude Code get_usage";
/**
 * Builds whose `get_usage` freshness code was read: a snapshot younger than 60 s answers without asking the
 * endpoint, and a failed fetch falls back to a "seeded" answer up to one hour old with `limits` stripped.
 * The reply carries no fetch time, so add a build only after re-reading that code (docs/cd-v2-claude-executor.md).
 */
export declare const CLAUDE_CODE_ANALYSED_VERSIONS: readonly string[];
export declare const CLAUDE_PLAN_NAMES: Readonly<{
    pro: "Claude Pro";
    max: "Claude Max";
}>;
export interface ClaudeAccount {
    email: string;
    subscription: keyof typeof CLAUDE_PLAN_NAMES;
}
/** Strip every variable that could route Claude Code to another credential, provider or endpoint. */
export declare function claudeEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
/** No MCP servers or connectors, and no user, project or local settings (hooks, plugins, env blocks, key helpers). */
export declare const CLAUDE_ISOLATION_ARGS: readonly string[];
export declare function claudeModelFamily(model: string): string | undefined;
/** Coarse pre-claim check on `claude auth status --json`. It cannot see a key injected through a settings file. */
export declare function verifyClaudeLogin(stdout: string, account: ClaudeAccount): void;
/**
 * Authoritative in-process binding from the `initialize` control reply: an analysed build, the bound account and
 * plan, first-party, and no API key or token source. Returns a fixed reason, or undefined when the session is bound.
 */
export declare function claudeSessionProblem(reply: unknown, account: ClaudeAccount): string | undefined;
/**
 * Validate one `get_usage` reply from an analysed build. Windows come from the server's own `limits[]` list:
 * every entry not scoped to another model, and the configured family's weekly entry, which must exist.
 */
export declare function normalizeClaudeUsage(reply: unknown, account: ClaudeAccount, model: string, observedAt: string): QuotaSnapshot;
/** One fresh read through the CLI's own sign-in, under the existing private-group reader supervisor. No model turn. */
export declare function claudeQuota(command: string[], account: ClaudeAccount, model: string, environment: NodeJS.ProcessEnv, observedAt: string): Promise<QuotaSnapshot>;
