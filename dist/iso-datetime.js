import { z } from "zod";
/**
 * An ISO datetime with the precision Morpheus accepted before Zod 4.5.
 *
 * Zod now follows RFC 3339 by requiring seconds on qualified datetimes. Our
 * persisted metadata also accepts minute precision, so retain both forms
 * explicitly rather than narrowing existing files during a security update.
 */
export function isoDatetimeWithOptionalSeconds(options = {}) {
    return z.union([
        z.iso.datetime(options),
        z.iso.datetime({ ...options, precision: -1 }),
    ]);
}
//# sourceMappingURL=iso-datetime.js.map