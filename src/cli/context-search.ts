import { contextArm, getSearchConfig, providerSessionId, traceContext } from "../context-search/rollout.js";
import { searchContext } from "../context-search/engine.js";
import { CONTEXT_SEARCH_HEADER } from "../context-search/output.js";
import { contextCoverage, discoverSources, readContextSources } from "../context-search/sources.js";
import { checkoutIdentity } from "../session/start.js";

import { searchStateDirectory, sessionEngine, setSessionEngine, validSearchSession } from "../context-search/local-state.js";

interface SearchOptions {
  json: boolean;
  maxTokens?: string;
  sessionId?: string;
}

export async function runContextSearch(cwd: string, query: string, options: SearchOptions): Promise<number> {
  const started = performance.now();
  const budget = options.maxTokens === undefined ? 1000 : Number(options.maxTokens);
  if (!query.trim() || !Number.isInteger(budget) || budget < 1 || budget > 2500) {
    throw new Error("Use a nonempty query and a return budget from 1 to 2,500 tokens.");
  }
  const { root } = await checkoutIdentity(cwd);
  const config = await getSearchConfig(root);
  const sessionId = options.sessionId ?? providerSessionId();
  const arm = await contextArm(root, sessionId, config);
  const overrideEngine = await sessionEngine(root, sessionId);
  const coverage = await discoverSources(root, config);
  const sources = await readContextSources(root, coverage.included);
  const result = await runEngine(sources, query, budget, overrideEngine ?? arm.engine, root);
  const { output, ...timings } = result.data;
  const totalQueryMs = performance.now() - started;
  await traceContext(root, {
    type: "query", arm: arm.arm, engine: arm.engine, actualEngine: result.engine, overrideEngine, session: arm.session, rollout: arm.id,
    ...timings, budget, engineQueryMs: timings.queryMs, queryMs: totalQueryMs,
  });
  if (options.json) console.log(JSON.stringify({ kind: "morpheus-context-search", engine: result.engine, ...result.data, totalQueryMs }));
  else if (output) console.log(`${CONTEXT_SEARCH_HEADER}\n${output}`);
  else console.log("No matching excerpts within the return budget. Try more specific terms or read the source files directly.");
  return 0;
}

async function runEngine(
  sources: Awaited<ReturnType<typeof readContextSources>>, query: string, budget: number,
  engine: "tantivy" | "ripgrep", root: string,
) {
  try {
    const cacheDir = engine === "tantivy" ? await searchStateDirectory(root, "cache") : "";
    return { engine, data: await searchContext(sources, query, budget, { engine, cacheDir }) };
  } catch (error) {
    if (engine !== "tantivy") throw error;
    console.error("Tantivy was unavailable for this query. Using bounded ripgrep.");
    return { engine: "ripgrep" as const, data: await searchContext(sources, query, budget, { engine: "ripgrep", cacheDir: "" }) };
  }
}

export async function runContextCoverage(cwd: string, json: boolean): Promise<number> {
  const { root } = await checkoutIdentity(cwd);
  const config = await getSearchConfig(root);
  const coverage = await contextCoverage(root, config);
  if (json) console.log(JSON.stringify(coverage));
  else {
    console.log(`Search coverage: ${coverage.included.length} indexed, ${coverage.excluded.length} excluded.`);
    for (const path of coverage.unavailable) console.log(`Unavailable in this checkout: ${path}`);
    for (const path of coverage.uncovered) console.log(`Uncovered: ${path}`);
    for (const pattern of coverage.emptyPatterns) console.log(`No indexed files match: ${pattern}`);
  }
  return 0;
}

export async function runContextEngine(cwd: string, args: string[], session = providerSessionId()): Promise<number> {
  const [engine] = args;
  if (args.length !== 1 || (engine !== "tantivy" && engine !== "ripgrep" && engine !== "auto")) {
    throw new Error("Use morpheus context engine tantivy|ripgrep|auto.");
  }
  if (!validSearchSession(session)) throw new Error("Pass the provider session ID printed by startup with --session-id.");
  const { root } = await checkoutIdentity(cwd);
  await setSessionEngine(root, session, engine);
  console.log(engine === "auto"
    ? "Restored automatic context engine selection for this session and checkout."
    : `Pinned ${engine} for context searches in this session and checkout.`);
  return 0;
}
