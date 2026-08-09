import { type LeasePolicy } from "./lease.js";
/**
 * Resolve this project's required set.
 *
 * **Never returns `[]` from a missing, blank or unparseable manifest** — that
 * is the one value that switches coverage off, and reaching it by accident
 * would hand every generated project a check that passes for a session that
 * read nothing. A project that genuinely has no canonical records has to say
 * `"requiredInputs": []` on purpose, which this preserves.
 */
export interface ProjectContext extends LeasePolicy {
    /** `undefined` means undeclared — `resolveTrunk` asks `origin/HEAD` then. */
    trunk?: string;
    /**
     * Entries of `requiredInputs` that were not strings and so are not in the
     * required set. Surfaced rather than dropped: it lands on the project that
     * was trying to *add* records, which is the only reason the field exists,
     * and coverage narrowing silently is the same shape as coverage switching
     * off silently.
     */
    droppedInputs?: string[];
}
export declare function projectPolicy(root: string): Promise<ProjectContext>;
/**
 * Session identity is the worktree, because CLAUDE.md already mandates one
 * worktree per parallel session — so two agents cannot share an id, and one
 * agent resuming in the same checkout keeps its own. Hashed rather than
 * slugged so the filename cannot collide or leak a path.
 */
export declare function sessionId(worktree: string): string;
