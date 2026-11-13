export interface ContextSource {
    readonly path: string;
    readonly text: string;
}
export interface SearchOptions {
    readonly cacheDir: string;
    readonly sharedCache?: () => Promise<string | undefined>;
    readonly maxBytes?: number;
    readonly maxLines?: number;
    readonly active?: ActiveContextIndex;
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
    readonly partial?: true;
}
interface IndexSnapshot {
    readonly index: string;
    readonly sources: readonly ContextSource[];
}
/** Owned by one MCP server for a particular worktree and kind filter. */
export interface ActiveContextIndex {
    ready?: IndexSnapshot;
    latest?: string;
    refreshing?: Promise<void>;
    refreshTarget?: string;
    next?: () => void;
}
export declare function countContextTokens(text: string): number;
export declare function warmTantivyIndex(sources: readonly ContextSource[], options: SearchOptions): Promise<{
    index: string;
    buildMs: number;
    cacheHit: boolean;
    waitMs: number;
} | undefined>;
/** Drain active builds on stdio EOF so workers can clean up their pending directories. */
export declare function drainContextIndexBuilds(): Promise<void>;
export declare function searchContext(sources: readonly ContextSource[], query: string, budget: number, options: SearchOptions): Promise<SearchResult>;
export {};
