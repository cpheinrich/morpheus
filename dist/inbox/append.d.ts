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
    /** Actual roadmap filename when it carries a slug. */
    roadmapFile?: string;
    /** Markdown body, above the reply slot. */
    body: string;
}
export interface InboxMeta {
    /** GitHub handle the inbox belongs to. */
    owner: string;
    /** ISO date for a newly created inbox. Ignored when one already exists. */
    date: string;
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
export declare function lastItemNumber(content: string): number;
/**
 * Append an open item to an inbox, returning the new document.
 *
 * `existing` is `null` when the person has no inbox yet. Pure: the caller
 * decides where to write, which keeps this testable without a filesystem.
 */
export declare function appendOpenItem(existing: string | null, item: OpenItem, meta: InboxMeta): string;
