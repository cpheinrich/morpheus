import { type AppeekySnapshot } from "./index.js";
/**
 * A bounded, read-only Appeeky snapshot: one listing lookup, one organic keyword list, and a
 * per-term rank lookup only for configured terms the organic list did not cover. Endpoint shapes
 * and credit costs follow https://docs.appeeky.com/docs/rate-limits.md, get-app.md,
 * get-app-keywords.md and get-keyword-ranks.md (checked 2026-11-20).
 */
export type AppeekyRequest = {
    appId: string;
    country: string;
    device: "iphone" | "ipad";
    terms: string[];
    brandedTerms?: string[];
};
export type AppeekyFetchOptions = {
    apiKey: string;
    fetch?: typeof globalThis.fetch;
    now?: () => Date;
    baseUrl?: string;
};
export declare const APPEEKY_TERM_LIMITS: {
    readonly min: 3;
    readonly max: 5;
};
export declare function fetchAppeekySnapshot(request: AppeekyRequest, options: AppeekyFetchOptions): Promise<AppeekySnapshot>;
