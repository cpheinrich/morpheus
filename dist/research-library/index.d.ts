export declare const RESEARCH_LIBRARY_READER_FORMAT: "docling-html-embedded-v1";
export declare const RESEARCH_LIBRARY_BOOK_SCHEMA: "research-library-book-2";
export type ResearchLibraryBundle = {
    bucket: string;
    object: string;
    sha256: string;
    bytes: number;
    files: number;
};
export type ResearchLibraryReader = {
    bucket: string;
    object: string;
    sha256: string;
    bytes: number;
    sourceBundleSha256: string;
    format: typeof RESEARCH_LIBRARY_READER_FORMAT;
};
export type ResearchLibraryBook = {
    schemaVersion: typeof RESEARCH_LIBRARY_BOOK_SCHEMA;
    slug: string;
    title: string;
    authors: string[];
    sourceDirectory: string;
    edition?: string;
    publisher?: string;
    year?: number;
    isbn?: string[];
    language?: string;
    bundle: ResearchLibraryBundle;
    reader: ResearchLibraryReader;
};
export type ResearchLibraryCatalogIssue = {
    path: string;
    message: string;
};
export type ResearchLibraryCatalog = {
    books: ResearchLibraryBook[];
    issues: ResearchLibraryCatalogIssue[];
};
export type ResearchLibraryContract = {
    bucket: string;
    objectPrefix?: string;
    catalogDir?: string;
};
export declare function parseResearchLibraryBook(value: unknown, contract: ResearchLibraryContract): ResearchLibraryBook | null;
export declare function formatResearchLibraryBytes(bytes: number): string;
