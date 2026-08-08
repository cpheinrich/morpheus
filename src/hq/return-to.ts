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

/** Trailing slashes removed, root preserved. */
const trimTrailingSlashes = (path: string): string => path.replace(/\/+$/, "") || "/";

/**
 * True for a base that says nothing — `""`, or a run of two or more separators.
 *
 * A single `"/"` is **not** empty: it is the deliberate value a project uses
 * when its whole origin sits behind the gate, and the root special-case below
 * exists for it. `"//"` is not a shorter way of saying that — it is a typo that
 * would otherwise strip to root and admit everything silently.
 */
const isEmptyBase = (base: string | undefined): boolean =>
  base === undefined || base === "" || /^\/{2,}$/.test(base);

/**
 * A dot-segment, in every spelling the URL parser collapses.
 *
 * WHATWG does not define these as the literal one- and two-character strings.
 * A double-dot segment is `..` or an ASCII case-insensitive `.%2e`, `%2e.`, or
 * `%2e%2e`; a single-dot segment is `.` or `%2e`. Verified against `new URL()`:
 * all four encoded forms resolve `/hq/<seg>/admin` to `/admin`, while `%2ee`
 * does not — which is why the fold is exact rather than a substring replace.
 */
const isDotSegment = (segment: string): boolean => {
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
export function safeReturnTo(
  raw: string | null | undefined,
  opts: SafeReturnToOptions = {},
): string {
  // An empty base — `""`, `"//"`, any run of separators — is a
  // misconfiguration, not a request for root. Left to fall through it would
  // strip to `"/"`, hit the root special-case below, and admit every path
  // with no throw and no log. A caller that genuinely wants the whole origin
  // says so with `base: "/"`, which is a distinct and deliberate value.
  const base = isEmptyBase(opts.base) ? "/hq" : trimTrailingSlashes(opts.base!);
  const fallback = opts.fallback ?? base;
  const deny = (opts.deny ?? []).map(trimTrailingSlashes);

  if (!raw || raw.length > MAX_LENGTH) return fallback;

  // Rejected before the prefix check, not after: `//host` is another origin,
  // and a backslash is normalised to a slash by some browsers, so `/\evil`
  // would otherwise pass a check written against forward slashes alone.
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("\\") || CONTROL_OR_SPACE.test(raw)) return fallback;

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
  if (path.split("/").some(isDotSegment)) return fallback;

  // `/hqevil` must not pass a check for `/hq`, so the separator is required.
  // A root base admits every path — the prefix test cannot express that, since
  // `startsWith("//")` was already rejected above and would silently reject
  // everything instead.
  if (base !== "/" && path !== base && !path.startsWith(`${base}/`)) return fallback;

  // Returning to the sign-in page bounces the visitor straight back to it.
  // Matched as a subtree rather than exactly: a sign-in flow with sub-routes
  // — `/hq/sign-in/verify` — bounces exactly the same way, and an exact match
  // would cover the parent while silently missing every step under it.
  if (deny.some((denied) => path === denied || path.startsWith(`${denied}/`))) return fallback;

  return raw;
}
