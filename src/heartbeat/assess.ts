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

export const DEFAULT_CEILING = 3;

export interface HeartbeatConfig {
  /** How many items may be in flight at once. */
  ceiling: number;
  /** Whether a beat may start work rather than only propose it. */
  dispatch: boolean;
}

export const DEFAULT_CONFIG: HeartbeatConfig = {
  ceiling: DEFAULT_CEILING,
  dispatch: false,
};

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
}

export interface AssessInput {
  items: Item<RoadmapItem>[];
  goals: Item<Goal>[];
  claims: Claim[];
  config: HeartbeatConfig;
  now: Date;
}

const PRIORITY_ORDER: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

/** A goal still worth serving. Achieved and missed goals pull nothing forward. */
const LIVE_GOAL = new Set(["on-track", "at-risk"]);

function daysSince(iso: string, now: Date): number {
  const then = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

/**
 * Rank two candidates.
 *
 * **Priority before alignment**, deliberately. Priority is a human's explicit
 * statement of leverage; alignment is derived from a goal link that plenty of
 * legitimate items do not have. When an explicit signal and a derived one
 * disagree, the explicit one wins — otherwise a P0 with no goal set would sit
 * behind a P3 that happens to name one.
 *
 * Age last, and oldest first, so nothing starves at the bottom of the board.
 */
function compare(a: Candidate, b: Candidate): number {
  return (
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    Number(b.aligned) - Number(a.aligned) ||
    b.age - a.age ||
    a.id.localeCompare(b.id)
  );
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
export function assess(input: AssessInput): Beat {
  const { items, goals, claims, config, now } = input;

  const byId = new Map(items.map((i) => [i.data.id, i.data]));
  const goalStatus = new Map(goals.map((g) => [g.data.id, g.data.status]));

  const blockedIds = new Set(
    items.filter((i) => i.data.status === "blocked").map((i) => i.data.id),
  );

  const blocked: BlockedItem[] = items
    .filter((i) => i.data.status === "blocked")
    .map((i) => ({
      id: i.data.id,
      title: i.data.title,
      // The schema guarantees this on a blocked item, but the beat must not
      // crash on a hand-edited file that slipped past validation.
      needs: i.data.needs ?? "(unrecorded)",
      age: daysSince(i.data.updated, now),
    }))
    .sort((a, b) => b.age - a.age);

  const inFlight = claims.filter((c) => !blockedIds.has(c.id));
  const claimedIds = new Set(claims.map((c) => c.id));

  // A status of in-progress with no branch behind it is drift, not work. Report
  // it rather than picking it: something already went wrong there, and quietly
  // handing it to another agent would compound it.
  const drift: Drift[] = items
    .filter((i) => i.data.status === "in-progress" && !claimedIds.has(i.data.id))
    .map((i) => ({
      id: i.data.id,
      status: i.data.status,
      why: "in-progress, but no branch on origin claims it",
    }));

  const ranked: Candidate[] = items
    .filter((i) => i.data.status === "backlog" && !claimedIds.has(i.data.id))
    .map((i) => {
      const aligned = i.data.goal ? LIVE_GOAL.has(goalStatus.get(i.data.goal) ?? "") : false;
      const age = daysSince(i.data.updated, now);
      return {
        id: i.data.id,
        title: i.data.title,
        priority: i.data.priority,
        ...(i.data.goal ? { goal: i.data.goal } : {}),
        aligned,
        age,
        note: !i.data.goal
          ? "no goal linked"
          : aligned
            ? `serves ${i.data.goal}`
            : `${i.data.goal} is ${goalStatus.get(i.data.goal) ?? "unknown"}`,
      };
    })
    .sort(compare);

  const headroom = config.ceiling - inFlight.length;

  if (headroom <= 0) {
    return {
      inFlight,
      blocked,
      drift,
      ceiling: config.ceiling,
      headroom,
      ranked,
      pick: null,
      reason:
        `${inFlight.length} item(s) in flight against a ceiling of ${config.ceiling}. ` +
        `Nothing dispatched — finishing beats starting.`,
    };
  }

  if (ranked.length === 0) {
    const why =
      byId.size === 0
        ? "The board is empty."
        : blocked.length > 0
          ? `Everything unclaimed is blocked (${blocked.length}) or already moving.`
          : "Nothing in the backlog is unclaimed.";
    return {
      inFlight,
      blocked,
      drift,
      ceiling: config.ceiling,
      headroom,
      ranked,
      pick: null,
      reason: `${why} Nothing to pick, which is a valid answer — filing work is a human's call.`,
    };
  }

  const pick = ranked[0]!;
  return {
    inFlight,
    blocked,
    drift,
    ceiling: config.ceiling,
    headroom,
    ranked,
    pick,
    reason:
      `${pick.id} is the highest-leverage unclaimed item: ${pick.priority}, ${pick.note}, ` +
      `last touched ${pick.age}d ago. ${headroom} lane(s) free of ${config.ceiling}.`,
  };
}
