import { z } from "zod";
type IsoDatetimeOptions = {
    offset?: boolean;
    local?: boolean;
};
/**
 * An ISO datetime with the precision Morpheus accepted before Zod 4.5.
 *
 * Zod now follows RFC 3339 by requiring seconds on qualified datetimes. Our
 * persisted metadata also accepts minute precision, so retain both forms
 * explicitly rather than narrowing existing files during a security update.
 */
export declare function isoDatetimeWithOptionalSeconds(options?: IsoDatetimeOptions): z.ZodUnion<readonly [z.ZodISODateTime, z.ZodISODateTime]>;
export {};
