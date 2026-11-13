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
export declare function countContextTokens(text: string): number;
export declare function warmTantivyIndex(sources: readonly ContextSource[], options: SearchOptions): Promise<{
    index: string;
    buildMs: number;
    cacheHit: boolean;
    waitMs: number;
} | undefined>;
export declare function searchContext(sources: readonly ContextSource[], query: string, budget: number, options: SearchOptions): Promise<SearchResult>;
