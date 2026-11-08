import { CONTEXT_MCP_PREFIX } from "../context-search/output.js";
import { percentile } from "./derive.js";
import { totalTokens } from "./types.js";
const CONTEXT_CLI = /\bmorpheus\s+context\s+(?:search|task-read)\b/;
export function contextUsage(sessions, spans) {
    const key = (row) => row.provider + ":" + row.sessionId;
    const usage = new Map();
    for (const span of spans) {
        const mcp = span.tool === CONTEXT_MCP_PREFIX + "search_project_context" || span.tool === CONTEXT_MCP_PREFIX + "read_project_record";
        const cli = span.command !== null && CONTEXT_CLI.test(span.command);
        if (!mcp && !cli)
            continue;
        const id = key(span);
        usage.set(id, (usage.get(id) ?? 0) | (mcp ? 1 : 2));
    }
    return ["mcp", "cli", "both"].map((transport, index) => {
        const cohort = sessions.filter(session => !session.isSidechain && usage.get(key(session)) === index + 1);
        return {
            transport, sessions: cohort.length,
            activeMsP50: percentile(cohort.map(session => session.activeMs), 50),
            requestsP50: percentile(cohort.map(session => session.requests), 50),
            tokensP50: percentile(cohort.map(session => totalTokens(session.tokens)), 50),
        };
    }).filter(cohort => cohort.sessions > 0);
}
//# sourceMappingURL=context-usage.js.map