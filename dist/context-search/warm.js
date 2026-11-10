import { checkoutIdentity } from "../session/start.js";
import { warmTantivyIndex } from "./engine.js";
import { searchStateDirectory } from "./local-state.js";
import { getSearchConfig, traceContext } from "./rollout.js";
import { discoverSources, readContextSources } from "./sources.js";
/** Build in the background when the MCP host starts, before the first search. */
export async function warmContextMcp(cwd) {
    const started = performance.now();
    const { root } = await checkoutIdentity(cwd);
    const config = await getSearchConfig(root);
    const cache = await searchStateDirectory(root, "cache").catch(() => undefined);
    if (!cache)
        return;
    const base = { type: "warm", transport: "mcp", arm: "tantivy-full", engine: "tantivy", rollout: config.rollout?.id, mcpStartedAt: performance.timeOrigin };
    try {
        const { included } = await discoverSources(root, config);
        const sources = await readContextSources(root, included);
        const timing = await warmTantivyIndex(sources, cache);
        const { buildMs, waitMs, cacheHit } = timing ?? {};
        await traceContext(root, { ...base, outcome: timing ? "ok" : "empty", queryMs: performance.now() - started, buildMs, waitMs, cacheHit });
    }
    catch {
        await traceContext(root, { ...base, outcome: "error", queryMs: performance.now() - started });
    }
}
//# sourceMappingURL=warm.js.map