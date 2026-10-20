import { type QuotaSnapshot } from "./schema.js";
/** Real per-call telemetry; stop only its private foreground reader group. */
export declare function nativeQuota(command: string[], cwd: string, observedAt: string): Promise<QuotaSnapshot>;
