import { importX509, jwtVerify } from "jose";
import { isRole } from "./roles.js";
/**
 * Edge-safe verification of a Firebase session cookie.
 *
 * `firebase-admin` cannot run in Next.js middleware — it needs Node built-ins
 * the Edge runtime does not provide. So the gate verifies the cookie itself,
 * against the same Google-published certificates the Admin SDK uses. That keeps
 * the role check at the edge rather than deferring every decision to a server
 * component, which is what makes the middleware a real gate rather than a
 * redirect for unauthenticated users.
 *
 * **Session cookies are signed with a different key set than ID tokens, and
 * carry a different issuer.** Using the ID-token keys here fails to verify
 * every cookie, silently — every user reads as signed out, which looks like a
 * broken login rather than a wrong constant.
 */
const SESSION_COOKIE_CERT_URL = "https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys";
let cache = null;
/**
 * Google returns X.509 certificates keyed by `kid`, not a JWKS document, so
 * `createRemoteJWKSet` cannot be pointed at this URL. The cache honours the
 * endpoint's own `max-age`; these certificates rotate roughly daily.
 */
async function getCertificates() {
    if (cache && cache.expiresAt > Date.now())
        return cache.keys;
    const response = await fetch(SESSION_COOKIE_CERT_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch session cookie certificates: ${response.status}`);
    }
    const certificates = (await response.json());
    const keys = new Map();
    for (const [kid, pem] of Object.entries(certificates)) {
        keys.set(kid, await importX509(pem, "RS256"));
    }
    const maxAge = /max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "");
    const ttlMs = maxAge ? Number(maxAge[1]) * 1000 : 60 * 60 * 1000;
    cache = { keys, expiresAt: Date.now() + ttlMs };
    return keys;
}
/** Exported for tests — certificate rotation must not leak between cases. */
export function resetCertificateCache() {
    cache = null;
}
/**
 * Exported for tests: the payload-to-claims mapping is worth pinning down.
 *
 * A payload carrying a role this build does not recognise maps to `role: null`
 * rather than passing the string through. An unknown role must fail closed —
 * `canAccessHq` would reject it anyway, but a `null` says so at the boundary
 * instead of leaving an unrecognised string travelling through the app.
 */
export function toClaims(payload) {
    const uid = typeof payload.sub === "string" ? payload.sub : null;
    if (!uid)
        return null;
    return {
        uid,
        email: typeof payload.email === "string" ? payload.email : null,
        role: isRole(payload.role) ? payload.role : null,
        iat: typeof payload.iat === "number" ? payload.iat : null,
        exp: typeof payload.exp === "number" ? payload.exp : null,
    };
}
/**
 * Returns the claims, or `null` for any cookie that is missing, malformed,
 * expired, or signed by something other than Google for this project.
 *
 * Never throws on an untrusted cookie — a bad cookie is a signed-out user, and
 * a gate that throws on hostile input is a gate that 500s under attack.
 */
export async function verifySessionCookie(cookie, projectId) {
    if (!cookie)
        return null;
    try {
        const keys = await getCertificates();
        const { payload } = await jwtVerify(cookie, async (header) => {
            const key = header.kid ? keys.get(header.kid) : undefined;
            if (!key)
                throw new Error(`Unknown key id: ${header.kid}`);
            return key;
        }, {
            issuer: `https://session.firebase.google.com/${projectId}`,
            audience: projectId,
            algorithms: ["RS256"],
        });
        return toClaims(payload);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=session-cookie.js.map