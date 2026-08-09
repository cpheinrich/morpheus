import type { ParseIssue } from "../pm/parse.js";
import { Inbox, InboxItem } from "./schema.js";
/**
 * Parse and check an inbox document.
 *
 * The invariant this exists to enforce: **every item is either open or done,
 * never both and never neither.** An open item must end in an empty reply slot,
 * because an answer with nowhere to reply is a dead end — a mistake made by
 * hand once already.
 */
export interface ParsedInbox {
    meta: Inbox;
    items: InboxItem[];
    /** Prose between the title and the first item. */
    summary: string;
    issues: ParseIssue[];
}
export declare function parseInbox(path: string, raw: string): ParsedInbox;
export declare function parseInboxFile(path: string): Promise<ParsedInbox>;
