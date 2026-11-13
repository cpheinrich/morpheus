import { searchContext } from "./engine.js";
import { withContextSearchCache } from "./local-state.js";
import { contextArm, getSearchConfig, traceContext } from "./rollout.js";
import { MCP_EXCERPT_BYTES, MCP_EXCERPT_LINES } from "./output.js";
import { contextKind, discoverSources, readContextSources } from "./sources.js";
export async function retrieveContext(root, query, budget, options) {
    const { session, transport, kinds, started = performance.now(), mcpStartedAt } = options;
    if (!query.trim() || !Number.isInteger(budget) || budget < 1 || budget > 2500) {
        throw new Error("Use a nonempty query and a return budget from 1 to 2,500 tokens.");
    }
    const config = await getSearchConfig(root);
    const arm = await contextArm(root, session, config);
    const trace = { queryStartedAt: performance.timeOrigin + started, mcpStartedAt, arm: arm.arm, engine: arm.engine, session: arm.session, rollout: arm.id, transport, operation: "search" };
    try {
        const coverage = await discoverSources(root, config);
        const eligible = kinds?.length ? coverage.included.filter(path => kinds.includes(contextKind(path))) : coverage.included;
        const sources = await readContextSources(root, eligible);
        const caps = transport === "mcp" ? { maxBytes: MCP_EXCERPT_BYTES, maxLines: MCP_EXCERPT_LINES } : {};
        const data = await withContextSearchCache(root, cache => searchContext(sources, query, budget, {
            // Temporary indexes are deleted when the query finishes.
            ...cache, ...caps, active: cache.sharedCache ? options.active : undefined,
        }));
        const totalQueryMs = performance.now() - started;
        const { queryMs, buildMs, waitMs, cacheHit, resultCount, returnedTokens, partial } = data;
        await traceContext(root, {
            type: "query", ...trace, actualEngine: arm.engine, budget, engineQueryMs: queryMs,
            queryMs: totalQueryMs, buildMs, waitMs, cacheHit, resultCount, returnedTokens, partial,
            outcome: resultCount ? "ok" : "empty",
        });
        return { engine: arm.engine, data, totalQueryMs };
    }
    catch (error) {
        await traceContext(root, { type: "query", ...trace, outcome: "error", queryMs: performance.now() - started, budget });
        throw error;
    }
}
//# sourceMappingURL=retrieve.js.map