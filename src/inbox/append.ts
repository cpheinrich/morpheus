import { STATE_MARK } from "./schema.js";

/**
 * Adding an item to a live inbox.
 *
 * The inbox is normally written whole, at the end of a cycle. This appends a
 * single item mid-cycle, which is what `pm block` needs: an agent that stops on
 * ambiguity has to reach the human now, not when someone next writes a summary.
 *
 * Every invariant `inbox validate` enforces has to hold on the way out —
 * numbering dense and ascending, an open item ending in an empty `~`, a summary
 * before the first item. Producing a file that fails our own validator would
 * red CI on a repo whose only sin was that an agent got stuck.
 */

export interface OpenItem {
  title: string;
  agent: "claude" | "codex" | "human";
  /** Roadmap id, rendered as a relative link so it resolves on GitHub. */
  roadmap?: string;
  /** Markdown body, above the reply slot. */
  body: string;
}

export interface InboxMeta {
  /** GitHub handle the inbox belongs to. */
  owner: string;
  /** ISO date for a newly created inbox. Ignored when one already exists. */
  date: string;
}

/** `[MO-050](../product/roadmap/MO-050.md)` — resolves in Obsidian and on GitHub. */
function roadmapLink(id: string): string {
  return `[${id}](../product/roadmap/${id}.md)`;
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
export function lastItemNumber(content: string): number {
  let max = 0;
  for (const line of content.split("\n")) {
    const m = /^##\s+(?:❗|✅)\s*(\d+)\./.exec(line);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

function render(item: OpenItem, n: number): string {
  const tail = [`\`${item.agent}\``, item.roadmap ? roadmapLink(item.roadmap) : null]
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
function fresh(meta: InboxMeta, item: OpenItem): string {
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
export function appendOpenItem(
  existing: string | null,
  item: OpenItem,
  meta: InboxMeta,
): string {
  if (existing === null || existing.trim().length === 0) return fresh(meta, item);

  const n = lastItemNumber(existing) + 1;
  return `${existing.trimEnd()}\n\n${render(item, n)}`;
}
