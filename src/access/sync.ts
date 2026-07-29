import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AccessEntry } from "./schema.js";

const exec = promisify(execFile);

/**
 * Apply the allowlist to Firebase Auth custom claims.
 *
 * Uses the Identity Toolkit REST API with a gcloud access token rather than a
 * service-account key — the org enforces `disableServiceAccountKeyCreation`,
 * and a key on disk would be a credential to protect for no benefit.
 *
 * A user only exists in Firebase Auth after their first sign-in, so anyone who
 * has not signed in yet is reported as pending rather than treated as an error.
 * Re-running after they sign in completes the grant, which makes this safe to
 * run on every deploy.
 */

export type SyncOutcome = "granted" | "unchanged" | "pending" | "revoked";

export interface SyncResult {
  email: string;
  role?: string;
  outcome: SyncOutcome;
  detail?: string;
}

async function accessToken(): Promise<string> {
  const { stdout } = await exec("gcloud", ["auth", "print-access-token"]);
  return stdout.trim();
}

interface IdpUser {
  localId: string;
  email: string;
  customAttributes?: string;
}

async function idtk<T>(
  path: string,
  project: string,
  token: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${project}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": project,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "Identity Toolkit request failed");
  return json;
}

/** Look up users by email. Missing users are simply absent from the result. */
export async function lookupUsers(
  project: string,
  token: string,
  emails: string[],
): Promise<Map<string, IdpUser>> {
  if (emails.length === 0) return new Map();
  const { users = [] } = await idtk<{ users?: IdpUser[] }>(
    "/accounts:lookup",
    project,
    token,
    { email: emails },
  );
  return new Map(users.map((u) => [u.email.toLowerCase(), u]));
}

function currentRole(user: IdpUser): string | undefined {
  if (!user.customAttributes) return undefined;
  try {
    return (JSON.parse(user.customAttributes) as { role?: string }).role;
  } catch {
    return undefined;
  }
}

export interface SyncOptions {
  project: string;
  entries: AccessEntry[];
  /** Strip the role from users who exist but are no longer listed. */
  revokeUnlisted?: boolean;
  dryRun?: boolean;
}

export async function syncAccess(opts: SyncOptions): Promise<SyncResult[]> {
  const { project, entries, revokeUnlisted = true, dryRun = false } = opts;
  const token = await accessToken();
  const results: SyncResult[] = [];

  const wanted = new Map(entries.map((e) => [e.email.toLowerCase(), e.role]));
  const existing = await lookupUsers(project, token, [...wanted.keys()]);

  for (const [email, role] of wanted) {
    const user = existing.get(email);
    if (!user) {
      results.push({
        email,
        role,
        outcome: "pending",
        detail: "has not signed in yet — claim applies on next sync",
      });
      continue;
    }
    if (currentRole(user) === role) {
      results.push({ email, role, outcome: "unchanged" });
      continue;
    }
    if (!dryRun) {
      await idtk("/accounts:update", project, token, {
        localId: user.localId,
        customAttributes: JSON.stringify({ role }),
      });
    }
    results.push({ email, role, outcome: "granted" });
  }

  if (revokeUnlisted) {
    // Anyone holding a role who is no longer listed loses it. This is the half
    // that makes the allowlist authoritative rather than merely additive.
    const all = await idtk<{ users?: IdpUser[] }>("/accounts:query", project, token, {});
    for (const user of all.users ?? []) {
      const email = user.email?.toLowerCase();
      if (!email || wanted.has(email)) continue;
      if (!currentRole(user)) continue;
      if (!dryRun) {
        await idtk("/accounts:update", project, token, {
          localId: user.localId,
          customAttributes: JSON.stringify({}),
        });
      }
      results.push({ email, outcome: "revoked", detail: "no longer in the allowlist" });
    }
  }

  return results;
}
