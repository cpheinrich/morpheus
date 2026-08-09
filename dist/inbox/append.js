import { STATE_MARK } from "./schema.js";
/** `[MO-050](../product/roadmap/MO-050.md)` — resolves in Obsidian and on GitHub. */
function roadmapLink(id, file = `${id}.md`) {
    return `[${id}](../product/roadmap/${file})`;
}
/**
 * The highest item number already in the document.
 *
 * Read from the raw text rather than from `parseInbox`, because appending must
 * work on an inbox that is *currently invalid* — most often because the human
 * has replied inline and consumed a `~` slot, which is exactly the state a live
 * inbox is in between cycles. Refusing to append then would make the mechanism
 * unavailable at the only time it matters.
 */
export function lastItemNumber(content) {
    let max = 0;
    for (const line of content.split("\n")) {
        const m = /^##\s+(?:❗|✅)\s*(\d+)\./.exec(line);
        if (m)
            max = Math.max(max, Number(m[1]));
    }
    return max;
}
function render(item, n) {
    const tail = [
        `\`${item.agent}\``,
        item.roadmap ? roadmapLink(item.roadmap, item.roadmapFile) : null,
    ]
        .filter(Boolean)
        .join(" · ");
    return [
        `## ${STATE_MARK.open} ${n}. ${item.title} · ${tail}`,
        "",
        item.body.trim(),
        "",
        "~",
        "",
    ].join("\n");
}
/**
 * A fresh inbox, for the case where the person has none yet.
 *
 * The summary is not decorative — `inbox validate` requires prose before the
 * first item, so a file created without one is born failing.
 */
function fresh(meta, item) {
    return [
        "---",
        `owner: ${meta.owner}`,
        `date: ${meta.date}`,
        `agents:\n  - ${item.agent}`,
        "---",
        `# Inbox — ${meta.date}`,
        "",
        "**An agent stopped on something it could not decide.** This inbox was opened by that stop,",
        "so it leads with the blocker rather than a summary of finished work.",
        "",
        "> `❗` needs you and ends in an empty `~`. `✅` is settled. Reply after the empty `~`.",
        "",
        render(item, 1),
    ].join("\n");
}
/**
 * Append an open item to an inbox, returning the new document.
 *
 * `existing` is `null` when the person has no inbox yet. Pure: the caller
 * decides where to write, which keeps this testable without a filesystem.
 */
export function appendOpenItem(existing, item, meta) {
    if (existing === null || existing.trim().length === 0)
        return fresh(meta, item);
    const n = lastItemNumber(existing) + 1;
    return `${existing.trimEnd()}\n\n${render(item, n)}`;
}
//# sourceMappingURL=append.js.map