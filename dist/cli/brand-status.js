import { basename } from "node:path";
import { formatStatus, packageStatus } from "../brand/package.js";
/**
 * Report brand package completeness.
 *
 * Exits non-zero when the required set is unmet so CI can gate on it, but the
 * optional list never affects the exit code — an unmet trigger is not a
 * failure, and treating it as one would train people to ignore the output.
 */
export async function status(brandDir, name) {
    const s = await packageStatus(brandDir);
    console.log(formatStatus(s, name || basename(brandDir)));
    return s.complete ? 0 : 1;
}
//# sourceMappingURL=brand-status.js.map