import { z } from "zod";
/**
 * Access control as code.
 *
 * The allowlist in `morpheus.json` is the source of truth: it is in git,
 * reviewable in a pull request, and diffable. `morpheus access sync` applies
 * it to Firebase custom claims, so granting someone access is a commit rather
 * than a console click.
 *
 * Claims are what make this work in two places at once — the same `role` gates
 * the Next.js middleware *and* the Firestore security rules. A network-layer
 * gate could only do the first.
 *
 * The vocabulary itself lives in `hq/roles.ts` and is imported rather than
 * restated: this module *writes* claims and the gates *read* them, so a
 * divergence here would grant a role nothing downstream recognises.
 */
export declare const Role: any;
export type Role = z.infer<typeof Role>;
export { ROLES, HQ_ROLES, canAccessHq, isAdmin, isRole } from "../hq/roles.js";
export declare const AccessEntry: any;
export type AccessEntry = z.infer<typeof AccessEntry>;
/** The `hq` block of morpheus.json. */
export declare const HqConfig: any;
export type HqConfig = z.infer<typeof HqConfig>;
export declare const SupportEmail: any;
export declare const AuthorizedDomain: any;
export declare const ProjectManifest: any;
export type ProjectManifest = z.infer<typeof ProjectManifest>;
/**
 * Flatten the three lists into one email→role mapping.
 *
 * Most privileged wins, so listing someone in both `admins` and `allowlist`
 * is not an error — it is the common case, since an admin is also an employee.
 */
export declare function resolveEntries(hq: HqConfig): AccessEntry[];
