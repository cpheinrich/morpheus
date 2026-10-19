export interface CleanupResult {
    path: string;
    branch?: string;
    pr?: number;
    dryRun: boolean;
}
/** All irreversible operations follow fresh, exact PR evidence; ancestry to trunk alone is insufficient. */
export declare function cleanupTask(cwd: string, productDir: string, id: string, dryRun?: boolean, releaseStaleSessions?: boolean): Promise<CleanupResult>;
/** Local inventory: no fetch, no deletion. Missing directories are registrations, not completed tasks. */
export declare function worktreeStatus(cwd: string): Promise<string[]>;
/** Git alone prunes missing registrations; never delete branches or live directories. */
export declare function pruneStaleWorktrees(cwd: string, dryRun?: boolean): Promise<string>;
