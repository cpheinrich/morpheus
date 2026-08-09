import type { AccessEntry } from "./schema.js";
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
interface IdpUser {
    localId: string;
    email: string;
    customAttributes?: string;
}
/** Look up users by email. Missing users are simply absent from the result. */
export declare function lookupUsers(project: string, token: string, emails: string[]): Promise<Map<string, IdpUser>>;
export interface SyncOptions {
    project: string;
    entries: AccessEntry[];
    /** Strip the role from users who exist but are no longer listed. */
    revokeUnlisted?: boolean;
    dryRun?: boolean;
}
export declare function syncAccess(opts: SyncOptions): Promise<SyncResult[]>;
export {};
