import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isLegacyId, itemFilename, migratedId, parseRoadmapId } from "./id.js";
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
function field(fm, name) {
    const m = new RegExp(`^${name}:\\s*"?(.+?)"?\\s*$`, "m").exec(fm);
    return m ? m[1] : null;
}
/**
 * Work out every rename without touching disk, so the plan can be inspected,
 * counted and order-checked before anything is moved.
 */
export async function planMigration(roadmapDir) {
    const renames = [];
    const skipped = [];
    const problems = [];
    const files = (await readdir(roadmapDir)).filter((f) => f.endsWith(".md") && f !== "README.md");
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
export function verifyOrder(renames) {
    const byOld = [...renames].sort((a, b) => Number(/-(\d+)$/.exec(a.oldId)[1]) - Number(/-(\d+)$/.exec(b.oldId)[1]));
    const byNew = [...renames].sort((a, b) => a.newId.localeCompare(b.newId));
    const problems = [];
    for (let i = 0; i < byOld.length; i++) {
        if (byOld[i].oldId !== byNew[i].oldId) {
            problems.push(`position ${i}: was ${byOld[i].oldId}, now ${byNew[i].oldId}`);
        }
    }
    return problems;
}
/** The note a migrated item carries, so the rename is legible in the file. */
export function migrationNote(oldId, newId) {
    return `> Migrated from \`${oldId}\` to \`${newId}\` (MO-057). References to \`${oldId}\` in git\n> history, commit messages and merged pull requests still resolve — the old number is\n> the last field of the new id.`;
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
export async function updateLinks(roots, renames) {
    const byOldId = new Map(renames.map((r) => [r.oldId, r.newFile]));
    const touched = [];
    const walk = async (dir) => {
        let out = [];
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        }
        catch {
            return out;
        }
        for (const e of entries) {
            const full = join(dir, e.name);
            if (e.isDirectory())
                out = out.concat(await walk(full));
            else if (e.name.endsWith(".md"))
                out.push(full);
        }
        return out;
    };
    for (const root of roots) {
        for (const file of await walk(root)) {
            const text = await readFile(file, "utf8");
            const next = text.replace(
            // Any relative link ending in `<ID>.md`, not only those with a
            // `roadmap/` segment. Items link to each other as siblings —
            // `](./DW-006.md)` — and requiring the directory name missed every one
            // of those, which is how darwin went from zero broken links to three.
            /\]\(([^)]*?)([A-Z]{2,4}-\d{3,})\.md\)/g, (whole, prefix, id) => {
                // Never rewrite an absolute URL. Those are pinned to a ref or point
                // at another repository — an archived link to
                // `github.com/…/blob/<branch>/…/DW-002.md` records what that file was
                // called on that branch, and "fixing" it would break a working link
                // to make a local one look tidy.
                if (/^[a-z]+:\/\//i.test(prefix))
                    return whole;
                return byOldId.has(id) ? `](${prefix}${byOldId.get(id)})` : whole;
            });
            if (next !== text) {
                await writeFile(file, next, "utf8");
                touched.push(file);
            }
        }
    }
    return touched;
}
export async function updateReferences(dir, renames) {
    const map = new Map(renames.map((r) => [r.oldId, r.newId]));
    const touched = [];
    let entries;
    try {
        entries = (await readdir(dir)).filter((f) => f.endsWith(".md"));
    }
    catch {
        return touched; // no worklog directory in this project
    }
    for (const file of entries) {
        const path = join(dir, file);
        const text = await readFile(path, "utf8");
        const next = text.replace(/^(roadmap:\s*)([A-Z]{2,4}-\d{3,})\s*$/m, (whole, prefix, id) => (map.has(id) ? `${prefix}${map.get(id)}` : whole));
        if (next !== text) {
            await writeFile(path, next, "utf8");
            touched.push(file);
        }
    }
    return touched;
}
/**
 * Apply a plan: rewrite `id:`, insert the note, and rename the file.
 *
 * Refuses outright if `verifyOrder` finds a swap, rather than migrating and
 * reporting afterwards. A board whose order silently changed is worse than one
 * that was not migrated, and this is the only moment the check is cheap.
 */
export async function migrate(roadmapDir, dryRun = false, 
/**
 * Where worklog entries live. Passed in rather than derived from
 * `roadmapDir` — a `../../..` walk is right for a real repo and silently
 * wrong anywhere else, which is how the first version passed its own test
 * while updating nothing.
 */
worklogDir, 
/** Directory trees to scan for relative markdown links, e.g. `hq/`, `.agent/`. */
linkRoots = []) {
    const plan = await planMigration(roadmapDir);
    const disorder = verifyOrder(plan.renames);
    if (disorder.length) {
        throw new Error(`Migration would reorder the board:\n  ${disorder.join("\n  ")}`);
    }
    const applied = [];
    if (dryRun)
        return { ...plan, applied, referencesUpdated: [], linksUpdated: [] };
    for (const r of plan.renames) {
        const path = join(roadmapDir, r.oldFile);
        let text = await readFile(path, "utf8");
        text = text.replace(/^id:\s*.+$/m, `id: ${r.newId}`);
        // The note goes immediately after the frontmatter, where a reader lands.
        const end = text.indexOf("\n---", 3);
        const cut = text.indexOf("\n", end + 4) + 1;
        text = `${text.slice(0, cut)}\n${migrationNote(r.oldId, r.newId)}\n${text.slice(cut)}`;
        await writeFile(path, text, "utf8");
        if (r.newFile !== r.oldFile)
            await rename(path, join(roadmapDir, r.newFile));
        applied.push(r.newId);
    }
    const referencesUpdated = worklogDir
        ? await updateReferences(worklogDir, plan.renames)
        : [];
    const linksUpdated = await updateLinks(linkRoots, plan.renames);
    return { ...plan, applied, referencesUpdated, linksUpdated };
}
export { isLegacyId };
//# sourceMappingURL=migrate-ids.js.map