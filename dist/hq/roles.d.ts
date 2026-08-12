/**
 * The role vocabulary — the one fact `/hq` access is derived from.
 *
 * A single `role` custom claim on a Firebase user gates three things that would
 * otherwise be three separately-maintained systems:
 *
 * | Reader | Where | Derives from |
 * |---|---|---|
 * | The claim writer | `access/schema.ts` → `morpheus access sync` | `Role` |
 * | The route gate | a project's `proxy.ts` | `canAccessHq` |
 * | The data gate | a project's `firestore.rules` | `renderFirestoreRules` |
 *
 * That is the whole reason `/hq` is not on Auth.js or Cloudflare Zero Trust.
 * Both are network-layer gates: they can stop someone loading `/hq`, but not a
 * Firestore read, so either would still need a second rule system underneath.
 *
 * **This module has no dependencies on purpose.** It is imported by the Node
 * CLI and by edge middleware, and anything it pulls in becomes an edge-runtime
 * constraint. The zod schema in `access/schema.ts` is built *from* these values
 * rather than restating them — Darwin's copy of this file carried a comment
 * asking the next reader to keep two lists identical by hand, and an invariant
 * a comment is asking for is one the code should be enforcing.
 */
export declare const ROLES: readonly ["admin", "employee", "investor"];
export type Role = (typeof ROLES)[number];
export declare function isRole(value: unknown): value is Role;
/**
 * Roles that may reach `/hq` at all, most privileged first.
 *
 * `investor` is deliberately absent. The investor surface is a separate route
 * with its own allowlist, and conflating the two is how an investor ends up
 * reading supplier terms.
 */
export declare const HQ_ROLES: readonly Role[];
/** True when a role may reach `/hq`. Unknown and absent roles are both false. */
export declare function canAccessHq(role: string | null | undefined): boolean;
/** True for `admin` only — the write role. */
export declare function isAdmin(role: string | null | undefined): boolean;
