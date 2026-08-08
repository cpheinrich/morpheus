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
  /** Paths that verify as safe but must not be returned to — the sign-in page. */
  deny?: readonly string[];
}

const trimTrailingSlashes = (path: string): string => path.replace(/\/+$/, "") || "/";

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
  const base = trimTrailingSlashes(opts.base ?? "/hq");
  const fallback = opts.fallback ?? base;
  const deny = (opts.deny ?? []).map(trimTrailingSlashes);

  if (!raw || raw.length > MAX_LENGTH) return fallback;

  // Rejected before the prefix check, not after: `//host` is another origin,
  // and a backslash is normalised to a slash by some browsers, so `/\evil`
  // would otherwise pass a check written against forward slashes alone.
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("\\") || CONTROL_OR_SPACE.test(raw)) return fallback;

  const path = trimTrailingSlashes(raw.split(/[?#]/)[0] ?? "");

  // `/hqevil` must not pass a check for `/hq`, so the separator is required.
  if (path !== base && !path.startsWith(`${base}/`)) return fallback;

  // Returning to the sign-in page bounces the visitor straight back to it.
  if (deny.includes(path)) return fallback;

  return raw;
}
