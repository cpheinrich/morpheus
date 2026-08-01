import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isLegacyId, itemFilename, migratedId, parseRoadmapId } from "./id.js";

/**
 * Migrate integer roadmap ids to the dated scheme (MO-057).
 *
 * `MO-045` created 2026-07-29 becomes `MO-2026-07-29-045`: the item's **own**
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

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

function field(fm: string, name: string): string | null {
  const m = new RegExp(`^${name}:\\s*"?(.+?)"?\\s*$`, "m").exec(fm);
  return m ? m[1]! : null;
}

/**
 * Work out every rename without touching disk, so the plan can be inspected,
 * counted and order-checked before anything is moved.
 */
export async function planMigration(roadmapDir: string): Promise<MigrationPlan> {
  const renames: Rename[] = [];
  const skipped: string[] = [];
  const problems: string[] = [];

  const files = (await readdir(roadmapDir)).filter(
    (f) => f.endsWith(".md") && f !== "README.md",
  );

  for (const file of files.sort()) {
    const text = await readFile(join(roadmapDir, file), "utf8");
    const fm = FRONTMATTER.exec(text)?.[1];
    if (!fm) {
      problems.push(`${file}: no frontmatter`);
      continue;
    }

    const id = field(fm, "id");
    const title = field(fm, "title");
    const created = field(fm, "created");

    if (!id || !title) {
      problems.push(`${file}: missing id or title`);
      continue;
    }
    if (parseRoadmapId(id)) {
      skipped.push(id); // already dated — a timestamp id or a previous run
      continue;
    }

    const num = /-(\d+)$/.exec(id)?.[1];
    if (!num) {
      problems.push(`${file}: id ${id} is not an integer scheme`);
      continue;
    }
    if (!created || !/^\d{4}-\d{2}-\d{2}/.test(created)) {
      // Without a real creation date the new id would be a fabrication, and a
      // fabricated date is worse than a failed migration: it reads as fact.
      problems.push(`${file}: ${id} has no usable "created:" date`);
      continue;
    }

    const prefix = /^([A-Z]{2,4})-/.exec(id)?.[1];
    if (!prefix) {
      problems.push(`${file}: ${id} has no project prefix`);
      continue;
    }

    const newId = migratedId(prefix, created, Number(num));
    renames.push({ oldId: id, newId, oldFile: file, newFile: itemFilename(newId, title) });
  }

  return { renames, skipped, problems };
}

/**
 * The relative order of items must be identical before and after.
 *
 * Compares the old sequence (by integer) against the new (by id string) and
 * reports every pair that swapped. Returns an empty array when order held.
 */
export function verifyOrder(renames: Rename[]): string[] {
  const byOld = [...renames].sort(
    (a, b) => Number(/-(\d+)$/.exec(a.oldId)![1]) - Number(/-(\d+)$/.exec(b.oldId)![1]),
  );
  const byNew = [...renames].sort((a, b) => a.newId.localeCompare(b.newId));

  const problems: string[] = [];
  for (let i = 0; i < byOld.length; i++) {
    if (byOld[i]!.oldId !== byNew[i]!.oldId) {
      problems.push(`position ${i}: was ${byOld[i]!.oldId}, now ${byNew[i]!.oldId}`);
    }
  }
  return problems;
}

/** The note a migrated item carries, so the rename is legible in the file. */
export function migrationNote(oldId: string, newId: string): string {
  return `> Migrated from \`${oldId}\` to \`${newId}\` (MO-057). References to \`${oldId}\` in git\n> history, commit messages and merged pull requests still resolve — the old number is\n> the last field of the new id.`;
}

export interface MigrationResult extends MigrationPlan {
  /** Ids whose files were rewritten and renamed. */
  applied: string[];
}

/**
 * Apply a plan: rewrite `id:`, insert the note, and rename the file.
 *
 * Refuses outright if `verifyOrder` finds a swap, rather than migrating and
 * reporting afterwards. A board whose order silently changed is worse than one
 * that was not migrated, and this is the only moment the check is cheap.
 */
export async function migrate(roadmapDir: string, dryRun = false): Promise<MigrationResult> {
  const plan = await planMigration(roadmapDir);

  const disorder = verifyOrder(plan.renames);
  if (disorder.length) {
    throw new Error(`Migration would reorder the board:\n  ${disorder.join("\n  ")}`);
  }

  const applied: string[] = [];
  if (dryRun) return { ...plan, applied };

  for (const r of plan.renames) {
    const path = join(roadmapDir, r.oldFile);
    let text = await readFile(path, "utf8");

    text = text.replace(/^id:\s*.+$/m, `id: ${r.newId}`);

    // The note goes immediately after the frontmatter, where a reader lands.
    const end = text.indexOf("\n---", 3);
    const cut = text.indexOf("\n", end + 4) + 1;
    text = `${text.slice(0, cut)}\n${migrationNote(r.oldId, r.newId)}\n${text.slice(cut)}`;

    await writeFile(path, text, "utf8");
    if (r.newFile !== r.oldFile) await rename(path, join(roadmapDir, r.newFile));
    applied.push(r.newId);
  }

  return { ...plan, applied };
}

export { isLegacyId };
