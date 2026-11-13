import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { copyFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Tiktoken } from "js-tiktoken/lite";
import ranks from "js-tiktoken/ranks/o200k_base";
import { tantivyPython } from "./runtime.js";

export interface ContextSource {
  readonly path: string;
  readonly text: string;
}

export interface SearchOptions {
  readonly cacheDir: string;
  readonly sharedCache?: () => Promise<string | undefined>;
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
  readonly waitMs: number;
}

interface Document {
  readonly path: string;
  readonly lines: readonly string[];
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
  let firstChunk = 0;
  return sources.map(({ path, text }) => {
    const lines = text.replace(/\r?\n$/, "").split(/\r?\n/);
    const result = { path, lines, firstChunk };
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

function documentAt(documents: readonly Document[], target: number): Document | undefined {
  let left = 0;
  let right = documents.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (documents[middle]!.firstChunk <= target) left = middle + 1;
    else right = middle;
  }
  return documents[left - 1];
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

function unavailableTantivy(): Error {
  return new Error("Tantivy is unavailable. Run morpheus context runtime install, then reload the client.");
}

function searchIndex(directory: string, input: string): string {
  const result = spawnSync(tantivyPython(), ["-I", WORKER, "search", directory], {
    input, encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status === 2 || (result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") throw unavailableTantivy();
  if (result.status === 3) throw new Error("Tantivy could not open the context index. Remove the worktree's search cache and retry.");
  if (result.error || result.status !== 0) {
    throw new Error(`Tantivy search failed: ${result.error?.message ?? result.status ?? result.signal}`);
  }
  return result.stdout;
}

function runIndexWorker(action: "build" | "validate", directory: string, input = ""): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(tantivyPython(), ["-I", WORKER, action, directory], {
      timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
    }, error => {
      if (!error) resolve();
      else reject(error.code === 2 || error.code === "ENOENT" ? unavailableTantivy() : new Error(`Tantivy ${action} failed`, { cause: error }));
    });
    // The worker can exit before consuming stdin (for example, a missing module).
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

function fingerprint(sources: readonly ContextSource[]): string {
  const hash = createHash("sha256").update(INDEX_VERSION);
  for (const { path, text } of sources) {
    hash.update(`:${Buffer.byteLength(path)}:`).update(path);
    hash.update(`:${Buffer.byteLength(text)}:`).update(text);
  }
  return hash.digest("hex");
}

async function copyIndex(source: string, pending: string): Promise<void> {
  const entries = await readdir(source, { withFileTypes: true });
  // A published index is flat. Let Tantivy create its own lock files in the destination.
  if (!entries.every(entry => entry.isFile()) || !entries.some(entry => entry.name === "meta.json")) {
    throw new Error("Unexpected shared context index layout");
  }
  for (const { name } of entries.filter(entry => !entry.name.endsWith(".lock"))) {
    await copyFile(join(source, name), join(pending, name), constants.COPYFILE_FICLONE);
  }
  // A complete copy must open before it can become a reusable local cache.
  await runIndexWorker("validate", pending);
}

async function publishIndex(cacheDir: string, index: string, populate: (pending: string) => Promise<void>): Promise<void> {
  mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  const pending = mkdtempSync(join(cacheDir, "pending-"));
  try {
    await populate(pending);
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
    const document = documentAt(documents, id);
    const first = document ? (id - document.firstChunk) * INDEX_STRIDE : -1;
    if (!document || first < 0 || first >= document.lines.length) throw new Error("Tantivy candidate is outside the source");
    const last = Math.min(first + WINDOW, document.lines.length);
    return excerpt(document, strongestLine(document, first, last, terms));
  });
}

async function adoptIndex(options: SearchOptions, index: string): Promise<boolean> {
  const shared = await options.sharedCache?.();
  if (!shared) return false;
  const source = join(shared, basename(index));
  if (!indexExists(source)) return false;
  await publishIndex(options.cacheDir, index, pending => copyIndex(source, pending));
  return true;
}

async function prepareIndex(options: SearchOptions, index: string, documents: readonly Document[]) {
  if (await adoptIndex(options, index).catch(() => false)) return { buildMs: 0, cacheHit: true };
  const started = performance.now();
  await publishIndex(options.cacheDir, index, pending => runIndexWorker("build", pending, buildPayload(documents)));
  return { buildMs: performance.now() - started, cacheHit: false };
}

const inFlightBuilds = new Map<string, ReturnType<typeof prepareIndex>>();

async function ensureIndex(sources: readonly ContextSource[], documents: readonly Document[], options: SearchOptions) {
  const index = join(options.cacheDir, `index-${fingerprint(sources)}`);
  if (indexExists(index)) return { index, buildMs: 0, cacheHit: true, waitMs: 0 };
  const started = performance.now();
  const running = inFlightBuilds.get(index);
  if (running) {
    const { cacheHit } = await running;
    return { index, buildMs: 0, cacheHit, waitMs: performance.now() - started };
  }
  const build = prepareIndex(options, index, documents);
  inFlightBuilds.set(index, build);
  try {
    return { index, ...await build, waitMs: 0 };
  } finally {
    inFlightBuilds.delete(index);
  }
}

export async function warmTantivyIndex(sources: readonly ContextSource[], options: SearchOptions) {
  const documents = documentsFor(sources);
  if (!documents.length) return;
  return ensureIndex(sources, documents, options);
}

async function tantivy(sources: readonly ContextSource[], documents: readonly Document[], query: string, options: SearchOptions) {
  const terms = nativeTerms(query);
  if (!terms || !documents.length) return { spans: [], buildMs: 0, cacheHit: false, waitMs: 0 };
  const { index, ...timing } = await ensureIndex(sources, documents, options);
  const reply = searchIndex(index, terms);
  return { spans: tantivySpans(documents, query, reply), ...timing };
}

export async function searchContext(
  sources: readonly ContextSource[], query: string, budget: number, options: SearchOptions,
): Promise<SearchResult> {
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 2500) throw new Error("Search budget must be 1–2500 tokens");
  const start = performance.now();
  const documents = documentsFor(sources);
  const { spans, buildMs, cacheHit, waitMs } = await tantivy(sources, documents, query, options);
  const result = format(spans, budget, options.maxBytes, options.maxLines);
  return { ...result, buildMs, cacheHit, waitMs, queryMs: performance.now() - start - buildMs - waitMs };
}
