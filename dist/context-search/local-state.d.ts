export declare function searchStateDirectory(root: string, child: "cache" | "traces" | "startup"): Promise<string>;
export declare function validSearchSession(session?: string): session is string;
export declare function withContextSearchCache<T>(root: string, use: (cache: string) => Promise<T>): Promise<T>;
