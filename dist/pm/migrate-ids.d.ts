import { isLegacyId } from "./id.js";
/**
 * Migrate integer roadmap ids to the dated scheme (MO-057).
 *
 * `MO-045` created 2026-07-29 becomes `MO-26-07-29-045`: the item's **own**
 * creation date plus its old number. Using the migration date instead would
 * collapse every item onto one day and destroy the chronology the scheme exists
 * to record, and dropping the old number would break `grep MO-045` against a
 * git history that cannot be rewritten.
 *
 * Ordering is therefore preserved by construction rather than by care — the new
 * id sorts by real date, then by the old sequence within a day. `verifyOrder`
 * checks it anyway, because "by construction" is a claim and this rewrites
 * every item in the repo.
 */
export interface Rename {
    oldId: string;
    newId: string;
    oldFile: string;
    newFile: string;
}
export interface MigrationPlan {
    renames: Rename[];
    /** Items already migrated or already timestamped — left alone. */
    skipped: string[];
    /** Items that could not be read or lack a `created:` date. */
    problems: string[];
}
/**
 * Work out every rename without touching disk, so the plan can be inspected,
 * counted and order-checked before anything is moved.
 */
export declare function planMigration(roadmapDir: string): Promise<MigrationPlan>;
/**
 * The relative order of items must be identical before and after.
 *
 * Compares the old sequence (by integer) against the new (by id string) and
 * reports every pair that swapped. Returns an empty array when order held.
 */
export declare function verifyOrder(renames: Rename[]): string[];
/** The note a migrated item carries, so the rename is legible in the file. */
export declare function migrationNote(oldId: string, newId: string): string;
export interface MigrationResult extends MigrationPlan {
    /** Ids whose files were rewritten and renamed. */
    applied: string[];
    /** Files elsewhere whose `roadmap:` reference was repointed. */
    referencesUpdated: string[];
    /** Files whose relative markdown links were repaired. */
    linksUpdated: string[];
}
/**
 * Repoint `roadmap:` frontmatter elsewhere in the repo.
 *
 * Worklog entries carry `roadmap: MO-052`, which is a *structured* reference,
 * not prose — a tool resolving it would find nothing after the rename. Prose
 * mentions are deliberately left alone: the old number is the last field of the
 * new id, so `grep MO-052` still finds it, and rewriting narrative text in
 * historical records would be editing the past rather than repairing a link.
 */
/**
 * Repair relative markdown links that point at a renamed item.
 *
 * `[DW-002](../roadmap/DW-002.md)` becomes
 * `[DW-002](../roadmap/DW-26-07-29-002-slug.md)`. The **link text is left
 * alone** — that is prose, and the old number is still the last field of the
 * new id, so it still reads correctly and still greps.
 *
 * This was missed on the first pass. Worklog `roadmap:` frontmatter was
 * repaired but markdown links were not, and Morpheus shipped a migration with
 * 28 dangling links because it has no test asserting they resolve. Darwin does,
 * which is the only reason it surfaced.
 */
export declare function updateLinks(roots: string[], renames: Rename[]): Promise<string[]>;
export declare function updateReferences(dir: string, renames: Rename[]): Promise<string[]>;
/**
 * Apply a plan: rewrite `id:`, insert the note, and rename the file.
 *
 * Refuses outright if `verifyOrder` finds a swap, rather than migrating and
 * reporting afterwards. A board whose order silently changed is worse than one
 * that was not migrated, and this is the only moment the check is cheap.
 */
export declare function migrate(roadmapDir: string, dryRun?: boolean, 
/**
 * Where worklog entries live. Passed in rather than derived from
 * `roadmapDir` — a `../../..` walk is right for a real repo and silently
 * wrong anywhere else, which is how the first version passed its own test
 * while updating nothing.
 */
worklogDir?: string, 
/** Directory trees to scan for relative markdown links, e.g. `hq/`, `.agent/`. */
linkRoots?: string[]): Promise<MigrationResult>;
export { isLegacyId };
