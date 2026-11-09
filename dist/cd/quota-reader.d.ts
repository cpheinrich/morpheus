import { type QuotaSnapshot } from "./schema.js";
/** Only fixed protocol diagnostics, never provider output or configuration. */
export declare class QuotaReadError extends Error {
}
/** The failure a well-formed helper status reports about the reader process, or undefined for an unrecognized status. */
export declare function readerFailure(status: Record<string, unknown>, keyCount: number, label: string): string | undefined;
/** Real per-call telemetry; stop only its private foreground reader group. */
export declare function nativeQuota(command: string[], cwd: string, observedAt: string): Promise<QuotaSnapshot>;
