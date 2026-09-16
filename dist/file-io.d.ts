/** Best-effort discovery probe. False means inaccessible, not necessarily absent. */
export declare function accessible(path: string): Promise<boolean>;
/** Optional authored content: only absence is optional; I/O errors propagate. */
export declare function readIfExists(path: string): Promise<string | null>;
/** Best-effort discovery, where missing, unreadable and invalid JSON are unknown. */
export declare function readJson<T>(path: string): Promise<T | null>;
/** Shared scaffold bookkeeping; preserves existing authored files. */
export declare function scaffoldWriter(root: string, written: string[], skipped: string[]): (rel: string, content: string) => Promise<void>;
