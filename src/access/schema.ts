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
 */

export const Role = z.enum(["admin", "employee", "investor"]);
export type Role = z.infer<typeof Role>;

/** Roles that may reach /hq at all, most privileged first. */
export const HQ_ROLES: Role[] = ["admin", "employee"];

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

/** True when a role may reach /hq. */
export function canAccessHq(role: string | undefined): boolean {
  return HQ_ROLES.includes(role as Role);
}
