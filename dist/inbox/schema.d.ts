import { z } from "zod";
/**
 * An inbox: what an agent finished, and what it needs before continuing.
 *
 * Named for the recipient rather than the ritual — the file is addressed *to*
 * a person, so `inbox/cpheinrich.md` parses without explanation. In practice
 * an inbox is also a todo list, which is what this is.
 */
/** GitHub handle rules: alphanumeric and single hyphens, 39 chars max. */
export declare const HANDLE: RegExp;
export declare const Inbox: z.ZodObject<{
    owner: z.ZodString;
    date: z.ZodPreprocess<z.ZodISODate>;
    agents: z.ZodArray<z.ZodEnum<{
        human: "human";
        claude: "claude";
        codex: "codex";
    }>>;
    previous: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Inbox = z.infer<typeof Inbox>;
/** Open needs a reply and carries a trailing slot; done does not. */
export declare const ItemState: z.ZodEnum<{
    done: "done";
    open: "open";
}>;
export type ItemState = z.infer<typeof ItemState>;
export declare const STATE_MARK: Record<ItemState, string>;
export declare const MARK_STATE: Record<string, ItemState>;
export declare const InboxItem: z.ZodObject<{
    n: z.ZodNumber;
    state: z.ZodEnum<{
        done: "done";
        open: "open";
    }>;
    title: z.ZodString;
    agent: z.ZodEnum<{
        human: "human";
        claude: "claude";
        codex: "codex";
    }>;
    roadmap: z.ZodOptional<z.ZodString>;
    hasReplySlot: z.ZodBoolean;
}, z.core.$strip>;
export type InboxItem = z.infer<typeof InboxItem>;
/** Archive filename: date first so the record reads as one timeline. */
export declare function archiveName(owner: string, when: Date): string;
