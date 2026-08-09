import { type JWTPayload } from "jose";
import { type Role } from "./roles.js";
export interface SessionClaims {
    uid: string;
    email: string | null;
    role: Role | null;
    /**
     * The verified window, in seconds — what `renewalDue` reads.
     *
     * Carried rather than dropped because renewal is meant to need no second
     * store: a consumer holding a decision has already paid for this
     * verification, and projecting it away would leave them re-verifying the
     * same cookie to recover two numbers, or decoding it unverified. Either is
     * the second clock the design exists to avoid.
     */
    iat: number | null;
    exp: number | null;
}
/** Exported for tests — certificate rotation must not leak between cases. */
export declare function resetCertificateCache(): void;
/**
 * Exported for tests: the payload-to-claims mapping is worth pinning down.
 *
 * A payload carrying a role this build does not recognise maps to `role: null`
 * rather than passing the string through. An unknown role must fail closed —
 * `canAccessHq` would reject it anyway, but a `null` says so at the boundary
 * instead of leaving an unrecognised string travelling through the app.
 */
export declare function toClaims(payload: JWTPayload): SessionClaims | null;
/**
 * Returns the claims, or `null` for any cookie that is missing, malformed,
 * expired, or signed by something other than Google for this project.
 *
 * Never throws on an untrusted cookie — a bad cookie is a signed-out user, and
 * a gate that throws on hostile input is a gate that 500s under attack.
 */
export declare function verifySessionCookie(cookie: string | undefined, projectId: string): Promise<SessionClaims | null>;
