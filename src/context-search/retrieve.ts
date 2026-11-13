import { searchContext, type ActiveContextIndex } from "./engine.js";
import { withContextSearchCache } from "./local-state.js";
import { contextArm, getSearchConfig, traceContext, type TraceTransport } from "./rollout.js";
import { MCP_EXCERPT_BYTES, MCP_EXCERPT_LINES } from "./output.js";
import { contextKind, discoverSources, readContextSources, type ContextKind } from "./sources.js";

interface RetrievalOptions {
  session?: string;
  transport: TraceTransport;
  kinds?: readonly ContextKind[];
  started?: number;
  mcpStartedAt?: number;
  active?: ActiveContextIndex;
}

export async function retrieveContext(root: string, query: string, budget: number, options: RetrievalOptions) {
  const { session, transport, kinds, started = performance.now(), mcpStartedAt } = options;
  if (!query.trim() || !Number.isInteger(budget) || budget < 1 || budget > 2500) {
    throw new Error("Use a nonempty query and a return budget from 1 to 2,500 tokens.");
  }
  const config = await getSearchConfig(root);
  const arm = await contextArm(root, session, config);
  const trace = { queryStartedAt: performance.timeOrigin + started, mcpStartedAt, arm: arm.arm, engine: arm.engine, session: arm.session, rollout: arm.id, transport, operation: "search" as const };
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
  } catch (error) {
    await traceContext(root, { type: "query", ...trace, outcome: "error", queryMs: performance.now() - started, budget });
    throw error;
  }
}
