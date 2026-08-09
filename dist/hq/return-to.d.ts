/**
 * Narrowing for the "where were you headed" parameter the gate produces.
 *
 * `gate.ts`'s example writes `next` from `request.nextUrl.pathname`, which is
 * safe. The read side is where the vulnerability lives, and the kit did not
 * ship it — so every project writes its own, and `raw.startsWith("/")` is the
 * version most people write. That admits `//evil.example`, a protocol-relative
 * URL the browser resolves against another origin: an open redirect on the one
 * route in the product that exists to be trusted.
 *
 * Shipping the gate's redirect parameter without shipping its narrowing is an
 * incomplete gate, which is why this lives here rather than in each project.
 */
export interface SafeReturnToOptions {
    /** The prefix a destination must sit under. Defaults to the `/hq` route. */
    base?: string;
    /** Where to send anything rejected. Defaults to `base`. */
    fallback?: string;
    /**
     * Paths that verify as safe but must not be returned to — the sign-in page.
     * Matched as **subtrees**: `/hq/sign-in` also denies `/hq/sign-in/verify`,
     * which bounces the visitor exactly the same way.
     */
    deny?: readonly string[];
}
/**
 * Returns `raw` when it is a same-origin path under `base`, and the fallback
 * otherwise.
 *
 * Falls back rather than throwing: a bad redirect target should land the
 * visitor somewhere useful, not break their sign-in. The caller cannot
 * meaningfully handle an exception here — there is nowhere else to send them.
 */
export declare function safeReturnTo(raw: string | null | undefined, opts?: SafeReturnToOptions): string;
