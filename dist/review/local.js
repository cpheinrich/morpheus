import { execFileSync } from "node:child_process";
import matter from "@11ty/gray-matter";
import { z } from "zod";
import { visibleProse, visibleText } from "../check/pr.js";
import { ROADMAP_ID } from "../pm/id.js";
import { RoadmapItem } from "../pm/schema.js";
const Sha = z.string().regex(/^[a-f0-9]{40}$/);
const Text = z.string().trim().min(8);
const Session = z.string().trim().min(3);
/** IDs are attested from the runner, never invented to satisfy a format check. */
const GlobalSession = /^(?:[a-z][a-z0-9-]*[:/])?(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,})$/i;
const TaskSession = /^\/root(?:\/[a-z0-9_]+)+$/;
const ReviewerSession = z.string().trim().refine(value => GlobalSession.test(value) || TaskSession.test(value), "reviewerSession must be the runner-issued session id, not an author-chosen label");
function bareSession(value) {
    return value.replace(/^[a-z][a-z0-9-]*[:/]/i, "").toLowerCase();
}
const Path = z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\s\\]+$/);
/** Author-captured elapsed time, with an auditable source rather than a workload estimate. */
const Timing = z.object({
    source: z.enum(["runner", "clock"]),
    durationMs: z.number().int().nonnegative(),
    evidence: Text,
}).strict();
const FindingId = z.string().trim().min(3);
const FollowUp = z.object({
    reviewerSession: ReviewerSession,
    commit: Sha,
    base: Sha.optional(),
    scopeReason: Text.optional(),
    // A separate, explicit human decision is required for each ordinary turn beyond the automatic five.
    humanAuthorization: z.object({
        approvedBy: z.string().trim().min(1),
        approvedAt: z.iso.datetime({ offset: true }),
        reason: Text,
    }).strict().optional(),
    /**
     * Recorded when this turn's reviewer is a different session from the turn before it: why the
     * earlier reviewer did not continue (timed out, crashed, session lost), and the ids of every
     * finding recorded before this turn, all of which the fresh reviewer was given. A replacement
     * is allowed without anyone's approval; dropping what the earlier reviewer found is not.
     */
    handoff: z.object({
        reason: Text,
        findings: z.array(FindingId).max(200),
    }).strict().optional(),
    /**
     * The substantive findings a `blocked` turn rests on. Required when a fresh reviewer takes over
     * from it, so the findings a replaced reviewer blocked on are named, kept in the record and
     * handed over rather than lost with the session.
     */
    blockedOn: z.array(FindingId).min(1).max(50).optional(),
    /** The narrow fourth-turn shape from the three-turn contract; still validated, no longer needed. */
    verification: z.object({
        kind: z.enum(["finding-fix", "late-test"]),
        paths: z.array(Path).min(1).max(4),
        evidence: Text,
    }).strict().optional(),
    /**
     * The one automatic finalization-only turn a pull request gets beyond the cap, attested by the
     * reviewer: the exact paths it covered, the evidence it checked, and its scope statement. It
     * exists so finishing an already-approved change does not cost a human decision, and it is
     * deliberately too narrow to approve new implementation.
     */
    finalization: z.object({
        paths: z.array(Path).min(1),
        evidence: Text,
        attestation: Text,
    }).strict().optional(),
    outcome: z.enum(["cleared", "incomplete", "blocked"]),
    elapsedMinutes: z.number().nonnegative(),
    timing: Timing.optional(),
    summary: Text,
}).strict();
/**
 * Ordinary review turns a pull request gets without anyone's approval, counting the initial review
 * (Chris, 2026-10-30). Three proved too few: agents stalled waiting for a human to approve another
 * round. The cap still exists, because an author and a reviewer trading fixes and findings
 * indefinitely burns a session per turn; beyond it each ordinary turn carries `humanAuthorization`.
 * Incomplete turns count. The one automatic finalization turn does not, as before.
 */
export const MAX_REVIEW_TURNS = 5;
export const MAX_FOLLOW_UPS = MAX_REVIEW_TURNS - 1;
/**
 * Where the three-turn contract put its one bounded `verification` turn: the fourth. Records that
 * used it stay valid, so it stays checked there; under five automatic turns it is no longer needed.
 */
export const VERIFICATION_TURN_INDEX = 2;
export const FINAL_VERIFICATION_CEILING_MINUTES = 5;
export const FINAL_VERIFICATION_NON_TEST_LINES = 40;
export const FINAL_VERIFICATION_TEST_LINES = 80;
/**
 * A finalization turn is short by construction: it re-reads a documentation paragraph or the
 * record, not a change. Anything that needs longer than this is a review, and spends a turn.
 */
export const FINALIZATION_CEILING_MINUTES = 5;
/**
 * Policy a project is operated by, whatever file carries it. A change here is normative and needs
 * a real turn however it is described: this is the reason there is no blanket documentation
 * exemption. Explanatory prose that restates behaviour already reviewed is a different thing.
 */
export const NORMATIVE = /(?:^|\/)(?:AGENTS|CLAUDE)\.md$|(?:^|\/)morpheus\.json$|(?:^|\/)\.(?:github|ci|morpheus)\//i;
export const ReviewRecord = z.object({
    version: z.union([z.literal(1), z.literal(2)]),
    base: Sha,
    reviewed: Sha,
    covered: Sha,
    authorSession: Session,
    reviewerSession: ReviewerSession,
    risk: z.enum(["small", "normal", "high"]),
    elapsedMinutes: z.number().nonnegative(),
    timing: Timing.optional(),
    extensionReason: Text.optional(),
    outcome: z.enum(["complete", "incomplete", "blocked"]),
    /**
     * The initial turn's own verdict, when it was incomplete and a later turn (the same reviewer
     * resumed, or a fresh one) completed the review. `outcome` is the final verdict, so without this
     * the incomplete initial verdict would have to be rewritten rather than preserved.
     */
    initialOutcome: z.literal("incomplete").optional(),
    summary: Text,
    /**
     * Hand-resolved trunk merges after coverage. A merge Git reproduces exactly needs no entry;
     * one an author resolved by hand carries unreviewed edits, so it is accepted only when named.
     */
    trunkIntegrations: z.array(z.object({ commit: Sha, reason: Text }).strict()).min(1).max(20).optional(),
    /**
     * Evidence records wrote under the 2026-09-16 documentation-only rule. Still parsed so those
     * records stay valid; no longer enforced, because every trunk merge is now verified the same way.
     */
    documentationIntegrations: z.array(z.object({
        base: Sha,
        commit: Sha,
        reason: Text,
        sources: z.array(z.object({
            commit: Sha,
            reviewRecord: z.string().regex(/^\.agent\/worklog\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/),
        }).strict()).min(1).max(20),
    }).strict()).min(1).max(20).optional(),
    findings: z.array(z.object({
        id: Session,
        /**
         * The review turn that first raised it: 1 is the initial review, absent means 1. Only a handoff
         * reads it, to know which findings existed before a fresh reviewer took over.
         */
        turn: z.number().int().min(1).optional(),
        severity: z.enum(["minor", "substantive", "incidental"]),
        description: Text,
        paths: z.array(Path).min(1),
        disposition: z.enum(["fixed", "disputed", "deferred", "open"]),
        response: Text,
        /** The roadmap item tracking a finding left deferred or open; a deferral without one rots. */
        roadmap: z.string().regex(ROADMAP_ID).optional(),
        /**
         * Conditional clearance, set by the reviewer only: "fix it within these paths, run this
         * evidence, and it is clear" without another turn. The author records `conditionMet`.
         */
        condition: z.object({ paths: z.array(Path).min(1), evidence: Text }).strict().optional(),
        conditionMet: Text.optional(),
    }).strict()),
    /** The single-follow-up shape records written under the two-turn contract still carry. */
    followUp: FollowUp.optional(),
    /** Follow-up turns in order; the last one must clear `covered`. */
    followUps: z.array(FollowUp).min(1).max(20).optional(),
}).strict().refine(record => [record, ...(record.followUps ?? []), ...(record.followUp ? [record.followUp] : [])]
    .every(turn => !TaskSession.test(turn.reviewerSession)) || GlobalSession.test(record.authorSession), {
    message: "task-path reviewerSession requires the runner-issued parent session id in authorSession",
}).refine(record => !(record.followUp && record.followUps), { message: "record follow-up turns as either followUp or followUps, not both" });
/** Follow-up turns in order, whichever field the record used. */
export function followUpTurns(record) {
    return record.followUps ?? (record.followUp ? [record.followUp] : []);
}
/**
 * Whether two turns were taken by one reviewer session. A Codex task path is exact, because the
 * runner issued that spelling; a global id ignores a provider prefix and case, as reuse checks do.
 */
export function sameReviewer(a, b) {
    if (TaskSession.test(a) || TaskSession.test(b))
        return a.trim() === b.trim();
    return bareSession(a) === bareSession(b);
}
/** Every distinct reviewer session in the record, initial first. */
export function reviewerSessions(record) {
    const sessions = [];
    for (const turn of [record, ...followUpTurns(record)]) {
        if (!sessions.some(session => sameReviewer(session, turn.reviewerSession)))
            sessions.push(turn.reviewerSession);
    }
    return sessions;
}
/** The trunk base the reviewer's clearance covered: the latest recorded integration, else the original. */
export function coveredBase(record) {
    return followUpTurns(record).reduce((base, turn) => turn.base ?? base, record.base);
}
/** Findings the reviewer pre-cleared and the author fixed under the stated condition. */
export function conditionallyCleared(record) {
    return record.findings.filter(f => f.condition && f.disposition === "fixed" && f.conditionMet).flatMap(f => f.condition.paths);
}
/**
 * The paths a finalization turn may cover: the review record, paths the reviewer already
 * conditioned, and explanatory Markdown it attests to. Returns the reasons it may not, so the
 * refusal names the offending path rather than the rule.
 */
export function finalizationProblems(record, turn, worklog) {
    // Only conditions the author actually satisfied. A condition left disputed or unmet was never
    // discharged, so its paths are ordinary unreviewed source here, exactly as elsewhere.
    const conditioned = new Set(conditionallyCleared(record));
    return (turn.finalization?.paths ?? []).flatMap(path => {
        if (NORMATIVE.test(path))
            return [`${path} is normative policy; a change there needs a substantive review turn`];
        if (conditioned.has(path) || path === worklog)
            return [];
        // Not a blanket documentation exemption: Markdown is admitted only because the reviewer
        // attested that this file restates behaviour it already reviewed.
        if (path.endsWith(".md"))
            return [];
        return [`${path} is neither a conditioned path nor explanatory documentation; a finalization turn cannot cover it`];
    });
}
/** Initial-review ceilings in minutes; a follow-up gets half. Small was 5 until the data showed only creative accounting. */
export const REVIEW_BUDGET_MINUTES = { small: 10, normal: 15, high: 30 };
/**
 * The 30-second floor measures diff size, not diligence, once a change is small enough: six
 * independent reviews of the same five-line workflow `if:` (evo#412, lakinacapital#509, kairos#70)
 * took 21–30 s, all clean. Below these sizes the floor only produced incomplete records and extra
 * turns, so it is waived — computed from Git by the validator, never declared by the author.
 *
 * 20 lines is a hunk a reader takes in at a glance. Tests are counted separately and more
 * generously (40), because they change no shipped behaviour and a CI run executes them, but are
 * still capped so a large test rewrite keeps the floor.
 */
export const TRIVIAL_DIFF_MAX_LINES = 20;
export const TRIVIAL_DIFF_MAX_TEST_LINES = 40;
/**
 * The task's own records: worklogs (the review record lives here, and is written after the review)
 * and roadmap items with their generated indexes. Prose about the change, not the change. Generated
 * build output such as Morpheus's `dist/` is deliberately counted: excluding it would trust every
 * project to verify its mirror, and counting it only doubles a change already small.
 */
const TRIVIAL_DIFF_RECORDS = /^(?:\.agent\/worklog\/|hq\/product\/)/;
/**
 * A test is recognised by its own file name, never by its directory: a `tests/` or `test/` folder
 * also holds helpers, fixtures and actions with executable steps, which must count as logic.
 */
const TRIVIAL_DIFF_TESTS = /\.(?:test|spec)\.[A-Za-z0-9]+$|(?:^|\/)test_[^/]+\.py$|_test\.(?:py|go)$|Tests?\.(?:swift|kt|java)$/;
/**
 * Configuration, workflows and prose. Anything else with real logic — source in any language, a
 * shell script, an extensionless file — keeps the floor however few lines change. Workflows stay
 * eligible because the motivating changes were workflow conditions.
 */
const TRIVIAL_DIFF_CONFIG = /\.(?:md|mdx|txt|ya?ml|json|jsonc|toml)$/i;
/**
 * Whether `older..newer` is small enough to waive the floor, with the counts as a reason either
 * way. Binary or rename-ambiguous output is never trivial: what cannot be counted is not small.
 */
export function trivialDiff(root, older, newer) {
    let lines = 0, tests = 0;
    const logic = [];
    for (const row of git(root, ["diff", "--numstat", "-z", "--no-renames", older, newer, "--"]).split("\0").filter(Boolean)) {
        const [added, removed, file] = row.split("\t");
        if (!file || TRIVIAL_DIFF_RECORDS.test(file))
            continue;
        if (!/^\d+$/.test(added ?? "") || !/^\d+$/.test(removed ?? ""))
            return { trivial: false, reason: `${file} is binary and cannot be measured`, nonTestLines: lines, testLines: tests };
        const count = Number(added) + Number(removed);
        if (TRIVIAL_DIFF_TESTS.test(file)) {
            tests += count;
            continue;
        }
        lines += count;
        if (!TRIVIAL_DIFF_CONFIG.test(file))
            logic.push(file);
    }
    const reason = `${lines} changed non-test lines (max ${TRIVIAL_DIFF_MAX_LINES}), ${tests} test lines (max ${TRIVIAL_DIFF_MAX_TEST_LINES})${logic.length ? `, source outside configuration and docs: ${logic.slice(0, 3).join(", ")}` : ""}`;
    return { trivial: lines <= TRIVIAL_DIFF_MAX_LINES && tests <= TRIVIAL_DIFF_MAX_TEST_LINES && !logic.length, reason, nonTestLines: lines, testLines: tests };
}
/**
 * The rule a floor waiver is reported under. It is distinct from `agent-review`, whose `waived`
 * level means the project opted out and no record was read; this one means a record was read and
 * validated, with only the 30-second floor relaxed. Consumers that refuse an opt-out must not
 * refuse this.
 */
export const REVIEW_FLOOR_RULE = "review-floor";
/**
 * The line `check pr` and `review validate` print when the floor is waived. The waiver used to be
 * applied silently, so how often it fired could not be measured; `waived: review floor` is the
 * stable text to search CI logs for. Nothing is added to the record: the size is computed from
 * Git and never declared by the author, and the record and history it is computed from are
 * committed, so it can be recomputed for any merged pull request.
 */
export function floorWaiver(size) {
    return `waived: review floor (trivial diff: ${size.nonTestLines} non-test, ${size.testLines} test lines)`;
}
export function reviewRequired(config) {
    const parsed = z.object({ review: z.object({ required: z.boolean().optional() }).passthrough().optional() }).passthrough().parse(config);
    return parsed.review?.required ?? true;
}
export function git(root, args) {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 }).trim();
}
export function isAncestor(root, older, newer) {
    try {
        git(root, ["merge-base", "--is-ancestor", older, newer]);
        return true;
    }
    catch {
        return false;
    }
}
export function parseReviewRecord(markdown) {
    const blocks = [...markdown.matchAll(/^```morpheus-review\r?\n([\s\S]*?)^```[ \t]*$/gm)];
    if (blocks.length !== 1)
        throw new Error("worklog needs exactly one morpheus-review JSON block");
    const record = ReviewRecord.parse(JSON.parse(blocks[0][1]));
    // The human audit must remain visible without reading JSON.
    if (!visibleText(markdown.replace(blocks[0][0], "")).includes(record.summary)) {
        throw new Error("repeat the review summary as a visible paragraph outside the JSON block");
    }
    return record;
}
/**
 * `trivialChange` is consulted only when a turn is under the floor, and only `verifyReviewRecord`
 * supplies it, from Git; without it the floor applies. Returns the waivers applied — today only
 * the floor's — so a valid record that relied on one is never indistinguishable from one that did
 * not.
 */
export function validateReviewRecord(record, opts = {}) {
    const waivers = [];
    const turns = followUpTurns(record);
    // Never self-review, whichever turn: a fresh reviewer may replace another, never the author.
    if ([record, ...turns].some(turn => bareSession(record.authorSession) === bareSession(turn.reviewerSession)))
        throw new Error("reviewer must be a fresh independent session");
    if (record.outcome !== "complete")
        throw new Error(`review is ${record.outcome}; leave the PR open and disable auto-merge`);
    if (new Set(record.findings.map(f => f.id)).size !== record.findings.length)
        throw new Error("finding IDs must be unique");
    if (record.findings.some(f => f.severity !== "incidental" && f.disposition === "open"))
        throw new Error("unresolved finding");
    for (const f of record.findings) {
        if ((f.disposition === "deferred" || f.disposition === "open") && !f.roadmap)
            throw new Error(`finding ${f.id} is left ${f.disposition} without a roadmap item to track it`);
        if (f.condition && f.disposition === "fixed" && !f.conditionMet)
            throw new Error(`finding ${f.id} was cleared conditionally; record conditionMet with the evidence that was run`);
        if (f.conditionMet && !f.condition)
            throw new Error(`finding ${f.id} records conditionMet without a reviewer condition`);
    }
    const substantive = record.findings.some(f => f.severity === "substantive");
    // A substantive finding the reviewer pre-cleared under a condition, and the author fixed
    // under it, needs no turn; any other substantive finding still does.
    const unconditional = record.findings.some(f => f.severity === "substantive" && !(f.condition && f.disposition === "fixed" && f.conditionMet));
    for (const turn of [record, ...turns]) {
        if (!turn.timing && record.version === 2)
            throw new Error("version 2 requires measured timing for the initial review and every follow-up");
        if (turn.timing && Math.abs(turn.elapsedMinutes - turn.timing.durationMs / 60000) > 1e-9) {
            throw new Error("elapsedMinutes must equal timing.durationMs / 60000 without rounding; use the measured duration, never a reviewer estimate");
        }
        if (record.version === 2 && turn.timing?.durationMs === 0) {
            throw new Error("version 2 requires a positive measured duration for every turn; zero is the template placeholder");
        }
    }
    if (unconditional && !turns.length)
        throw new Error("substantive findings require a follow-up review turn unless cleared under a recorded condition");
    if (record.findings.some(f => f.severity === "substantive" && f.disposition !== "fixed" && f.disposition !== "disputed"))
        throw new Error("substantive findings cannot be deferred");
    const budget = REVIEW_BUDGET_MINUTES[record.risk];
    const multiplier = record.extensionReason ? 1.5 : 1;
    // A ceiling binds a turn that renders a verdict. A turn that ran out of time is recorded
    // incomplete with its honest measurement and gives no clearance, and the next turn (the same
    // reviewer resumed, or a fresh one) continues; refusing the record for it would leave a timed-out
    // review blocked for good, which is the stall this contract exists to prevent.
    const overrun = (turn, ceiling) => turn.outcome !== "incomplete" && turn.elapsedMinutes > ceiling;
    if (overrun({ outcome: record.initialOutcome ?? record.outcome, elapsedMinutes: record.elapsedMinutes }, budget * multiplier))
        throw new Error("review exceeded its budget; record incomplete and escalate instead of claiming completion");
    // Five ordinary turns need nobody's approval, the initial review and incomplete turns included;
    // each one after that carries its own humanAuthorization. Finalization stays outside the count.
    let ordinal = 1;
    for (const turn of turns) {
        if (turn.finalization)
            continue;
        ordinal += 1;
        if (ordinal > MAX_REVIEW_TURNS && !turn.humanAuthorization) {
            throw new Error(`review turn ${ordinal} is beyond the ${MAX_REVIEW_TURNS} automatic turns (the initial review counts); each ordinary turn after the fifth needs explicit humanAuthorization`);
        }
    }
    // An incomplete initial turn (timeout, crash, lost session, missing evidence) is followed by
    // another turn without anyone's approval: the same reviewer resumed, or a fresh one. It is not a
    // clearance, so that turn needs no late-correction scope reason. The verdict stays recorded.
    const resumed = record.initialOutcome === "incomplete";
    if (resumed && !turns.length)
        throw new Error("an incomplete initial review needs a later turn that clears; resume the reviewer or start a fresh one with the earlier findings");
    // Normal and high risk require a measured initial pass of at least 30 seconds.
    // Small risk keeps no floor: a one-line change can genuinely be read faster.
    // A pass under the floor is not a review, so it cannot count as one. It can only be preserved
    // as incomplete, and the review is then a later ordinary turn, which must meet the floor itself
    // and clear. Without this the resumption the contract offers never lands.
    // A trivially small change (TRIVIAL_DIFF_MAX_LINES) is waived: there the floor measures the diff.
    // The waiver relaxes the 30 seconds, not the measurement: a zero duration is the template's
    // placeholder, so a record with any zero-length turn never qualifies.
    const rescuedByTurn = turns.some(turn => !turn.finalization && turn.outcome === "cleared" && turn.elapsedMinutes >= 0.5);
    if (record.risk !== "small" && record.elapsedMinutes < 0.5 && !(resumed && rescuedByTurn)) {
        const measured = [record, ...turns].every(turn => turn.elapsedMinutes > 0);
        const size = measured ? opts.trivialChange?.() : undefined;
        if (!size?.trivial) {
            const why = size ? ` (not a trivial change: ${size.reason})` : "";
            // A finalization turn only closes out an existing clearance, so it is never the review that counts.
            if (!resumed)
                throw new Error(`an initial review under 30 seconds at normal or high risk is not a review; record it as initialOutcome incomplete, or record what was actually done${why}`);
            throw new Error(`an initial review under 30 seconds at normal or high risk needs a later turn of at least 30 seconds that clears${why}`);
        }
        waivers.push(floorWaiver(size));
    }
    // A turn after a clearance is a late correction, such as a fix full CI asked for after the
    // reviewer cleared the code. It spends one of the remaining turns and must name the scope
    // decision in its scopeReason, so the record shows why a cleared review was reopened. A turn
    // after blocked, after incomplete, or after substantive initial findings is an ordinary
    // follow-up and needs none. Per-turn budget checks still reject exhausted turns, historical ones included.
    if (!substantive && !resumed && turns[0] && !turns[0].scopeReason)
        throw new Error("a follow-up after a clean initial review is a late correction and needs an explicit scope reason");
    checkHandoffs(record, turns);
    // One automatic finalization-only turn per pull request, outside the five-turn count. It finishes
    // an approved change: it cannot resolve a substantive finding, run long, or be repeated, and a
    // reviewer that still has a concern records blocked or incomplete instead, which stays blocked.
    // An ordinary turn may follow it within the automatic five, as a late correction with its scope reason.
    const finalizations = turns.filter(turn => turn.finalization);
    if (finalizations.length > 1)
        throw new Error("a pull request gets one automatic finalization-only turn; record a second as an ordinary turn");
    const finalization = finalizations[0];
    if (finalization) {
        const finalizationIndex = turns.indexOf(finalization);
        if (finalization.outcome !== "cleared")
            throw new Error(`a finalization turn that is ${finalization.outcome} leaves the pull request blocked; it cannot be recorded as finalization`);
        if (finalization.elapsedMinutes > FINALIZATION_CEILING_MINUTES)
            throw new Error(`a finalization turn is capped at ${FINALIZATION_CEILING_MINUTES} minutes; anything longer is a review and spends a turn`);
        if (!finalization.scopeReason)
            throw new Error("a finalization turn must name what it finalized in its scopeReason, so it cannot quietly become a new topic");
        // It finalizes a clearance, so there has to be one. Without this, the five-minute automatic turn
        // is what turns a review the reviewer blocked on a substantive finding into a merge.
        const previous = turns[finalizationIndex - 1];
        // With no earlier follow-up, the predecessor is the initial turn: a clearance unless it was
        // preserved as incomplete, which a finalization turn cannot repair.
        const previousOutcome = previous?.outcome ?? (resumed ? "incomplete" : "cleared");
        if (previousOutcome !== "cleared")
            throw new Error(`a finalization turn only follows a cleared turn; the ${previousOutcome} turn before it leaves the pull request blocked`);
        if (unconditional && previous?.outcome !== "cleared")
            throw new Error("an automatic finalization turn cannot resolve substantive findings; an ordinary turn must clear them first");
    }
    const verifications = turns.filter(turn => turn.verification);
    if (verifications.length > 1)
        throw new Error("only one automatic final verification turn is allowed");
    const verification = verifications[0];
    if (verification) {
        const index = turns.indexOf(verification);
        if (index !== VERIFICATION_TURN_INDEX || verification.humanAuthorization || verification.finalization) {
            throw new Error("automatic final verification is only the fourth ordinary turn");
        }
        if (finalization && turns.indexOf(finalization) < index) {
            throw new Error("nothing follows finalization automatically");
        }
        if (index < 1 || turns[index - 1].outcome === "incomplete") {
            throw new Error("final verification cannot resume an incomplete review");
        }
        if (!verification.scopeReason || verification.outcome !== "cleared") {
            throw new Error("final verification needs a scope reason and a cleared outcome; unresolved concerns escalate");
        }
        if (verification.elapsedMinutes > FINAL_VERIFICATION_CEILING_MINUTES) {
            throw new Error(`final verification exceeded its ${FINAL_VERIFICATION_CEILING_MINUTES}-minute ceiling`);
        }
        const ordinaryMinutes = record.elapsedMinutes + turns.slice(0, index + 1)
            .filter(turn => !turn.finalization).reduce((sum, turn) => sum + turn.elapsedMinutes, 0);
        if (ordinaryMinutes > budget * 2) {
            throw new Error("final verification exceeded the cumulative two-initial-budget limit");
        }
    }
    turns.forEach((turn, index) => {
        // A follow-up is half the initial budget because its reviewer already holds the context. A fresh
        // reviewer taking over does not, so its ordinary turn gets the initial ceiling (no extension).
        const fresh = !sameReviewer(turn.reviewerSession, (turns[index - 1] ?? record).reviewerSession);
        const ceiling = fresh && !turn.finalization && !turn.verification ? budget : budget / 2;
        if (overrun(turn, ceiling))
            throw new Error(fresh ? "a fresh reviewer's turn exceeded the initial-review budget; record it incomplete and continue with another turn" : "follow-up exceeded its budget; record it incomplete and continue with another turn instead of claiming a verdict");
        const next = turns[index + 1];
        if (!next) {
            // With a conditional clearance the author's fix may land after the final turn; the commit
            // check then happens in checkLocalReview, which can see the paths.
            const coversLast = turn.commit === record.covered || conditionallyCleared(record).length > 0;
            if (turn.outcome !== "cleared" || !coversLast)
                throw new Error("the final follow-up must clear the covered commit");
        }
        else if (turn.outcome === "cleared" && !next.scopeReason) {
            throw new Error("a turn after a cleared turn is a late correction and needs an explicit scope reason; otherwise a turn follows only a blocked or incomplete one");
        }
    });
    return waivers;
}
/**
 * A fresh reviewer may take over from any turn, with no human approval: the session timed out, was
 * lost, or simply cannot be resumed. What stops that becoming reviewer shopping is that nothing the
 * earlier reviewers found goes missing. The handoff names every finding recorded before the turn,
 * each one stays in the record with its severity and disposition, and a `blocked` turn that is
 * handed over names the substantive findings it blocked on, so they cannot quietly disappear.
 */
function checkHandoffs(record, turns) {
    const ids = new Map(record.findings.map(f => [f.id, f]));
    const turnCount = turns.length + 1;
    for (const f of record.findings) {
        if ((f.turn ?? 1) > turnCount)
            throw new Error(`finding ${f.id} names turn ${f.turn}, but the record has ${turnCount} turn${turnCount === 1 ? "" : "s"}`);
    }
    turns.forEach((turn, index) => {
        const number = index + 2;
        const previous = turns[index - 1] ?? record;
        if (turn.blockedOn) {
            if (turn.outcome !== "blocked")
                throw new Error(`turn ${number} records blockedOn but returned ${turn.outcome}`);
            for (const id of turn.blockedOn) {
                const finding = ids.get(id);
                if (!finding)
                    throw new Error(`turn ${number} blocked on finding ${id}, which is not in the record; a reviewer's blocking findings are never dropped`);
                if (finding.severity !== "substantive")
                    throw new Error(`turn ${number} blocked on ${id}, a ${finding.severity} finding; only substantive findings block`);
                if ((finding.turn ?? 1) > number)
                    throw new Error(`turn ${number} blocked on ${id}, which a later turn raised`);
            }
        }
        if (sameReviewer(turn.reviewerSession, previous.reviewerSession)) {
            if (turn.handoff)
                throw new Error(`turn ${number} records a handoff but uses the same reviewer session as the turn before it`);
            return;
        }
        if (!turn.handoff)
            throw new Error(`turn ${number} is taken by a fresh reviewer session; record handoff { reason, findings } naming every earlier finding it was given`);
        if (previous.outcome === "blocked" && !previous.blockedOn?.length) {
            throw new Error(`the blocked turn before turn ${number} must name its substantive findings in blockedOn when a fresh reviewer takes over`);
        }
        const earlier = record.findings.filter(f => (f.turn ?? 1) < number).map(f => f.id);
        const given = new Set(turn.handoff.findings);
        const dropped = earlier.filter(id => !given.has(id));
        if (dropped.length)
            throw new Error(`the fresh reviewer at turn ${number} was not given earlier finding${dropped.length === 1 ? "" : "s"} ${dropped.join(", ")}; every earlier finding goes to the fresh reviewer`);
        const unknown = [...given].filter(id => !earlier.includes(id));
        if (unknown.length)
            throw new Error(`the handoff at turn ${number} names ${unknown.join(", ")}, which ${unknown.length === 1 ? "is not an earlier finding" : "are not earlier findings"} in this record; a finding given to a reviewer stays in the record`);
    });
}
export function changedPaths(root, older, newer) {
    return git(root, ["diff", "--name-only", "-z", "--no-renames", older, newer, "--"]).split("\0").filter(Boolean);
}
const ROADMAP_DIR = "hq/product/roadmap/";
/** The committed item must be a direct, regular Markdown file that the roadmap parser accepts. */
function committedRoadmapPath(root, commit, id) {
    const entries = git(root, ["ls-tree", "-r", "-z", commit, "--", ROADMAP_DIR]).split("\0").filter(Boolean);
    for (const entry of entries) {
        const match = /^100644 blob [a-f0-9]{40}\t(.+)$/.exec(entry);
        if (!match)
            continue;
        const path = match[1];
        const name = path.startsWith(ROADMAP_DIR) ? path.slice(ROADMAP_DIR.length) : "";
        if (!name || name.includes("/") || !(name === `${id}.md` || (name.startsWith(`${id}-`) && name.endsWith(".md"))))
            continue;
        try {
            const parsed = RoadmapItem.safeParse(matter(git(root, ["show", `${commit}:${path}`])).data);
            if (parsed.success && parsed.data.id === id)
                return path;
        }
        catch { /* Invalid YAML is not a filed ticket. */ }
    }
    return null;
}
/** A trunk merge can introduce an item, but it is not an author-filed ticket in this range. */
function addedByAuthor(root, from, to, path) {
    let previous = from;
    for (const commit of git(root, ["rev-list", "--first-parent", "--reverse", `${from}..${to}`]).split("\n").filter(Boolean)) {
        const had = git(root, ["ls-tree", previous, "--", path]);
        const has = git(root, ["ls-tree", commit, "--", path]);
        if (!had && has)
            return git(root, ["show", "-s", "--format=%P", commit]).split(" ").length === 1;
        previous = commit;
    }
    return false;
}
/**
 * A reviewer can discover an incidental defect after `reviewed` was committed. Filing its
 * deferred/open ticket is record keeping only when an author commit added a valid item here.
 * Existing roadmap edits and unrelated tickets still need review coverage.
 */
function newlyFiledDeferralPaths(root, record, from, to) {
    const ids = new Set(record.findings.filter(f => f.disposition === "deferred" || f.disposition === "open").map(f => f.roadmap).filter((id) => Boolean(id)));
    return [...ids].flatMap(id => {
        const path = committedRoadmapPath(root, to, id);
        return path && !git(root, ["ls-tree", from, "--", path]) && addedByAuthor(root, from, to, path) ? [path] : [];
    });
}
/** True when Git's own merge of the two parents reproduces this commit's tree exactly: nothing was hand-edited. */
function exactMerge(root, commit, parents) {
    let expected = "";
    // merge-tree exits non-zero on a conflict; that is simply "not exact", not a failure to report.
    try {
        expected = git(root, ["merge-tree", "--write-tree", parents[0], parents[1]]);
    }
    catch {
        return false;
    }
    return /^[a-f0-9]{40}$/.test(expected) && git(root, ["rev-parse", `${commit}^{tree}`]) === expected;
}
/**
 * Walk the first-parent commits in a range that the reviewer did not clear. Merging trunk never
 * invalidates coverage, as on a human team: a merge Git reproduces exactly passes on its own, and a
 * hand-resolved one passes when the record names it, so the unreviewed resolution is visible rather
 * than hidden. Any other commit may touch only the allowed paths. Returns the merges it accepted.
 */
export function verifyUncoveredCommits(root, record, from, to, trunk, allowed, refusal) {
    const named = new Map((record.trunkIntegrations ?? []).map(entry => [entry.commit, entry]));
    const accepted = new Set();
    for (const commit of git(root, ["rev-list", "--first-parent", "--reverse", `${from}..${to}`]).split("\n").filter(Boolean)) {
        const parents = git(root, ["show", "-s", "--format=%P", commit]).split(" ");
        if (parents.length === 2) {
            if (!isAncestor(root, parents[1], trunk))
                throw new Error("a merge after review coverage may bring in trunk only");
            if (!exactMerge(root, commit, parents) && !named.has(commit)) {
                throw new Error("a hand-resolved trunk merge after review coverage must be named in trunkIntegrations with its reason");
            }
            accepted.add(commit);
            continue;
        }
        if (parents.length !== 1)
            throw new Error("only two-parent trunk merges are accepted after review coverage");
        if (changedPaths(root, parents[0], commit).some(p => !allowed.has(p)))
            throw new Error(refusal);
    }
    return accepted;
}
/** Additional review-policy sources that are prose, but change the gate's authority. */
const FINAL_VERIFICATION_POLICY = /^(?:architecture\.md|docs\/runbooks\/independent-review\.md|\.agent\/decisions\.md)$/i;
/** Bound only author commits; a main merge keeps its existing exact/named integration rule. */
function verifyFinalVerification(root, record, turn, from, trunk, worklog) {
    const scope = turn.verification;
    const attested = new Set(scope.paths);
    const allowedFindings = new Set(record.findings.filter(f => f.disposition === "fixed").flatMap(f => f.paths));
    for (const path of attested) {
        if (NORMATIVE.test(path) || FINAL_VERIFICATION_POLICY.test(path))
            throw new Error(`final verification cannot cover normative policy: ${path}`);
        if (scope.kind === "late-test" && !TRIVIAL_DIFF_TESTS.test(path))
            throw new Error(`late-test verification can cover test files only: ${path}`);
        if (scope.kind === "finding-fix" && !TRIVIAL_DIFF_TESTS.test(path) && !allowedFindings.has(path)) {
            throw new Error(`finding-fix verification needs a previously recorded finding path: ${path}`);
        }
    }
    verifyUncoveredCommits(root, record, from, turn.commit, trunk, new Set([worklog, ...attested]), "final verification changed a path outside its attested scope");
    const changed = new Set();
    let testLines = 0;
    let nonTestLines = 0;
    for (const commit of git(root, ["rev-list", "--first-parent", "--reverse", `${from}..${turn.commit}`]).split("\n").filter(Boolean)) {
        const parents = git(root, ["show", "-s", "--format=%P", commit]).split(" ");
        if (parents.length !== 1)
            continue;
        for (const line of git(root, ["diff", "--numstat", "--no-renames", parents[0], commit, "--"]).split("\n").filter(Boolean)) {
            const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
            if (!match || match[1] === "-" || match[2] === "-")
                throw new Error("final verification cannot cover binary or unmeasurable changes");
            const path = match[3];
            if (path === worklog)
                continue;
            changed.add(path);
            const lines = Number(match[1]) + Number(match[2]);
            if (TRIVIAL_DIFF_TESTS.test(path))
                testLines += lines;
            else
                nonTestLines += lines;
        }
    }
    if (changed.size === 0 || changed.size > 4 || changed.size !== attested.size || [...changed].some(path => !attested.has(path))) {
        throw new Error("final verification must attest exactly one to four changed paths");
    }
    if (testLines > FINAL_VERIFICATION_TEST_LINES || nonTestLines > FINAL_VERIFICATION_NON_TEST_LINES) {
        throw new Error(`final verification exceeds the ${FINAL_VERIFICATION_TEST_LINES} test-line or ${FINAL_VERIFICATION_NON_TEST_LINES} non-test-line limit`);
    }
}
/** First-parent two-parent merges in a range whose second parent is trunk history. */
function trunkMerges(root, from, to, trunk) {
    return git(root, ["rev-list", "--first-parent", "--merges", `${from}..${to}`]).split("\n").filter(Boolean).filter(commit => {
        const parents = git(root, ["show", "-s", "--format=%P", commit]).split(" ");
        return parents.length === 2 && isAncestor(root, parents[1], trunk);
    });
}
/**
 * The project manifest as committed at `commit`, for the review gate.
 *
 * Two different absences, answered differently. A commit this checkout does not hold is a fact
 * about the checkout (shallow, single-branch, or a head pushed after the event was sent), not about
 * the pull request, so it is named as such instead of surfacing as a raw `git show` failure. A
 * manifest absent at a commit that is present means the project has no configuration there, and
 * the defaults apply: review stays required, which is the safe direction.
 */
export function committedConfig(root, commit) {
    try {
        git(root, ["cat-file", "-e", `${commit}^{commit}`]);
    }
    catch {
        throw new Error(`commit ${commit} is not in this checkout, so morpheus.json and the review record at the pull request head cannot be read. Fetch it (git fetch origin ${commit}) or check out with full history, then re-run.`);
    }
    if (!git(root, ["ls-tree", "--name-only", commit, "--", "morpheus.json"]))
        return {};
    const text = git(root, ["show", `${commit}:morpheus.json`]);
    try {
        return JSON.parse(text);
    }
    catch (error) {
        throw new Error(`morpheus.json at ${commit.slice(0, 12)} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * A PR without the label is never passed here, draft or not. Keeping a draft from going red is the
 * caller's job: its `pr` job skips an unlabelled draft, which leaves the required check unreported,
 * and an unreported required check blocks merge where a passing or skipped one would not.
 */
export const MISSING_LABEL = "agent-reviewed label is not applied, so the PR is not marked merge-ready. Review record validation was not run. Apply the label once independent review covers the current head; leave it absent while a correction or follow-up is pending. While review is under way, keep the PR a draft (gh pr ready --undo): conventions then wait, unreported, until it is labelled or marked ready.";
/** Read only committed evidence; paths and refs are data, never shell text. */
export function checkLocalReview(opts) {
    try {
        const config = committedConfig(opts.root, opts.head);
        if (!reviewRequired(config))
            return [{ level: "waived", rule: "agent-review", message: "independent review disabled by project review.required=false" }];
        if (!opts.labels.includes("agent-reviewed"))
            throw new Error(MISSING_LABEL);
        const { waivers } = verifyReviewRecord({ root: opts.root, path: reviewRecordLine(opts.body), head: opts.head, base: opts.base });
        return waivers.map(message => ({ level: "waived", rule: REVIEW_FLOOR_RULE, message }));
    }
    catch (error) {
        return [{ level: "error", rule: "agent-review", message: error instanceof Error ? error.message : String(error) }];
    }
}
/** The worklog path a PR body's single visible `review-record:` line names; throws CI's message otherwise. */
export function reviewRecordLine(body) {
    const lines = [...visibleProse(body).matchAll(/^review-record:[ \t]*(\S+)[ \t]*$/gm)];
    if (lines.length !== 1)
        throw new Error("PR body needs one visible review-record: .agent/worklog/<task>.md line");
    return lines[0][1];
}
/**
 * Everything the gate checks once it knows which worklog holds the record: the same function
 * `check pr` runs in CI and `review validate` runs before a push, so the two cannot disagree.
 * Throws the first problem found; returns the record and any waiver its validation applied.
 */
export function verifyReviewRecord(opts) {
    const path = opts.path;
    if (!/^\.agent\/worklog\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(path))
        throw new Error("review-record must name a worklog Markdown file");
    const mode = git(opts.root, ["ls-tree", opts.head, "--", path]).split(" ")[0];
    if (mode !== "100644")
        throw new Error("review worklog must be a regular committed file");
    const record = parseReviewRecord(git(opts.root, ["show", `${opts.head}:${path}`]));
    // The whole reviewed change, base to covered. A trunk merge inside it only adds lines, which errs
    // toward keeping the floor; a range that cannot be measured keeps it too.
    const waivers = validateReviewRecord(record, { trivialChange: () => {
            try {
                return trivialDiff(opts.root, record.base, record.covered);
            }
            catch {
                return { trivial: false, reason: "the reviewed range could not be measured", nonTestLines: 0, testLines: 0 };
            }
        } });
    checkFreshReviewer(opts.root, record, path, opts.head);
    checkTrackedDeferrals(opts.root, record, opts.head);
    // Named rather than left to a raw `git merge-base` failure, which reads as a tool crash.
    for (const [older, newer, olderName, newerName] of [[record.base, record.reviewed, "base", "reviewed"], [record.reviewed, record.covered, "reviewed", "covered"], [record.covered, opts.head, "covered", "the PR head"]]) {
        if (!isAncestor(opts.root, older, newer))
            throw new Error(`record ${olderName} ${older.slice(0, 12)} is not an ancestor of ${newerName} ${newer.slice(0, 12)} on this branch (or is not in this checkout); base, reviewed, covered and the head must form one chain`);
    }
    checkFollowUpChain(opts.root, record);
    // The reviewer's base must be real trunk history behind this PR; trunk may have moved on since.
    if (!isAncestor(opts.root, coveredBase(record), git(opts.root, ["merge-base", opts.base, opts.head]))) {
        throw new Error("the recorded review base must precede the PR's merge base with trunk; reconcile the base and coverage explicitly");
    }
    const merges = new Set();
    const turns = followUpTurns(record);
    const conditional = conditionallyCleared(record);
    if (!turns.length && record.reviewed !== record.covered) {
        const allowed = new Set([path, ...conditional, ...newlyFiledDeferralPaths(opts.root, record, record.reviewed, record.covered), ...record.findings.filter(f => f.severity === "minor" && f.disposition === "fixed").flatMap(f => f.paths)]);
        for (const commit of verifyUncoveredCommits(opts.root, record, record.reviewed, record.covered, opts.base, allowed, "author-only fixes exceed the minor finding paths and reviewer conditions; review coverage must be renewed explicitly"))
            merges.add(commit);
    }
    const last = turns[turns.length - 1];
    if (last && last.commit !== record.covered) {
        // Only a conditional clearance lets `covered` run past the final turn, and only within its paths.
        if (!isAncestor(opts.root, last.commit, record.covered))
            throw new Error("the final follow-up must clear the covered commit");
        for (const commit of verifyUncoveredCommits(opts.root, record, last.commit, record.covered, opts.base, new Set([path, ...conditional, ...newlyFiledDeferralPaths(opts.root, record, last.commit, record.covered)]), "author fixes after the final follow-up exceed the reviewer's recorded conditions"))
            merges.add(commit);
    }
    // The attestation is checked against the diff it claims to cover, so an automatic turn cannot
    // clear implementation by naming a documentation path.
    for (const [index, turn] of turns.entries()) {
        if (!turn.finalization)
            continue;
        const problems = finalizationProblems(record, turn, path);
        if (problems.length)
            throw new Error(`finalization turn is out of scope: ${problems.join("; ")}`);
        const from = turns[index - 1]?.commit ?? record.reviewed;
        const allowed = new Set([path, ...conditional, ...turn.finalization.paths]);
        for (const commit of verifyUncoveredCommits(opts.root, record, from, turn.commit, opts.base, allowed, "a finalization turn may cover only the review record, previously conditioned paths and the explanatory documentation it attested"))
            merges.add(commit);
    }
    for (const [index, turn] of turns.entries()) {
        if (!turn.verification)
            continue;
        verifyFinalVerification(opts.root, record, turn, turns[index - 1]?.commit ?? record.reviewed, opts.base, path);
    }
    for (const commit of verifyUncoveredCommits(opts.root, record, record.covered, opts.head, opts.base, new Set([path]), "changes after covered commit invalidate review (only its worklog and trunk merges may follow)"))
        merges.add(commit);
    // A hand-resolved merge named before a late correction moved `covered` past it now sits in a
    // range the correction turn cleared. The entry stays true and accepted; it is not stray.
    if (followUpTurns(record).length)
        for (const commit of trunkMerges(opts.root, record.reviewed, record.covered, opts.base))
            merges.add(commit);
    const stray = (record.trunkIntegrations ?? []).find(entry => !merges.has(entry.commit));
    if (stray)
        throw new Error("trunkIntegrations names a commit that is not a trunk merge on this branch after review");
    return { record, waivers };
}
/**
 * A reviewer session reviews one task. The same id in another worklog means the reviewer was
 * reused or the id was composed, and either way it is not the fresh session the contract requires.
 * Every session in the record is checked: a fresh reviewer that took over a turn is held to the
 * same rule as the one that started.
 */
function checkFreshReviewer(root, record, worklog, head) {
    for (const session of reviewerSessions(record)) {
        const other = reusedIn(root, record.authorSession, session, worklog, head);
        if (other)
            throw new Error(`reviewer session ${session} already appears in ${other}; every review needs a fresh reviewer session`);
    }
}
function reusedIn(root, authorSession, session, worklog, head) {
    // Compare the bare id: a provider prefix or a change of case is the same session, not a new one.
    const bare = bareSession(session);
    let hits = [];
    try {
        hits = git(root, ["grep", "-l", "-i", "-F", bare, head, "--", ".agent/worklog"]).split("\n").filter(Boolean);
    }
    catch {
        hits = [];
    }
    return hits.map(hit => hit.replace(/^[^:]*:/, "")).find(p => {
        if (p === worklog)
            return false;
        if (!TaskSession.test(session))
            return true;
        // Task paths are local to a root runner session. Inspect structured identities rather
        // than prose mentions (or prefixes such as /root/review versus /root/review_extra),
        // including the sessions of an earlier record's follow-up turns.
        const markdown = git(root, ["show", `${head}:${p}`]);
        return [...markdown.matchAll(/^```morpheus-review\r?\n([\s\S]*?)^```[ \t]*$/gm)].some(block => {
            let previous;
            try {
                previous = JSON.parse(block[1]);
            }
            catch {
                return false;
            }
            const turn = z.object({ reviewerSession: z.string().trim() }).passthrough();
            const identity = z.object({ authorSession: z.string().trim(), reviewerSession: z.string().trim(), followUp: turn.optional(), followUps: z.array(turn).optional() }).passthrough().safeParse(previous);
            if (!identity.success || bareSession(identity.data.authorSession) !== bareSession(authorSession))
                return false;
            const sessions = [identity.data.reviewerSession, identity.data.followUp?.reviewerSession, ...(identity.data.followUps ?? []).map(t => t.reviewerSession)];
            return sessions.some(s => s === session.trim());
        });
    });
}
/** A deferral is a ticket, not a sentence: the named roadmap item must exist on this branch. */
function checkTrackedDeferrals(root, record, head) {
    const ids = [...new Set(record.findings.map(f => f.roadmap).filter((id) => Boolean(id)))];
    if (!ids.length)
        return;
    for (const id of ids) {
        if (!committedRoadmapPath(root, head, id))
            throw new Error(`finding tracked by ${id}, but no such roadmap item exists on this branch; file it with pm new`);
    }
}
/**
 * Each follow-up turn must sit on the commit chain after the one before it, and a turn that
 * moved the base must say why and keep the bases in trunk order as well.
 */
function checkFollowUpChain(root, record) {
    let previousCommit = record.reviewed;
    let previousBase = record.base;
    for (const turn of followUpTurns(record)) {
        if (!isAncestor(root, previousCommit, turn.commit))
            throw new Error("follow-up turns must be recorded in commit order, each covering a descendant of the last");
        if (turn.base) {
            if (!turn.scopeReason)
                throw new Error("base integration requires an explicit follow-up scope reason");
            if (!isAncestor(root, previousBase, turn.base) || !isAncestor(root, turn.base, turn.commit))
                throw new Error("a follow-up base must move forward along trunk and precede that turn's commit");
            previousBase = turn.base;
        }
        previousCommit = turn.commit;
    }
}
//# sourceMappingURL=local.js.map