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
     * permissive value by accident, so this is five days — cutting that window by
     * two thirds.
     *
     * **What exceeding it costs is a redirect, not a sign-in.** Renewal in place
     * needs an open tab, so a longer absence does expire the cookie — but the
     * browser still holds its refresh token, so the visitor bounces through the
     * sign-in page, the client loop posts a fresh ID token, and the route
     * re-mints. Google reappears only if that refresh token was revoked or
     * cleared.
     *
     * That is why short is the right default: a longer window trades a longer
     * stale-authorization exposure for the removal of one redirect. A project
     * that wants the redirect gone passes ten days or so and owns the trade.
     */
    defaultExpiresInMs: 5 * DAY,
    /**
     * Re-mint once this fraction of the window is spent.
     *
     * Half is late enough that an active tab is not re-minting on every
     * navigation, and early enough that any visit in the second half of the
     * window resets it — so a returning visitor is renewed rather than merely
     * admitted. What it cannot do is extend a window nobody was there for; that
     * is `defaultExpiresInMs`'s job, and the two are often confused.
     */
    renewAfterFraction: 0.5,
};
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
export function clampExpiresIn(expiresInMs) {
    // NaN is the only genuinely unspecified value. Infinity means "as long as
    // you will give me", which the clamp below already answers correctly.
    if (Number.isNaN(expiresInMs))
        return HQ_SESSION.defaultExpiresInMs;
    return Math.min(HQ_SESSION.maxExpiresInMs, Math.max(HQ_SESSION.minExpiresInMs, Math.floor(expiresInMs)));
}
/**
 * Exchanges a verified Firebase ID token for a session cookie.
 *
 * **Verify the ID token and the allowlist before calling this.** Firebase
 * checks that the token is genuine and unexpired; it does not check that the
 * holder is allowed into your `/hq`. `decideFromClaims` is the other half, and
 * this function deliberately does not do it — a mint that silently enforced
 * authorization would make the gate look optional.
 *
 * Returns `value` rather than `cookie` on purpose: it is the cookie's *value*,
 * and `HqCookieOptions` is `ResponseCookie` minus exactly that field, so the
 * two spread together into the call that works:
 *
 * ```ts
 * response.cookies.set({ ...hqSessionCookieOptions({ expiresInMs }), value });
 * ```
 */
export async function createHqSessionCookie(auth, idToken, expiresInMs = HQ_SESSION.defaultExpiresInMs) {
    const clamped = clampExpiresIn(expiresInMs);
    const value = await auth.createSessionCookie(idToken, { expiresIn: clamped });
    return { value, expiresInMs: clamped };
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
export function hqSessionCookieOptions(opts = {}) {
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
/**
 * Attributes that clear the cookie — same shape, zero lifetime.
 *
 * Spread the same way as the mint, with an empty value:
 *
 * ```ts
 * response.cookies.set({ ...hqSessionClearOptions(), value: "" });
 * ```
 *
 * `HqCookieOptions` omits `value` on purpose, so a bare
 * `set(hqSessionClearOptions())` does not typecheck. **Do not reach for
 * `cookies.delete("hq_session")` instead** — a hardcoded name is exactly the
 * drift `HQ_SESSION.cookieName` exists to prevent, and sign-out is the worst
 * place to keep a name that can disagree with the gate's.
 */
export function hqSessionClearOptions(opts = {}) {
    return { ...hqSessionCookieOptions(opts), maxAge: 0 };
}
/**
 * Whether a verified session is far enough through its life to re-mint.
 *
 * Reads `iat` and `exp` off the payload the gate already verified, so renewal
 * needs no extra state and no second store to keep consistent. `SessionClaims`
 * carries both, so this composes directly with a gate decision.
 *
 * **Call it on the session route, not in middleware.** The re-mint needs the
 * Admin `Auth` and a fresh ID token, and middleware has neither — there is no
 * server-side path from a session cookie back to an ID token, and
 * `firebase-admin` cannot run at the edge. The session route is the only place
 * the cookie, the token and the Admin SDK exist at once:
 *
 * ```ts
 * const decision = await decideHqAccess({ cookie, projectId });
 * if (decision.kind === "allow" && !renewalDue(decision.claims)) {
 *   return Response.json({ ok: true });   // still fresh; don't re-mint
 * }
 * const { value, expiresInMs } = await createHqSessionCookie(adminAuth, idToken);
 * ```
 *
 * What this buys, given the client re-posts on every `onIdTokenChanged` —
 * roughly hourly — is a **rate limit on re-minting**. Without it the route
 * re-mints sixty times a day. The client loop is what keeps the session alive;
 * this is what keeps that loop cheap.
 *
 * A payload missing either claim — or carrying `null`, which is how
 * `toClaims` reports one that was absent — returns `false`. An unreadable
 * window is not evidence that renewal is due, and re-minting on every request
 * would turn a missing claim into a sign-in storm.
 */
export function renewalDue(payload, now = Date.now()) {
    const { iat, exp } = payload;
    if (typeof iat !== "number" || typeof exp !== "number" || exp <= iat)
        return false;
    const lifetimeMs = (exp - iat) * 1000;
    const spentMs = now - iat * 1000;
    return spentMs >= lifetimeMs * HQ_SESSION.renewAfterFraction;
}
//# sourceMappingURL=session.js.map