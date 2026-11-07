import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { contextArm, getSearchConfig, traceContext } from "../context-search/rollout.js";
import { searchContext } from "../context-search/engine.js";
import { CONTEXT_SEARCH_HEADER } from "../context-search/output.js";
import { contextCoverage, discoverSources, readContextSources } from "../context-search/sources.js";
import { checkoutIdentity, sessionGit } from "../session/start.js";

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
  const arm = await contextArm(root, options.sessionId, config);
  const gitDir = await realpath(resolve(root, await sessionGit(root, ["rev-parse", "--git-dir"])));
  const coverage = await discoverSources(root, config);
  const sources = await readContextSources(root, coverage.included);
  const result = await runEngine(sources, query, budget, arm.engine, resolve(gitDir, "morpheus-context-search"));
  const { output, ...timings } = result.data;
  const totalQueryMs = performance.now() - started;
  await traceContext(root, {
    type: "query", arm: arm.arm, engine: arm.engine, actualEngine: result.engine, session: arm.session, rollout: arm.id,
    ...timings, budget, engineQueryMs: timings.queryMs, queryMs: totalQueryMs,
  });
  if (options.json) console.log(JSON.stringify({ kind: "morpheus-context-search", engine: result.engine, ...result.data, totalQueryMs }));
  else if (output) console.log(`${CONTEXT_SEARCH_HEADER}\n${output}`);
  else console.log("No matching excerpts within the return budget. Try more specific terms or read the source files directly.");
  return 0;
}

async function runEngine(
  sources: Awaited<ReturnType<typeof readContextSources>>, query: string, budget: number,
  engine: "tantivy" | "ripgrep", cacheDir: string,
) {
  try {
    return { engine, data: await searchContext(sources, query, budget, { engine, cacheDir }) };
  } catch (error) {
    if (engine !== "tantivy") throw error;
    console.error("Tantivy was unavailable for this query. Using bounded ripgrep.");
    return { engine: "ripgrep" as const, data: await searchContext(sources, query, budget, { engine: "ripgrep", cacheDir }) };
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
