import MiniSearch, { type SearchResult } from "minisearch";

export type HqSearchDocument = {
  id: string;
  title: string;
  href: string;
  path: string;
  kind: "markdown" | "pdf";
  headings: string;
  metadata: string;
  aliases: string;
  text: string;
};

export type HqSearchPayload = {
  version: 1;
  documentCount: number;
  pdfCount: number;
  pdfTextDocumentCount: number;
  index: ReturnType<MiniSearch<HqSearchDocument>["toJSON"]>;
};

type IndexedHqSearchResult = SearchResult &
  Pick<HqSearchDocument, "title" | "href" | "path" | "kind" | "text">;

export type HqSearchResult = IndexedHqSearchResult & { snippet: string };

export type HqSearchOptions = {
  limit?: number;
  /** Project-specific ranking without forking the shared engine. */
  sourceWeight?: (result: IndexedHqSearchResult) => number;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "by",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

const INDEX_OPTIONS = {
  fields: ["title", "path", "headings", "metadata", "aliases", "text"],
  storeFields: ["title", "href", "path", "kind", "text"],
  processTerm: (term: string) => {
    const normalized = term.toLocaleLowerCase();
    return STOP_WORDS.has(normalized) ? null : normalized;
  },
};

const SEARCH_OPTIONS = {
  combineWith: "AND" as const,
  boost: {
    title: 5,
    headings: 3.5,
    path: 3,
    metadata: 2.5,
    aliases: 1.5,
    text: 1,
  },
  prefix: (term: string) => term.length >= 2,
  fuzzy: (term: string) => (term.length >= 5 ? 0.2 : false),
};

function defaultSourceWeight(result: IndexedHqSearchResult) {
  if (result.path.includes("product/roadmap/")) return 0.35;
  if (result.path.toLowerCase().endsWith("/readme.md")) return 1.75;
  return 1;
}

export function createHqSearchIndex(documents: HqSearchDocument[]) {
  const index = new MiniSearch<HqSearchDocument>(INDEX_OPTIONS);
  index.addAll(documents);
  return index;
}

export async function loadHqSearchIndex(payload: HqSearchPayload) {
  if (payload.version !== 1) throw new Error("Unsupported HQ search index version");
  return MiniSearch.loadJSONAsync<HqSearchDocument>(JSON.stringify(payload.index), INDEX_OPTIONS);
}

export function searchHq(
  index: MiniSearch<HqSearchDocument>,
  query: string,
  options: number | HqSearchOptions = {},
) {
  const normalized = query.trim().replace(/\bEIN\s+number\b/gi, "EIN");
  if (!normalized) return [];

  const resolved = typeof options === "number" ? { limit: options } : options;
  const sourceWeight = resolved.sourceWeight ?? defaultSourceWeight;

  return (index.search(normalized, SEARCH_OPTIONS) as IndexedHqSearchResult[])
    .map((result) => ({ ...result, score: result.score * sourceWeight(result) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, resolved.limit ?? 12)
    .map((result) => ({
      ...result,
      snippet: searchSnippet(result.text, result.terms),
    }));
}

export function searchSnippet(text: string, matchedTerms: string[], length = 190) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "Filename and path only; this PDF has no extractable text.";
  if (clean.length <= length) return clean;

  const terms = matchedTerms
    .filter((term) => term.length > 1)
    .sort((left, right) => right.length - left.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const match = terms.length ? new RegExp(terms.join("|"), "i").exec(clean) : null;
  const wantedStart = Math.max(0, (match?.index ?? 0) - Math.floor(length * 0.35));
  const start = wantedStart === 0 ? 0 : clean.lastIndexOf(" ", wantedStart);
  const end = clean.indexOf(" ", Math.min(clean.length, start + length));
  const excerpt = clean.slice(Math.max(0, start), end === -1 ? start + length : end).trim();

  return `${start > 0 ? "…" : ""}${excerpt}${end !== -1 && end < clean.length ? "…" : ""}`;
}
