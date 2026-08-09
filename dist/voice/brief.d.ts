import type { Beat } from "../heartbeat/assess.js";
import type { Since } from "./since.js";
/**
 * The per-session half of a voice handoff: what the work looks like right now.
 *
 * Kept separate from `knowledge.ts` because the two have opposite lifecycles.
 * The explainer is uploaded once and refreshed when a convention changes; this
 * is stale within hours, so it is regenerated every time and pasted in.
 *
 * Written to be *listened to on the other side of*, not read. That rules out
 * the tables the terminal and job summaries use — a voice session asked about
 * "the board" should be able to say a sentence, and prose it can quote beats a
 * grid it has to linearise.
 *
 * Pure, so what a cold session is told is testable without a model.
 */
export interface OpenInboxItem {
    n: number;
    title: string;
}
export interface BriefInput {
    /** Display name, e.g. "Morpheus". */
    name: string;
    /** What Chris wants to think about, if he said. */
    topic?: string;
    /** Board state, from the same assess() the heartbeat uses. */
    beat: Beat;
    /** Open `❗` items across the project's inboxes. */
    openInbox: OpenInboxItem[];
    since: Since;
    /** Session narrative the agent adds — what just happened, in its words. */
    notes?: string;
    /** Written into the document so a stale paste is visible as stale. */
    today: string;
    /** True when the standing explainer is inlined rather than assumed. */
    selfContained?: boolean;
}
/**
 * Render the live-state brief.
 *
 * Section order is deliberate: the topic first, because a voice session that
 * reads one paragraph and starts talking should already know what this is
 * about. State second. Housekeeping last.
 */
export declare function buildBrief(input: BriefInput): string;
