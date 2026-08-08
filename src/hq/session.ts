import type { JWTPayload } from "jose";

/**
 * The mint half of the `/hq` session, and the policy around it.
 *
 * `session-cookie.ts` verifies a Firebase session cookie. Nothing here created
 * one, and the omission had a cost: `cpheinrich.com` stored the raw **ID token**
 * as its session cookie instead. Google fixes those at one hour, so the site
 * asked for Google again on nearly every visit, and the natural fix — raising
 * the cookie's `maxAge` — does nothing, because the token inside is what
 * expired. A longer cookie carrying a dead token reads as a broken login.
 *
 * The distinction the kit has to make legible is **who the credential is for**.
 * An ID token is minted by Google *for the client* and lives an hour. A session
 * cookie is minted by Google *for your server*, on request, and lives up to two
 * weeks. They are different JWTs, with different issuers and different signing
 * keys — see the note in `session-cookie.ts`, which is the trap on the read
 * side. This module is the trap on the write side.
 *
 * **This module imports nothing from `firebase-admin`.** `createHqSessionCookie`
 * takes the caller's already-initialised `Auth` as a parameter, for the same
 * reason `gate.ts` returns a decision rather than a `NextResponse`: the kit is
 * imported by edge middleware, and `firebase-admin` is Node-only and heavy.
 * Depending on it here would pin every consumer's runtime to reuse three lines
 * of call. The three lines are not the valuable part — the policy is.
 */

/** The subset of `firebase-admin`'s `Auth` this module needs. */
export interface SessionCookieMinter {
  createSessionCookie(idToken: string, options: { expiresIn: number }): Promise<string>;
}

/** Cookie attributes, as a framework-neutral shape. */
export interface HqCookieOptions {
  name: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export const HQ_SESSION = {
  /** One name across projects, so the gate and the mint cannot disagree. */
  cookieName: "hq_session",

  /**
   * Firebase's ceiling, not a preference. `createSessionCookie` rejects
   * anything longer, and the failure is a runtime throw at sign-in — the worst
   * possible place to discover a constant.
   */
  maxExpiresInMs: 14 * DAY,

  /**
   * Firebase's floor, likewise.
   */
  minExpiresInMs: 5 * MINUTE,

  /**
   * What to ask for when the caller does not say — deliberately **not** the
   * ceiling.
   *
   * The gate reads the role out of the cookie payload, baked in at mint time,
   * and `verifySessionCookie` runs at the edge where `checkRevoked` cannot. So
   * the window is also how long a revoked or demoted account keeps working:
   * `revokeRefreshTokens` stops the client minting *new* tokens, but it does
   * not invalidate a session cookie already issued.
   *
   * Defaulting to the ceiling would mean every project inherits the most
   * permissive value by accident. Five days keeps an active session alive
   * without ever reaching a renewal — see `renewAfterFraction` — while cutting
   * the stale-authorization window by two thirds. A project that genuinely
   * wants fourteen can ask for it, and then owns that decision.
   */
  defaultExpiresInMs: 5 * DAY,

  /**
   * Re-mint once this fraction of the window is spent.
   *
   * Renewal, not duration, is what makes a session feel permanent: two weeks is
   * a ceiling per mint, but a session renewed whenever it is used never reaches
   * it. Half is early enough that a weekly visitor never signs in again, and
   * late enough that an active tab is not re-minting on every navigation.
   */
  renewAfterFraction: 0.5,
} as const;

/**
 * Clamps a requested lifetime into the range Firebase will actually issue.
 *
 * Clamps rather than throws. A project asking for 30 days has made a reasonable
 * request against an unreasonable API limit, and failing their sign-in over it
 * helps nobody — they get 14 days and `renewalDue` keeps it alive. Asking for
 * *less* than the floor is different in kind, but the same reasoning applies at
 * the point of failure: a session that is briefly too long is recoverable, and
 * a sign-in that throws is not.
 */
export function clampExpiresIn(expiresInMs: number): number {
  // NaN is the only genuinely unspecified value. Infinity means "as long as
  // you will give me", which the clamp below already answers correctly.
  if (Number.isNaN(expiresInMs)) return HQ_SESSION.defaultExpiresInMs;
  return Math.min(
    HQ_SESSION.maxExpiresInMs,
    Math.max(HQ_SESSION.minExpiresInMs, Math.floor(expiresInMs)),
  );
}

/**
 * Exchanges a verified Firebase ID token for a session cookie.
 *
 * **Verify the ID token and the allowlist before calling this.** Firebase
 * checks that the token is genuine and unexpired; it does not check that the
 * holder is allowed into your `/hq`. `decideFromClaims` is the other half, and
 * this function deliberately does not do it — a mint that silently enforced
 * authorization would make the gate look optional.
 */
export async function createHqSessionCookie(
  auth: SessionCookieMinter,
  idToken: string,
  expiresInMs: number = HQ_SESSION.defaultExpiresInMs,
): Promise<{ cookie: string; expiresInMs: number }> {
  const clamped = clampExpiresIn(expiresInMs);
  const cookie = await auth.createSessionCookie(idToken, { expiresIn: clamped });
  return { cookie, expiresInMs: clamped };
}

/**
 * Cookie attributes for the session cookie.
 *
 * Centralised because three projects setting `sameSite` three ways is a
 * difference nobody notices until one of them breaks a redirect flow.
 *
 * `sameSite: "lax"` rather than `"strict"`: the sign-in flow returns from
 * Google, and `strict` withholds the cookie on that first cross-site
 * navigation, so the visitor arrives signed in and reads as signed out.
 */
export function hqSessionCookieOptions(
  opts: { expiresInMs?: number; secure?: boolean; path?: string } = {},
): HqCookieOptions {
  const { expiresInMs = HQ_SESSION.defaultExpiresInMs, secure = true, path = "/" } = opts;
  return {
    name: HQ_SESSION.cookieName,
    httpOnly: true,
    secure,
    sameSite: "lax",
    path,
    maxAge: Math.floor(clampExpiresIn(expiresInMs) / 1000),
  };
}

/** Attributes that clear the cookie — same shape, zero lifetime. */
export function hqSessionClearOptions(
  opts: { secure?: boolean; path?: string } = {},
): HqCookieOptions {
  return { ...hqSessionCookieOptions(opts), maxAge: 0 };
}

/**
 * Whether a verified session is far enough through its life to re-mint.
 *
 * Reads `iat` and `exp` off the payload the gate already verified, so renewal
 * needs no extra state and no second store to keep consistent.
 *
 * A payload missing either claim returns `false`: an unreadable window is not
 * evidence that renewal is due, and re-minting on every request would turn a
 * missing claim into a sign-in storm.
 */
export function renewalDue(payload: Pick<JWTPayload, "iat" | "exp">, now = Date.now()): boolean {
  const { iat, exp } = payload;
  if (typeof iat !== "number" || typeof exp !== "number" || exp <= iat) return false;

  const lifetimeMs = (exp - iat) * 1000;
  const spentMs = now - iat * 1000;
  return spentMs >= lifetimeMs * HQ_SESSION.renewAfterFraction;
}
