import { checkoutIdentity } from "../session/start.js";
import { warmTantivyIndex } from "./engine.js";
import { searchStateDirectory } from "./local-state.js";
import { getSearchConfig, traceContext } from "./rollout.js";
import { discoverSources, readContextSources } from "./sources.js";

/** A host can start MCP before it knows the arm. Only opted-in projects warm. */
export async function warmContextMcp(cwd: string): Promise<void> {
  const started = performance.now();
  const { root } = await checkoutIdentity(cwd);
  const config = await getSearchConfig(root);
  if (config.transport !== "mcp" || config.mode === "ripgrep" || (!config.rollout && config.mode !== "tantivy")) return;
  const base = { type: "warm", transport: "mcp", arm: "legacy", engine: "tantivy", rollout: config.rollout?.id, mcpStartedAt: performance.timeOrigin } as const;
  try {
    const { included } = await discoverSources(root, config);
    const sources = await readContextSources(root, included);
    const timing = await warmTantivyIndex(sources, await searchStateDirectory(root, "cache"));
    const { buildMs, waitMs, cacheHit } = timing ?? {};
    await traceContext(root, { ...base, outcome: timing ? "ok" : "empty", queryMs: performance.now() - started, buildMs, waitMs, cacheHit });
  } catch {
    await traceContext(root, { ...base, outcome: "error", queryMs: performance.now() - started });
  }
}
