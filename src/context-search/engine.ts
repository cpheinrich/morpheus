import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Tiktoken } from "js-tiktoken/lite";
import ranks from "js-tiktoken/ranks/o200k_base";

export interface ContextSource {
  readonly path: string;
  readonly text: string;
}

export interface SearchOptions {
  readonly engine: "tantivy" | "ripgrep";
  readonly cacheDir: string;
  readonly maxBytes?: number;
  readonly maxLines?: number;
}

export interface ContextExcerpt {
  path: string;
  from: number;
  to: number;
  text: string;
}

export interface SearchResult {
  readonly excerpts: readonly ContextExcerpt[];
  readonly output: string;
  readonly returnedTokens: number;
  readonly resultCount: number;
  readonly buildMs: number;
  readonly queryMs: number;
  readonly cacheHit: boolean;
}

interface Document {
  readonly path: string;
  readonly lines: readonly string[];
  readonly firstLine: number;
  readonly firstChunk: number;
}

interface Span {
  readonly document: Document;
  readonly first: number;
  readonly last: number;
}

const WINDOW = 16;
const INDEX_STRIDE = 2;
const EXCERPT_STRIDE = 12;
const MAX_RESULTS = 40;
const INDEX_VERSION = "tantivy-0.27.0-v1";
const IDENTIFIER = /\b[A-Z][A-Z0-9]+-\d{2}-\d{2}-\d{2}-\d{2}\.\d{2}\.\d{2}\b/gi;
const WORD = new RegExp(IDENTIFIER.source + "|[\\p{L}\\p{N}]+", "giu");
const STOP = new Set("the and for with from that this who can what into while how without before after are have use using find where task work log worklog record section".split(" "));
const WORKER = fileURLToPath(new URL("./tantivy-worker.py", import.meta.url));
let tokenizer: Tiktoken | undefined;

function words(input: string): string[] {
  return (input.toLowerCase().match(WORD) ?? []).filter((word) => word.length >= 3 && !STOP.has(word));
}

function nativeTerms(input: string): string {
  return words(input).map((word) => word.includes("-")
    ? "morpheusid" + word.replaceAll("-", "z").replaceAll(".", "x")
    : word).join(" ");
}

function documentsFor(sources: readonly ContextSource[]): Document[] {
  let firstLine = 0;
  let firstChunk = 0;
  return sources.map(({ path, text }) => {
    const lines = text.replace(/\r?\n$/, "").split(/\r?\n/);
    const result = { path, lines, firstLine, firstChunk };
    firstLine += lines.length;
    firstChunk += Math.ceil(lines.length / INDEX_STRIDE);
    return result;
  });
}

function excerpt(document: Document, line: number): Span {
  const overlapMidpoint = Math.ceil((WINDOW - EXCERPT_STRIDE) / 2);
  const first = Math.floor(Math.max(0, line - overlapMidpoint) / EXCERPT_STRIDE) * EXCERPT_STRIDE;
  return { document, first, last: Math.min(document.lines.length, first + WINDOW) };
}

function shortlist(ranked: Iterable<Span>): Span[] {
  const selected: Span[] = [];
  const byPath = new Map<string, Span[]>();
  for (const span of ranked) {
    const prior = byPath.get(span.document.path) ?? [];
    if (prior.length === 2 || prior.some((p) => p.first < span.last && span.first < p.last)) continue;
    prior.push(span);
    byPath.set(span.document.path, prior);
    selected.push(span);
    if (selected.length === MAX_RESULTS) break;
  }
  return selected;
}

export function countContextTokens(text: string): number {
  tokenizer ??= new Tiktoken(ranks);
  return tokenizer.encode(text, [], []).length;
}

function format(spans: Iterable<Span>, budget: number, maxBytes = Infinity, maxLines = Infinity): Pick<SearchResult, "output" | "returnedTokens" | "resultCount" | "excerpts"> {
  let output = "";
  let returnedTokens = 0;
  let outputLines = 0;
  const excerpts: ContextExcerpt[] = [];
  for (const { document, first, last } of shortlist(spans)) {
    const text = document.lines.slice(first, last).join("\n");
    const entry = `${document.path}:${first + 1}-${last}\n${text}\n\n`;
    const tokens = countContextTokens(output + entry);
    const entryLines = last - first + 2;
    if (tokens > budget || Buffer.byteLength(output + entry) > maxBytes || outputLines + entryLines > maxLines) continue;
    outputLines += entryLines;
    output += entry;
    returnedTokens = tokens;
    excerpts.push({ path: document.path, from: first + 1, to: last, text });
  }
  return { output, returnedTokens, resultCount: excerpts.length, excerpts };
}

function documentAt(documents: readonly Document[], target: number, offset: "firstChunk" | "firstLine"): Document | undefined {
  let left = 0;
  let right = documents.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (documents[middle]![offset] <= target) left = middle + 1;
    else right = middle;
  }
  return documents[left - 1];
}

interface Match {
  readonly type: string;
  readonly data?: {
    readonly line_number: number;
    readonly submatches: readonly { readonly match: { readonly text: string } }[];
  };
}

function ripgrep(documents: readonly Document[], query: string): Span[] {
  const identifier = query.match(IDENTIFIER)?.[0];
  const expression = identifier ? identifier.replaceAll(".", "[.]") : [...new Set(words(query))].join("|");
  if (!expression) return [];
  const result = spawnSync("rg", ["--no-config", "--json", "--text", "-i", "-e", `\\b(?:${expression})\\b`, "-"], {
    input: documents.map(({ lines }) => lines.join("\n") + "\n").join(""),
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    throw new Error(`ripgrep query failed: ${result.error?.message ?? result.status ?? result.signal}`);
  }
  const hits: { document: Document; line: number; score: number }[] = [];
  for (const json of result.stdout.split("\n")) {
    if (!json) continue;
    const event = JSON.parse(json) as Match;
    if (event.type !== "match" || !event.data) continue;
    const line = event.data.line_number - 1;
    const document = documentAt(documents, line, "firstLine");
    if (!document) throw new Error("ripgrep returned an unknown source line");
    const score = new Set(event.data.submatches.map(({ match }) => match.text.toLowerCase())).size;
    hits.push({ document, line: line - document.firstLine, score });
  }
  hits.sort((a, b) => b.score - a.score || a.document.path.localeCompare(b.document.path, "en") || a.line - b.line);
  return hits.map(({ document, line }) => excerpt(document, line));
}

function buildPayload(documents: readonly Document[]): string {
  const batches: string[] = [];
  for (const document of documents) {
    const { path, lines, firstChunk } = document;
    const title = lines.find((line) => /^# /.test(line)) ?? basename(path);
    const titleTerms = nativeTerms(title);
    const pathWords = nativeTerms(path.replace(/([a-z])([A-Z])/g, "$1 $2"));
    let heading = title;
    let batch = [];
    for (let first = 0; first < lines.length; first += INDEX_STRIDE) {
      const body = lines.slice(first, first + WINDOW);
      heading = body.findLast((line) => /^#{1,6} /.test(line)) ?? heading;
      batch.push({ chunk: firstChunk + first / INDEX_STRIDE, title: titleTerms,
        heading: nativeTerms(heading), pathWords, body: nativeTerms(body.join("\n")) });
      if (batch.length === 256) {
        batches.push(JSON.stringify(batch));
        batch = [];
      }
    }
    if (batch.length) batches.push(JSON.stringify(batch));
  }
  return batches.join("\n") + "\n";
}

function python(action: "build" | "search", directory: string, input: string): string | null {
  const installed = join(homedir(), ".morpheus", "tools", "context-search", "bin", "python");
  const executable = process.env.MORPHEUS_TANTIVY_PYTHON ?? (existsSync(installed) ? installed : "python3");
  const result = spawnSync(executable, [WORKER, action, directory], {
    input, encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status === 2) throw new Error("Tantivy is unavailable. Install tantivy==0.27.0 in the configured Python environment or select ripgrep.");
  if (action === "search" && result.status === 3) return null;
  if (result.error || result.status !== 0) {
    throw new Error(`Tantivy ${action} failed: ${result.error?.message ?? result.status ?? result.signal}`);
  }
  return result.stdout;
}

function fingerprint(sources: readonly ContextSource[]): string {
  const hash = createHash("sha256").update(INDEX_VERSION);
  for (const { path, text } of sources) {
    hash.update(`:${Buffer.byteLength(path)}:`).update(path);
    hash.update(`:${Buffer.byteLength(text)}:`).update(text);
  }
  return hash.digest("hex");
}

function publishIndex(cacheDir: string, index: string, documents: readonly Document[]): void {
  mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  const pending = mkdtempSync(join(cacheDir, "pending-"));
  try {
    python("build", pending, buildPayload(documents));
    try {
      renameSync(pending, index);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
      // Another query built this same immutable index first.
      if (!indexExists(index)) throw error;
    }
  } finally {
    rmSync(pending, { recursive: true, force: true });
  }
}

function indexExists(index: string): boolean {
  try {
    if (!lstatSync(index).isDirectory()) throw new Error("Tantivy cache entry is not a directory");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function strongestLine(document: Document, first: number, last: number, terms: ReadonlySet<string>): number {
  let count = 0;
  let selected = Math.floor((first + last - 1) / 2);
  for (let i = first; i < last; i++) {
    const hits = new Set(words(document.lines[i]!).filter((word) => terms.has(word))).size;
    if (hits > count) {
      count = hits;
      selected = i;
    }
  }
  return selected;
}

function tantivySpans(documents: readonly Document[], query: string, reply: string): Span[] {
  const ids: unknown = JSON.parse(reply);
  if (!Array.isArray(ids)) throw new Error("Tantivy returned an invalid candidate list");
  const terms = new Set(words(query));
  return ids.map((id: unknown) => {
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0) throw new Error("Invalid Tantivy candidate ID");
    const document = documentAt(documents, id, "firstChunk");
    const first = document ? (id - document.firstChunk) * INDEX_STRIDE : -1;
    if (!document || first < 0 || first >= document.lines.length) throw new Error("Tantivy candidate is outside the source");
    const last = Math.min(first + WINDOW, document.lines.length);
    return excerpt(document, strongestLine(document, first, last, terms));
  });
}

function tantivy(sources: readonly ContextSource[], documents: readonly Document[], query: string, cacheDir: string) {
  const terms = nativeTerms(query);
  if (!terms || !documents.length) return { spans: [], buildMs: 0, cacheHit: false };

  const index = join(cacheDir, `index-${fingerprint(sources)}`);
  const cacheHit = indexExists(index);
  let buildMs = 0;
  if (!cacheHit) {
    const start = performance.now();
    publishIndex(cacheDir, index, documents);
    buildMs = performance.now() - start;
  }
  const reply = python("search", index, terms);
  if (reply === null) throw new Error("Tantivy could not open the context index. Remove the worktree's search cache and retry.");
  return { spans: tantivySpans(documents, query, reply), buildMs, cacheHit };
}

export async function searchContext(
  sources: readonly ContextSource[], query: string, budget: number, options: SearchOptions,
): Promise<SearchResult> {
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 2500) throw new Error("Search budget must be 1–2500 tokens");
  const start = performance.now();
  const documents = documentsFor(sources);
  const { spans, buildMs, cacheHit } = options.engine === "tantivy"
    ? tantivy(sources, documents, query, options.cacheDir)
    : { spans: ripgrep(documents, query), buildMs: 0, cacheHit: false };
  const result = format(spans, budget, options.maxBytes, options.maxLines);
  return { ...result, buildMs, cacheHit, queryMs: performance.now() - start - buildMs };
}
