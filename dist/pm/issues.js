import { readFile, writeFile } from "node:fs/promises";
import { updateFrontmatter, today } from "./frontmatter.js";
import { parseArtifact } from "./parse.js";
export class IssueLinkError extends Error {
}
/** Parse the exact decimal syntax GitHub uses for issue numbers. */
export function parseIssueNumber(raw) {
    if (!/^[1-9]\d*$/.test(raw))
        return null;
    const issue = Number(raw);
    return Number.isSafeInteger(issue) ? issue : null;
}
/** Add closure intent to an existing roadmap item without reformatting it. */
export async function linkIssue(productDir, id, issue, now = new Date()) {
    const { items } = await parseArtifact(productDir, "roadmap");
    const item = items.find((candidate) => candidate.data.id === id.toUpperCase());
    if (!item)
        throw new IssueLinkError(`No roadmap item ${id.toUpperCase()} in ${productDir}/roadmap/.`);
    const issues = [...new Set([...item.data.issues, issue])].sort((a, b) => a - b);
    if (issues.length === item.data.issues.length) {
        return { path: item.path, issues, written: false };
    }
    const raw = await readFile(item.path, "utf8");
    const next = updateFrontmatter(raw, { issues, updated: today(now) });
    await writeFile(item.path, next);
    return { path: item.path, issues, written: true };
}
//# sourceMappingURL=issues.js.map