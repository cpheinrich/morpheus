import { z } from "zod";
import { isoDate, ROADMAP_ID } from "../pm/schema.js";
/**
 * An inbox: what an agent finished, and what it needs before continuing.
 *
 * Named for the recipient rather than the ritual — the file is addressed *to*
 * a person, so `inbox/cpheinrich.md` parses without explanation. In practice
 * an inbox is also a todo list, which is what this is.
 */
/** GitHub handle rules: alphanumeric and single hyphens, 39 chars max. */
export const HANDLE = /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/;
export const Inbox = z.object({
    /**
     * Whose inbox, by GitHub handle. "Owner" rather than "author" because the
     * agent did the writing, and rather than "manager" because collaborators
     * are peers — on Lakina nobody manages anybody.
     */
    owner: z.string().regex(HANDLE, "must be a GitHub handle"),
    date: isoDate,
    /** Agents that contributed items this cycle. */
    agents: z.array(z.enum(["claude", "codex", "human"])).min(1),
    /** Path to the previous cycle in the archive, if there is one. */
    previous: z.string().optional(),
});
/** Open needs a reply and carries a trailing slot; done does not. */
export const ItemState = z.enum(["open", "done"]);
export const STATE_MARK = {
    open: "\u2757",
    done: "\u2705",
};
export const MARK_STATE = {
    "\u2757": "open",
    "\u2705": "done",
};
export const InboxItem = z.object({
    n: z.number().int().positive(),
    state: ItemState,
    title: z.string().min(3),
    agent: z.enum(["claude", "codex", "human"]),
    /** Optional — not every item is a roadmap task. */
    roadmap: z.string().regex(ROADMAP_ID).optional(),
    /** True when the item ends in an empty reply slot. */
    hasReplySlot: z.boolean(),
});
/** Archive filename: date first so the record reads as one timeline. */
export function archiveName(owner, when) {
    const iso = when.toISOString();
    return `${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}-${owner}.md`;
}
//# sourceMappingURL=schema.js.map