import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import matter from "gray-matter";
import { ARTIFACTS } from "./schema.js";
/** README.md is generated output, not an item. */
const NOT_AN_ITEM = new Set(["README.md", "readme.md"]);
async function listMarkdown(dir) {
    let entries;
    try {
        entries = await readdir(dir);
    }
    catch (err) {
        if (err.code === "ENOENT")
            return [];
        throw err;
    }
    return entries
        .filter((f) => f.endsWith(".md") && !NOT_AN_ITEM.has(f))
        .sort()
        .map((f) => join(dir, f));
}
/**
 * Parse and validate every markdown item in a directory.
 *
 * Invalid files become issues rather than throwing, so a single malformed
 * file cannot block the whole run — `morpheus pm validate` reports all of
 * them at once instead of one per invocation.
 */
export async function parseDir(dir, schema) {
    const items = [];
    const issues = [];
    for (const path of await listMarkdown(dir)) {
        const raw = await readFile(path, "utf8");
        // Malformed YAML throws. Catch it so one bad file cannot abort the run —
        // `pm validate` should report every problem at once, not the first.
        let data;
        let content;
        try {
            const parsedFile = matter(raw);
            data = parsedFile.data;
            content = parsedFile.content;
        }
        catch (err) {
            const detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
            issues.push({ path, message: `invalid YAML frontmatter — ${detail}` });
            continue;
        }
        const parsed = schema.safeParse(data);
        if (!parsed.success) {
            for (const issue of parsed.error.issues) {
                const field = issue.path.join(".") || "(root)";
                issues.push({ path, message: `${field}: ${issue.message}` });
            }
            continue;
        }
        // The filename must begin with the id, so a file is findable from its id
        // alone. Roadmap files may then carry a `-slug` (MO-057) which makes the
        // directory readable — `MO-2026-08-01-15.26.34-blocked-is-a-first-class-outcome`
        // — without lengthening the id that `prs:` and cross-references repeat.
        const id = parsed.data.id;
        const name = basename(path);
        const ok = id ? name === `${id}.md` || name.startsWith(`${id}-`) : true;
        if (id && !ok) {
            issues.push({
                path,
                message: `filename must start with the id — expected ${id}.md or ${id}-<slug>.md`,
            });
            continue;
        }
        items.push({ path, data: parsed.data, body: content.trim() });
    }
    return { items, issues };
}
/** Parse one artifact kind out of a product directory (e.g. hq/product). */
export async function parseArtifact(productDir, kind) {
    const { schema, dir } = ARTIFACTS[kind];
    return parseDir(join(productDir, dir), schema);
}
/** Detect ids used more than once within a set of items. */
export function findDuplicateIds(items) {
    const seen = new Map();
    const issues = [];
    for (const item of items) {
        const first = seen.get(item.data.id);
        if (first) {
            issues.push({
                path: item.path,
                message: `duplicate id ${item.data.id} — also defined in ${first}`,
            });
        }
        else {
            seen.set(item.data.id, item.path);
        }
    }
    return issues;
}
//# sourceMappingURL=parse.js.map