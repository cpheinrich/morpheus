import type { SearchOptions } from "./engine.js";
export declare function searchStateDirectory(root: string, child: "cache" | "traces" | "startup", create?: boolean): Promise<string>;
export declare function persistentContextCache(root: string): Promise<SearchOptions>;
export declare function validSearchSession(session?: string): session is string;
export declare function withContextSearchCache<T>(root: string, use: (cache: SearchOptions) => Promise<T>): Promise<T>;
