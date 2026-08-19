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
export const DEFAULT_CONFIG = {
    ceiling: DEFAULT_CEILING,
    dispatch: false,
};
const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
/** A goal still worth serving. Achieved and missed goals pull nothing forward. */
const LIVE_GOAL = new Set(["on-track", "at-risk"]);
function daysSince(iso, now) {
    const then = new Date(`${iso}T00:00:00Z`).getTime();
    if (Number.isNaN(then))
        return 0;
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
function compare(a, b) {
    return (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        Number(b.aligned) - Number(a.aligned) ||
        b.age - a.age ||
        a.id.localeCompare(b.id));
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
/**
 * Statuses whose claim does not occupy a dispatch lane.
 *
 * `blocked` because the work is waiting on a person; `shipped` and `dropped`
 * because it is over. All three can still have a branch on origin, and only the
 * ceiling should ignore them.
 */
const SETTLED_FOR_DISPATCH = new Set(["blocked", "shipped", "dropped"]);
export function assess(input) {
    const { items, goals, claims, config, now } = input;
    const byId = new Map(items.map((i) => [i.data.id, i.data]));
    const goalStatus = new Map(goals.map((g) => [g.data.id, g.data.status]));
    const blocked = items
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
    // A claim only holds a lane while its work is still moving. Blocked was
    // already excluded — the work is stalled on a person, not occupying an agent.
    // Shipped and dropped are the same argument one step further on: the branch
    // survives a squash-merge unless the merger passed `--delete-branch` or the
    // repository sets `delete_branch_on_merge`, and a branch left behind that way
    // describes finished work.
    //
    // Leaving them in is not a cosmetic overcount. It consumes the dispatch
    // ceiling, so the beat stops offering work on the strength of branches whose
    // commits are already on the trunk — and it reports that as "finishing beats
    // starting", which reads as deliberate. A downstream project sat at 8/3 with
    // three real claims for a week before anyone attributed it to a branch.
    //
    // `claimedIds` deliberately still counts them, because `pm claim` really is
    // blocked by the surviving ref: the drift and candidate lists should keep
    // saying so. What changes is only whether a finished item occupies a lane.
    const settledIds = new Set(items
        .filter((i) => SETTLED_FOR_DISPATCH.has(i.data.status))
        .map((i) => i.data.id));
    const inFlight = claims.filter((c) => !settledIds.has(c.id));
    const claimedIds = new Set(claims.map((c) => c.id));
    // A status of in-progress with no branch behind it is drift, not work. Report
    // it rather than picking it: something already went wrong there, and quietly
    // handing it to another agent would compound it.
    const drift = items
        .filter((i) => i.data.status === "in-progress" && !claimedIds.has(i.data.id))
        .map((i) => ({
        id: i.data.id,
        status: i.data.status,
        why: "in-progress, but no branch on origin claims it",
    }));
    const ranked = items
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
    const meetings = meetingContext(input.notes ?? [], now);
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
            meetings,
            reason: `${inFlight.length} item(s) in flight against a ceiling of ${config.ceiling}. ` +
                `Nothing dispatched — finishing beats starting.`,
        };
    }
    if (ranked.length === 0) {
        const why = byId.size === 0
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
            meetings,
            reason: `${why} Nothing to pick, which is a valid answer — filing work is a human's call.`,
        };
    }
    const pick = ranked[0];
    return {
        inFlight,
        blocked,
        drift,
        ceiling: config.ceiling,
        headroom,
        ranked,
        pick,
        meetings,
        reason: `${pick.id} is the highest-leverage unclaimed item: ${pick.priority}, ${pick.note}, ` +
            `last touched ${pick.age}d ago. ${headroom} lane(s) free of ${config.ceiling}.`,
    };
}
/**
 * How stale the meeting record is, and what it produced nothing from.
 *
 * Pure, like everything else in this module. An empty list means "this project
 * keeps no notes", which reports as `null` rather than zero — the same
 * distinction the rest of the beat draws between absence and evidence.
 */
export function meetingContext(notes, now) {
    if (notes.length === 0)
        return { sinceLastNote: null, unpromoted: [] };
    const withAge = notes.map((n) => ({
        id: n.data.id,
        title: n.data.title,
        age: Math.max(0, Math.floor((now.getTime() - new Date(n.data.occurred).getTime()) / 86_400_000)),
        promoted: (n.data.roadmap ?? []).length > 0,
    }));
    return {
        sinceLastNote: Math.min(...withAge.map((n) => n.age)),
        unpromoted: withAge
            .filter((n) => !n.promoted)
            .sort((a, b) => b.age - a.age)
            .map(({ id, title, age }) => ({ id, title, age })),
    };
}
//# sourceMappingURL=assess.js.map