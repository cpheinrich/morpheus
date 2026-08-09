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
/**
 * Control characters and spaces — browsers strip or normalise these before
 * resolving a URL, so a check running before that happens must reject them
 * rather than reason about the string it can see.
 *
 * Written as escapes deliberately. Literal control characters render in a
 * file as something that looks like a space-to-space range — which reads as
 * a class matching space or hyphen, and would reject every path containing a
 * dash while appearing correct.
 */
const CONTROL_OR_SPACE = /[\u0000-\u0020\u007f]/;
const MAX_LENGTH = 512;
/** Trailing slashes removed, root preserved. */
const trimTrailingSlashes = (path) => path.replace(/\/+$/, "") || "/";
/**
 * A usable base: exactly one leading separator, then anything.
 *
 * Stated positively after three rounds of finding another spelling that is not
 * — `""`, `"//"`, and `"hq"` all reached the same silent failure by different
 * routes, the last one worst because `fallback` defaults to `base`, so a
 * relative fallback resolves against the current path. Describing the bad
 * values kept missing one; describing the good one admits `"/"` and `"/hq"`
 * and rejects the rest together.
 */
const isUsableBase = (base) => typeof base === "string" && /^\/(?!\/)/.test(base);
/**
 * A dot-segment, in every spelling the URL parser collapses.
 *
 * WHATWG does not define these as the literal one- and two-character strings.
 * A double-dot segment is `..` or an ASCII case-insensitive `.%2e`, `%2e.`, or
 * `%2e%2e`; a single-dot segment is `.` or `%2e`. Verified against `new URL()`:
 * all four encoded forms resolve `/hq/<seg>/admin` to `/admin`, while `%2ee`
 * does not — which is why the fold is exact rather than a substring replace.
 */
const isDotSegment = (segment) => {
    const folded = segment.toLowerCase().replaceAll("%2e", ".");
    return folded === "." || folded === "..";
};
/**
 * Returns `raw` when it is a same-origin path under `base`, and the fallback
 * otherwise.
 *
 * Falls back rather than throwing: a bad redirect target should land the
 * visitor somewhere useful, not break their sign-in. The caller cannot
 * meaningfully handle an exception here — there is nowhere else to send them.
 */
export function safeReturnTo(raw, opts = {}) {
    // An unusable base falls back to the default rather than being taken
    // literally: every spelling of it — empty, all-separators, or missing the
    // leading slash — otherwise turns the narrowing into a no-op or a relative
    // fallback, with no throw and no log. A caller that wants the whole origin
    // says so with `base: "/"`, which is deliberate and distinct.
    const base = trimTrailingSlashes(isUsableBase(opts.base) ? opts.base : "/hq");
    const fallback = opts.fallback ?? base;
    const deny = (opts.deny ?? []).map(trimTrailingSlashes);
    if (!raw || raw.length > MAX_LENGTH)
        return fallback;
    // Rejected before the prefix check, not after: `//host` is another origin,
    // and a backslash is normalised to a slash by some browsers, so `/\evil`
    // would otherwise pass a check written against forward slashes alone.
    if (!raw.startsWith("/") || raw.startsWith("//"))
        return fallback;
    if (raw.includes("\\") || CONTROL_OR_SPACE.test(raw))
        return fallback;
    const path = trimTrailingSlashes(raw.split(/[?#]/)[0] ?? "");
    // A dot-segment makes the prefix check meaningless, because the browser
    // resolves the path *after* this function has approved it: `/hq/../admin`
    // starts with `/hq/` and lands on `/admin`. It also walks straight past
    // `deny` — `/hq/../hq/sign-in` is not string-equal to `/hq/sign-in`, so the
    // one option written to stop a sign-in loop would let one through.
    //
    // Rejected rather than normalised: normalising changes what the caller gets
    // back, and a redirect target containing `..` is a hand-written URL or an
    // attack, never something a working app produced.
    if (path.split("/").some(isDotSegment))
        return fallback;
    // `/hqevil` must not pass a check for `/hq`, so the separator is required.
    // A root base admits every path — the prefix test cannot express that, since
    // `startsWith("//")` was already rejected above and would silently reject
    // everything instead.
    if (base !== "/" && path !== base && !path.startsWith(`${base}/`))
        return fallback;
    // Returning to the sign-in page bounces the visitor straight back to it.
    // Matched as a subtree rather than exactly: a sign-in flow with sub-routes
    // — `/hq/sign-in/verify` — bounces exactly the same way, and an exact match
    // would cover the parent while silently missing every step under it.
    if (deny.some((denied) => path === denied || path.startsWith(`${denied}/`)))
        return fallback;
    return raw;
}
//# sourceMappingURL=return-to.js.map