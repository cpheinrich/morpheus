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
export declare const Role: z.ZodEnum<{
    admin: "admin";
    investor: "investor";
    employee: "employee";
}>;
export type Role = z.infer<typeof Role>;
export { ROLES, HQ_ROLES, canAccessHq, isAdmin, isRole } from "../hq/roles.js";
export declare const AccessEntry: z.ZodObject<{
    email: z.ZodEmail;
    role: z.ZodEnum<{
        admin: "admin";
        investor: "investor";
        employee: "employee";
    }>;
}, z.core.$strip>;
export type AccessEntry = z.infer<typeof AccessEntry>;
/** The `hq` block of morpheus.json. */
export declare const HqConfig: z.ZodObject<{
    route: z.ZodDefault<z.ZodString>;
    allowlist: z.ZodDefault<z.ZodArray<z.ZodEmail>>;
    investorAllowlist: z.ZodDefault<z.ZodArray<z.ZodEmail>>;
    admins: z.ZodDefault<z.ZodArray<z.ZodEmail>>;
}, z.core.$strip>;
export type HqConfig = z.infer<typeof HqConfig>;
export declare const SupportEmail: z.ZodEmail;
export declare const AuthorizedDomain: z.ZodString;
export declare const ProjectManifest: z.ZodObject<{
    name: z.ZodString;
    prefix: z.ZodOptional<z.ZodString>;
    displayName: z.ZodOptional<z.ZodString>;
    publicDomain: z.ZodOptional<z.ZodString>;
    supportEmail: z.ZodOptional<z.ZodEmail>;
    authorizedDomains: z.ZodDefault<z.ZodArray<z.ZodString>>;
    hq: z.ZodObject<{
        route: z.ZodDefault<z.ZodString>;
        allowlist: z.ZodDefault<z.ZodArray<z.ZodEmail>>;
        investorAllowlist: z.ZodDefault<z.ZodArray<z.ZodEmail>>;
        admins: z.ZodDefault<z.ZodArray<z.ZodEmail>>;
    }, z.core.$strip>;
    accounts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
export type ProjectManifest = z.infer<typeof ProjectManifest>;
/**
 * Flatten the three lists into one email→role mapping.
 *
 * Most privileged wins, so listing someone in both `admins` and `allowlist`
 * is not an error — it is the common case, since an admin is also an employee.
 */
export declare function resolveEntries(hq: HqConfig): AccessEntry[];
