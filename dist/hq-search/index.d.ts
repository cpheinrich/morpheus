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
    excerpt?: string;
};
export type HqSearchPayload = {
    version: 1;
    documentCount: number;
    pdfCount: number;
    pdfTextDocumentCount: number;
    index: ReturnType<MiniSearch<HqSearchDocument>["toJSON"]>;
};
type IndexedHqSearchResult = SearchResult & Pick<HqSearchDocument, "title" | "href" | "path" | "kind"> & Partial<Pick<HqSearchDocument, "excerpt" | "text">>;
export type HqSearchResult = IndexedHqSearchResult & {
    snippet: string;
};
export type HqSearchOptions = {
    limit?: number;
    /** Replaces default ranking, including exact-identity precedence. */
    sourceWeight?: (result: IndexedHqSearchResult) => number;
};
export declare function createHqSearchIndex(documents: HqSearchDocument[]): MiniSearch<HqSearchDocument>;
export declare function loadHqSearchIndex(payload: HqSearchPayload): Promise<MiniSearch<HqSearchDocument>>;
export declare function searchHq(index: MiniSearch<HqSearchDocument>, query: string, options?: number | HqSearchOptions): {
    snippet: string;
    score: number;
    id: any;
    terms: string[];
    queryTerms: string[];
    match: import("minisearch").MatchInfo;
    kind: "markdown" | "pdf";
    path: string;
    title: string;
    href: string;
    text?: string | undefined;
    excerpt?: string | undefined;
}[];
export declare function searchSnippet(text: string, matchedTerms: string[], length?: number): string;
/** Build-time result preview with a hard bound independent of token length. */
export declare function searchExcerpt(text: string, length?: number): string;
export {};
