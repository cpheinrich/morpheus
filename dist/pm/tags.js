import { join } from "node:path";
import { z } from "zod";
import { findDuplicateIds, parseArtifact, parseDir } from "./parse.js";
import { JournalEntry, WorkTags } from "./schema.js";
// Older worklogs include prose-only and pre-schema records. No tag is unclassified,
// not a request to retroactively validate or rewrite their historical shape.
const JournalForTagLookup = z.unknown().transform((value, ctx) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value) && !("tags" in value)) {
        return { tags: undefined };
    }
    const parsed = JournalEntry.safeParse(value);
    if (!parsed.success) {
        for (const issue of parsed.error.issues)
            ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
        return z.NEVER;
    }
    return parsed.data;
});
/** Explicit AND matching, with unclassified legacy history and parse failures kept distinct. */
export async function taggedWork(root, productDir, requested) {
    const tags = WorkTags.min(1).parse(requested);
    const [roadmap, journal] = await Promise.all([
        parseArtifact(productDir, "roadmap"),
        parseDir(join(root, ".agent/worklog"), JournalForTagLookup),
    ]);
    const candidates = [
        ...roadmap.items.map(({ path, data }) => ({
            kind: "roadmap", path, roadmap: data.id, tags: data.tags ?? [], summary: data.title,
        })),
        ...journal.items.flatMap(({ path, data }) => "summary" in data ? [{
                kind: "worklog", path, roadmap: data.roadmap, tags: data.tags ?? [], summary: data.summary,
            }] : []),
    ];
    return {
        items: candidates.filter((item) => tags.every((tag) => item.tags.includes(tag)))
            .sort((a, b) => a.path.localeCompare(b.path)),
        issues: [...roadmap.issues, ...findDuplicateIds(roadmap.items), ...journal.issues],
        unclassifiedWorklogs: journal.items.filter(({ data }) => !data.tags?.length).length,
    };
}
//# sourceMappingURL=tags.js.map