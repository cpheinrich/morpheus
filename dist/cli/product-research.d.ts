export declare function validateProductResearch(directory: string | undefined): Promise<number>;
/**
 * Fetch a compact Appeeky snapshot into `out`. The file is replaced only after the whole snapshot
 * succeeds and validates, so a failed or refused run leaves the previous snapshot in place.
 */
export declare function asoProductResearch(args: string[], out: string | undefined, env?: NodeJS.ProcessEnv, fetcher?: typeof globalThis.fetch): Promise<number>;
