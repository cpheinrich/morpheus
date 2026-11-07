export interface ContextSource {
    readonly path: string;
    readonly text: string;
}
export interface SearchOptions {
    readonly engine: "tantivy" | "ripgrep";
    readonly cacheDir: string;
}
export interface SearchResult {
    readonly output: string;
    readonly returnedTokens: number;
    readonly resultCount: number;
    readonly buildMs: number;
    readonly queryMs: number;
    readonly cacheHit: boolean;
}
export declare function countContextTokens(text: string): number;
export declare function searchContext(sources: readonly ContextSource[], query: string, budget: number, options: SearchOptions): Promise<SearchResult>;
