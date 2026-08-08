import { canAccessHq } from "./roles.js";
import { verifySessionCookie, type SessionClaims } from "./session-cookie.js";

/**
 * The `/hq` access decision, with no framework in it.
 *
 * Deliberately not a Next.js middleware. The kit would then depend on Next,
 * which pins every consuming project to one framework and one major version to
 * reuse forty lines of logic — and the logic is the part worth sharing, not the
 * `NextResponse` calls. A project adapts this in about fifteen lines:
 *
 * ```ts
 * // apps/web/proxy.ts
 * export default async function proxy(request: NextRequest) {
 *   const decision = await decideHqAccess({
 *     cookie: request.cookies.get(HQ_SESSION.cookieName)?.value,
 *     projectId: PROJECT_ID,
 *   });
 *
 *   switch (decision.kind) {
 *     case "allow":
 *       return NextResponse.next();
 *     case "sign-in": {
 *       const url = new URL(decision.path, request.url);
 *       url.searchParams.set("next", request.nextUrl.pathname);
 *       return NextResponse.redirect(url);
 *     }
 *     case "no-access":
 *       return NextResponse.rewrite(new URL(decision.path, request.url), { status: 403 });
 *   }
 * }
 *
 * // Excludes the no-access page itself, which the rewrite targets and which
 * // must stay reachable for a signed-in user without a role.
 * export const config = { matcher: ["/hq((?!/no-access).*)"] };
 * ```
 */

export interface HqGateOptions {
  /** The raw session cookie value, or undefined when absent. */
  cookie: string | undefined;
  /** The Firebase project id — the cookie's expected issuer and audience. */
  projectId: string;
  /** Where to send someone who is not signed in. */
  signInPath?: string;
  /** Where to send someone signed in without an `/hq` role. */
  noAccessPath?: string;
}

export type HqDecision =
  | { kind: "allow"; claims: SessionClaims }
  /** No valid session at all. Send them to sign in. */
  | { kind: "sign-in"; path: string }
  /**
   * Signed in and genuine, but without an `/hq` role — an investor, say.
   * Distinct from `sign-in` because redirecting them there would loop: they
   * are already signed in, so signing in again changes nothing.
   */
  | { kind: "no-access"; path: string; claims: SessionClaims };

/**
 * The decision itself, once the cookie has been verified.
 *
 * Split out from `decideHqAccess` so the branching is testable without a
 * signed cookie: verifying one for real needs Google's private key, and a test
 * that stubs the verifier proves only that the stub was called.
 */
export function decideFromClaims(
  claims: SessionClaims | null,
  opts: Pick<HqGateOptions, "signInPath" | "noAccessPath"> = {},
): HqDecision {
  const { signInPath = "/sign-in", noAccessPath = "/hq/no-access" } = opts;

  if (!claims) return { kind: "sign-in", path: signInPath };
  if (!canAccessHq(claims.role)) return { kind: "no-access", path: noAccessPath, claims };
  return { kind: "allow", claims };
}

export async function decideHqAccess(opts: HqGateOptions): Promise<HqDecision> {
  const claims = await verifySessionCookie(opts.cookie, opts.projectId);
  return decideFromClaims(claims, opts);
}
