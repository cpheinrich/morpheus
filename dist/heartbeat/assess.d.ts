import type { Claim } from "../pm/claim.js";
import type { Item } from "../pm/parse.js";
import type { Goal, Priority, RoadmapItem } from "../pm/schema.js";
/**
 * The heartbeat's assess step.
 *
 * **A ranking function, not a prompt.** The obvious reading of "identify the
 * highest-leverage unblocked work" is a model call, and building it that way
 * would make the heartbeat unrunnable without a credential, untestable in CI,
 * dead at the first billing failure, and non-deterministic in a job that runs
 * unattended twice a day. Every input it needs is already in git.
 *
 * A model can reorder or veto this later. It would be a second opinion over a
 * ranking that stands on its own, which is the property worth keeping.
 *
 * Pure — no filesystem, no network, no clock of its own. That is what makes the
 * guards below directly testable, and the guards are the whole safety story.
 */
export declare const DEFAULT_CEILING = 3;
export interface HeartbeatConfig {
    /** How many items may be in flight at once. */
    ceiling: number;
    /** Whether a beat may start work rather than only propose it. */
    dispatch: boolean;
}
export declare const DEFAULT_CONFIG: HeartbeatConfig;
export interface Candidate {
    id: string;
    title: string;
    priority: Priority;
    goal?: string;
    /** True when the item serves a goal that is still live. */
    aligned: boolean;
    /** Days since the item was last touched. */
    age: number;
    /** Why it sits where it sits. */
    note: string;
}
export interface BlockedItem {
    id: string;
    title: string;
    needs: string;
    age: number;
}
/** An item whose status claims it is active, with no branch backing it up. */
export interface Drift {
    id: string;
    status: string;
    why: string;
}
/**
 * What the beat can see about collaborative context.
 *
 * **Deliberately a gap report, not a fetch.** Granola is a claude.ai connector
 * and iMessage is a local database; neither is reachable from a GitHub Actions
 * runner, so a beat that tried to *pull* meetings would either need credentials
 * it should not have or would silently find nothing and report a clean sweep.
 *
 * So the beat reports what the repository can prove — how stale the notes are,
 * and which notes produced nothing — and an interactive session with the
 * connector does the ingestion. Same split as `assess` itself: deterministic in
 * CI, model and connector work in a session.
 */
export interface MeetingContext {
    /** Days since the most recent note, or null when there are none at all. */
    sinceLastNote: number | null;
    /**
     * Notes that filed no roadmap items.
     *
     * The failure this folder is most likely to have: capture with no decay path,
     * where notes accumulate and nothing is promoted out of them. Empty `roadmap:`
     * is not proof a meeting produced nothing — but a run of them is the signal.
     */
    unpromoted: {
        id: string;
        title: string;
        age: number;
    }[];
}
export interface Beat {
    /** Claims doing actual work — blocked ones excluded. */
    inFlight: Claim[];
    blocked: BlockedItem[];
    drift: Drift[];
    ceiling: number;
    headroom: number;
    ranked: Candidate[];
    pick: Candidate | null;
    /** Always populated, including when the pick is null. */
    reason: string;
    meetings: MeetingContext;
}
export interface AssessInput {
    items: Item<RoadmapItem>[];
    goals: Item<Goal>[];
    claims: Claim[];
    config: HeartbeatConfig;
    now: Date;
    /** Meeting notes, when the project keeps any. Absent is not empty. */
    notes?: Item<{
        id: string;
        title: string;
        occurred: string;
        roadmap: string[];
    }>[];
}
/**
 * What should happen next, and whether anything should.
 *
 * The four guards, each closing a specific failure:
 *
 * - **The ceiling** is what stops a runaway queue, so it is checked before
 *   anything else and is never advisory.
 * - **Blocked is not in-flight.** A blocked item holds its branch on purpose;
 *   counting it would let one unanswered question consume a lane forever, and
 *   a ceiling that cannot be released is a deadlock with a schedule.
 * - **Nothing is a valid answer.** A beat with no pick returns a reason and
 *   succeeds. One that cannot do nothing will invent work to justify itself.
 * - **Blocked work is re-surfaced, not re-raised.** `pm block` already filed an
 *   inbox item; a cron that duplicates it teaches people to ignore the inbox.
 */
export declare function assess(input: AssessInput): Beat;
/**
 * How stale the meeting record is, and what it produced nothing from.
 *
 * Pure, like everything else in this module. An empty list means "this project
 * keeps no notes", which reports as `null` rather than zero — the same
 * distinction the rest of the beat draws between absence and evidence.
 */
export declare function meetingContext(notes: Item<{
    id: string;
    title: string;
    occurred: string;
    roadmap: string[];
}>[], now: Date): MeetingContext;
