export interface ContextSource {
    readonly path: string;
    readonly text: string;
}
export interface SearchOptions {
    readonly engine: "tantivy" | "ripgrep";
    readonly cacheDir: string;
    readonly maxBytes?: number;
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
export declare function countContextTokens(text: string): number;
export declare function searchContext(sources: readonly ContextSource[], query: string, budget: number, options: SearchOptions): Promise<SearchResult>;
