import { type HqSearchDocument, type HqSearchPayload } from "./index.js";
export declare const HQ_SEARCH_PRIVATE_CACHE_CONTROL = "private, max-age=31536000, immutable";
export declare function hqSearchResponseHeaders(): Record<string, string>;
export type MarkdownSearchDocumentInput = {
    id: string;
    title: string;
    href: string;
    path: string;
    source: string;
    metadata?: string | Record<string, unknown>;
    aliases?: string;
};
/** A deliberately small Markdown-to-search-text conversion, not a renderer. */
export declare function plainText(source: string): string;
export declare function markdownHeadings(source: string): string;
export declare function hqSearchAliases(source: string): string;
export declare function metadataText(metadata?: string | Record<string, unknown>): string;
export declare function markdownSearchDocument(input: MarkdownSearchDocumentInput): HqSearchDocument;
export declare function createHqSearchPayload(documents: HqSearchDocument[], options?: {
    requireExtractedPdfText?: boolean;
}): HqSearchPayload;
