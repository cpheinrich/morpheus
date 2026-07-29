import { z } from "zod";
import { isoDate, ROADMAP_ID } from "../pm/schema.js";

/**
 * A standup: what an agent finished, and what it needs before continuing.
 *
 * Named for the ritual it mirrors — done, next, blocked — because mapping onto
 * a familiar human workflow makes the format explain itself. "Status" only
 * described the reporting half and said nothing about the asking half.
 */

export const Standup = z.object({
  /** Whose inbox this is — one per person, never per session. */
  person: z.string().min(1),
  date: isoDate,
  /** Agents that contributed items this cycle. */
  agents: z.array(z.enum(["claude", "codex", "human"])).min(1),
  /** Path to the previous cycle in the archive, if there is one. */
  previous: z.string().optional(),
});

export type Standup = z.infer<typeof Standup>;

/** Open needs a reply and carries a trailing slot; done does not. */
export const ItemState = z.enum(["open", "done"]);
export type ItemState = z.infer<typeof ItemState>;

export const STATE_MARK: Record<ItemState, string> = {
  open: "❗",
  done: "✅",
};

export const MARK_STATE: Record<string, ItemState> = {
  "❗": "open",
  "✅": "done",
};

export const StandupItem = z.object({
  n: z.number().int().positive(),
  state: ItemState,
  title: z.string().min(3),
  agent: z.enum(["claude", "codex", "human"]),
  /** Optional — not every item is a roadmap task. */
  roadmap: z.string().regex(ROADMAP_ID).optional(),
  /** True when the item ends in an empty reply slot. */
  hasReplySlot: z.boolean(),
});

export type StandupItem = z.infer<typeof StandupItem>;
