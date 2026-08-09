import { canAccessHq } from "./roles.js";
import { verifySessionCookie } from "./session-cookie.js";
/**
 * The decision itself, once the cookie has been verified.
 *
 * Split out from `decideHqAccess` so the branching is testable without a
 * signed cookie: verifying one for real needs Google's private key, and a test
 * that stubs the verifier proves only that the stub was called.
 */
export function decideFromClaims(claims, opts = {}) {
    const { signInPath = "/sign-in", noAccessPath = "/hq/no-access" } = opts;
    if (!claims)
        return { kind: "sign-in", path: signInPath };
    if (!canAccessHq(claims.role))
        return { kind: "no-access", path: noAccessPath, claims };
    return { kind: "allow", claims };
}
export async function decideHqAccess(opts) {
    const claims = await verifySessionCookie(opts.cookie, opts.projectId);
    return decideFromClaims(claims, opts);
}
//# sourceMappingURL=gate.js.map