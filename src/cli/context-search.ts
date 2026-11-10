import { getSearchConfig, providerSessionId } from "../context-search/rollout.js";
import { countContextTokens } from "../context-search/engine.js";
import { CONTEXT_SEARCH_HEADER } from "../context-search/output.js";
import { contextCoverage } from "../context-search/sources.js";
import { checkoutIdentity } from "../session/start.js";

export async function runTaskRead(cwd: string, args: string[], session = providerSessionId()): Promise<number> {
  const [path, start = "1"] = args;
  const from = Number(start);
  if (!path || args.length > 2 || !Number.isSafeInteger(from) || from < 1) {
    throw new Error("Use morpheus context task-read <indexed-path> [start-line].");
  }
  const { root } = await checkoutIdentity(cwd);
  const { taskRecord } = await import("../context-search/task-start.js");
  const record = await taskRecord(root, session, path);
  if (!record) throw new Error("Choose an indexed project record outside the required startup core.");
  const lines = record.text.replace(/\r?\n$/, "").split(/\r?\n/).slice(from - 1, from + 15);
  while (lines.length) {
    const excerpt = `${path}:${from}-${from + lines.length - 1}\n${lines.join("\n")}`;
    if (Buffer.byteLength(excerpt) <= 6_000 && countContextTokens(excerpt) <= 1_000 && lines.some(line => line.trim())) {
      console.log(`${CONTEXT_SEARCH_HEADER}\n${excerpt}`);
      return 0;
    }
    lines.pop();
  }
  throw new Error("No readable excerpt at that line. Choose a different start line or search for the relevant text.");
}

interface SearchOptions {
  json: boolean;
  maxTokens?: string;
  sessionId?: string;
}

export async function runContextSearch(cwd: string, query: string, options: SearchOptions): Promise<number> {
  const started = performance.now();
  const budget = options.maxTokens === undefined ? 1000 : Number(options.maxTokens);
  const { root } = await checkoutIdentity(cwd);
  const { retrieveContext } = await import("../context-search/retrieve.js");
  const result = await retrieveContext(root, query, budget, { session: options.sessionId ?? providerSessionId(), transport: "cli", started });
  const { output, excerpts: _excerpts, ...data } = result.data;
  if (options.json) console.log(JSON.stringify({ kind: "morpheus-context-search", engine: result.engine, output, ...data, totalQueryMs: result.totalQueryMs }));
  else if (output) console.log(`${CONTEXT_SEARCH_HEADER}\n${output}`);
  else console.log("No matching excerpts within the return budget. Try more specific terms or read the source files directly.");
  return 0;
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
