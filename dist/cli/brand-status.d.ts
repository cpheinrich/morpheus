/**
 * Report brand package completeness.
 *
 * Exits non-zero when the required set is unmet so CI can gate on it, but the
 * optional list never affects the exit code — an unmet trigger is not a
 * failure, and treating it as one would train people to ignore the output.
 */
export declare function status(brandDir: string, name: string): Promise<number>;
