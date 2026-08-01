import { z } from "zod";
import { ROLES } from "../hq/roles.js";

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

export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;

export { ROLES, HQ_ROLES, canAccessHq, isAdmin, isRole } from "../hq/roles.js";

export const AccessEntry = z.object({
  email: z.email(),
  role: Role,
});
export type AccessEntry = z.infer<typeof AccessEntry>;

/** The `hq` block of morpheus.json. */
export const HqConfig = z.object({
  route: z.string().startsWith("/").default("/hq"),
  /** Emails granted `employee`. */
  allowlist: z.array(z.email()).default([]),
  /** Emails granted `investor` — a strictly smaller surface. */
  investorAllowlist: z.array(z.email()).default([]),
  /** Emails granted `admin`. Implies employee. */
  admins: z.array(z.email()).default([]),
});
export type HqConfig = z.infer<typeof HqConfig>;

export const ProjectManifest = z.object({
  name: z.string(),
  /** 2-4 uppercase letters; namespaces every id in this repo. */
  prefix: z.string().regex(/^[A-Z]{2,4}$/).optional(),
  displayName: z.string().optional(),
  hq: HqConfig,
  accounts: z.record(z.string(), z.string()).optional(),
});
export type ProjectManifest = z.infer<typeof ProjectManifest>;

/**
 * Flatten the three lists into one email→role mapping.
 *
 * Most privileged wins, so listing someone in both `admins` and `allowlist`
 * is not an error — it is the common case, since an admin is also an employee.
 */
export function resolveEntries(hq: HqConfig): AccessEntry[] {
  const byEmail = new Map<string, Role>();

  for (const email of hq.investorAllowlist) byEmail.set(email.toLowerCase(), "investor");
  for (const email of hq.allowlist) byEmail.set(email.toLowerCase(), "employee");
  for (const email of hq.admins) byEmail.set(email.toLowerCase(), "admin");

  return [...byEmail].map(([email, role]) => ({ email, role }));
}
