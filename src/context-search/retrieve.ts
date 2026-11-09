import { searchContext, type ContextSource } from "./engine.js";
import { searchStateDirectory, sessionEngine, validSearchSession } from "./local-state.js";
import { contextArm, getSearchConfig, traceContext, type ContextTransport, type SearchEngine } from "./rollout.js";
import { MCP_EXCERPT_BYTES, MCP_EXCERPT_LINES } from "./output.js";
import { contextKind, discoverSources, readContextSources, type ContextKind } from "./sources.js";

async function runEngine(root: string, sources: readonly ContextSource[], query: string, budget: number, engine: SearchEngine, transport: ContextTransport) {
  const caps = transport === "mcp" ? { maxBytes: MCP_EXCERPT_BYTES, maxLines: MCP_EXCERPT_LINES } : {};
  try {
    const cacheDir = engine === "tantivy" ? await searchStateDirectory(root, "cache") : "";
    return { engine, data: await searchContext(sources, query, budget, { engine, cacheDir, ...caps }), fallback: false };
  } catch (error) {
    if (engine !== "tantivy") throw error;
    const data = await searchContext(sources, query, budget, { engine: "ripgrep", cacheDir: "", ...caps });
    return { engine: "ripgrep" as const, data, fallback: true };
  }
}

interface RetrievalOptions {
  session?: string;
  transport: ContextTransport;
  kinds?: readonly ContextKind[];
  started?: number;
}

export async function retrieveContext(root: string, query: string, budget: number, options: RetrievalOptions) {
  const { session, transport, kinds, started = performance.now() } = options;
  if (!query.trim() || !Number.isInteger(budget) || budget < 1 || budget > 2500) {
    throw new Error("Use a nonempty query and a return budget from 1 to 2,500 tokens.");
  }
  const config = await getSearchConfig(root);
  if (transport === "mcp" && config.rollout && !validSearchSession(session)) {
    throw new Error("The host did not supply a session identity. Reload Morpheus Context for this project session.");
  }
  const arm = await contextArm(root, session, config);
  const overrideEngine = await sessionEngine(root, session);
  const trace = { arm: arm.arm, engine: arm.engine, overrideEngine, session: arm.session, rollout: arm.id, transport, operation: "search" as const };
  try {
    const coverage = await discoverSources(root, config);
    const eligible = kinds?.length ? coverage.included.filter(path => kinds.includes(contextKind(path))) : coverage.included;
    const sources = await readContextSources(root, eligible);
    const result = await runEngine(root, sources, query, budget, overrideEngine ?? arm.engine, transport);
    const totalQueryMs = performance.now() - started;
    const { queryMs, buildMs, cacheHit, resultCount, returnedTokens } = result.data;
    await traceContext(root, {
      type: "query", ...trace, actualEngine: result.engine, budget, engineQueryMs: queryMs,
      queryMs: totalQueryMs, buildMs, cacheHit, resultCount, returnedTokens,
      outcome: resultCount ? "ok" : "empty",
    });
    return { ...result, totalQueryMs };
  } catch (error) {
    await traceContext(root, { type: "query", ...trace, outcome: "error", queryMs: performance.now() - started, budget });
    throw error;
  }
}
