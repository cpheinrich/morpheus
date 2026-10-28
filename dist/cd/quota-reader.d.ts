import { type QuotaSnapshot } from "./schema.js";
/** Only fixed protocol diagnostics, never provider output or configuration. */
export declare class QuotaReadError extends Error {
}
/** Real per-call telemetry; stop only its private foreground reader group. */
export declare function nativeQuota(command: string[], cwd: string, observedAt: string): Promise<QuotaSnapshot>;
