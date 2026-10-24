import { z } from "zod";
import { visibleProse } from "../check/pr.js";
import {
  DORMANT_LABEL,
  type GhManagerPolicy,
  humanGatedPaths,
  INCOMPLETE_LABEL,
  MANAGER_REVIEWED_LABEL,
  NEEDS_HUMAN_LABEL,
  STALE_LABEL,
} from "./policy.js";
import { hasWipName, isWorkInProgress, type ManagerMarker, renderMarker, type Routed } from "./sweep.js";

/**
 * What a session asks for, and what is actually done about it.
 *
 * The session holds a token with contents write and nothing else to write
 * with: it cannot label, comment or close. It writes a decision
 * file instead, and this module turns that file into operations only after
 * checking it against live state and the repository's policy. A decision is a
 * request from a model that has been reading a pull request's text; the plan
 * is what a deterministic step is willing to do about it.
 *
 * Two orderings below are load-bearing. The audit comment is always the first
 * operation, because it carries the marker: an attempt that failed half-way
 * must still be counted, and `check pr` reads the cleared head from that
 * comment when the label event re-triggers it. And the manager's label is
 * removed and re-applied on every clearance, so the event that selects the
 * manager path is always the App's and always follows the comment.
 */

const Sha = z.string().regex(/^[a-f0-9]{40}$/);
const Text = z.string().trim().min(8);

export const Decision = z.object({
  version: z.literal(1),
  pr: z.number().int().positive(),
  /** The branch head when the session finished, after anything it pushed. */
  head: Sha,
  /** `ready` and `dormant` are triage decisions, accepted only from a triage session. */
  action: z.enum(["merge", "escalate", "close", "incomplete", "ready", "dormant", "wait"]),
  /** One paragraph: what the session found and did. */
  summary: Text,
  /** Why this action and not another. */
  reasoning: Text,
  /** True when the merge rests on the manager's own review record rather than the author's. */
  usedManagerReview: z.boolean().default(false),
  /** A complete replacement pull request body, when the session had to repair it. */
  body: z.string().max(60_000).optional(),
  /**
   * Screenshots the session captured into its evidence directory. The apply step publishes them
   * and replaces each `{{gh-manager-evidence:<file>}}` in `body` with the image.
   */
  evidence: z.array(z.object({ file: z.string().min(1).max(100), caption: z.string().trim().min(3).max(200) }).strict()).max(20).default([]),
  /** Mark a draft ready for review. */
  markReady: z.boolean().default(false),
  /** For `close`: the merged pull request that made this one obsolete. */
  supersededBy: z.number().int().positive().optional(),
  /** For `incomplete`: what the roadmap item asks for that the branch does not yet do. */
  missing: Text.optional(),
  /** For a triage `incomplete`: the tests, evidence or benchmarks whoever finishes it must run. */
  remainingChecks: Text.optional(),
  /** For `escalate`: the decision a human has to make. */
  needsHuman: Text.optional(),
  findings: z.array(z.object({
    id: z.string().trim().min(3),
    severity: z.enum(["minor", "substantive", "incidental"]),
    description: Text,
    disposition: z.enum(["fixed", "noted"]),
  }).strict()).max(50).default([]),
}).strict();
export type Decision = z.infer<typeof Decision>;

export type Operation =
  | { kind: "set-body"; body: string }
  | { kind: "ready" }
  | { kind: "add-label"; label: string }
  | { kind: "remove-label"; label: string }
  | { kind: "auto-merge" }
  /**
   * Merge the base into the branch with GitHub's update-branch endpoint, guarded on the head the
   * plan was made for: if anyone pushed in between, GitHub refuses rather than merging over it.
   * A merge GitHub performs reproduces exactly, so it keeps any review on record valid.
   */
  | { kind: "update-branch"; expectedHead: string }
  | { kind: "disable-auto-merge" }
  | { kind: "rerun"; runIds: number[] }
  | { kind: "close" }
  | { kind: "comment"; body: string };

/** Live facts the plan is checked against, read after the session ended. */
export interface LiveState {
  headSha: string;
  title: string;
  headRefName: string;
  isDraft: boolean;
  labels: string[];
  autoMerge: boolean;
  /** Strict protection holds the branch behind its base; see `PullRequestFacts.behind`. */
  behind?: boolean | undefined;
  body: string;
  /** Every path the pull request changes against its base. */
  changedFiles: string[];
  /** Whether `supersededBy` names a merged pull request; undefined when it could not be read. */
  supersededMerged?: boolean | undefined;
  /** Runs to rerun because their check was cancelled. */
  cancelledRunIds: number[];
  /**
   * What the session pushed, verified with real Git by the apply step: nothing, only merges of
   * trunk that Git reproduces exactly, or anything else. `unverified` when it could not be
   * determined, which is treated as `other`.
   */
  sessionPushed: "nothing" | "trunk-merges" | "other" | "unverified";
  /**
   * Why the manager's review record at this head would be refused by `check pr`, when the
   * decision rests on one. Undefined means it validates, or that no record was claimed.
   */
  recordProblem?: string | undefined;
  /** The author's record was checked against this head even if its label is missing. */
  authorRecordValid?: boolean | undefined;
  authorRecordProblem?: string | undefined;
}

export interface Plan {
  verdict: ManagerMarker["verdict"];
  /** Set when the plan differs from what the session asked for, and why. */
  overridden?: string;
  operations: Operation[];
}

interface Context {
  policy: GhManagerPolicy;
  /** Sessions spent on this pull request before this run. */
  attempts: number;
  now: Date;
  /** Link to the run, for the audit comment. */
  runUrl: string;
}

const HEADLINE: Record<ManagerMarker["verdict"], string> = {
  merge: "auto-merge enabled",
  escalate: "needs a human",
  close: "closed as obsolete",
  "warn-stale": "looks obsolete — will close after the grace period",
  incomplete: "incomplete against its roadmap item",
  ready: "triaged: reads as complete",
  dormant: "triaged: dormant until someone resumes it",
  wait: "no action",
};

function comment(verdict: ManagerMarker["verdict"], sections: string[], marker: ManagerMarker): Operation {
  return { kind: "comment", body: [`### GitHub Manager — ${HEADLINE[verdict]}`, ...sections.filter(Boolean), renderMarker(marker)].join("\n\n") };
}

function holdWorkInProgress(live: LiveState, marker: ManagerMarker, run: string): Plan {
  if (!live.autoMerge) return { verdict: "wait", operations: [] };
  return { verdict: "wait", operations: [
    comment("wait", ["This pull request is marked WIP. Cancelling queued auto-merge; a human can make it ready when the needed input arrives.", run], marker),
    { kind: "disable-auto-merge" },
  ] };
}

/**
 * Model-written text, made unable to open or close an HTML comment. The marker is an HTML
 * comment; `parseMarker` already reads only the last one, and this keeps a forged one from
 * existing at all, so the two guards do not depend on each other.
 */
export function inert(text: string): string {
  return text.replace(/<!--/g, "&lt;!--").replace(/-->/g, "--&gt;");
}

function removeLabels(live: LiveState, ...labels: string[]): Operation[] {
  return labels.filter(label => live.labels.includes(label)).map(label => ({ kind: "remove-label" as const, label }));
}

function hasVisibleLine(body: string, key: string): boolean {
  return new RegExp(`^${key}:[ \\t]*\\S+[ \\t]*$`, "m").test(visibleProse(body));
}

function escalate(live: LiveState, why: string, sections: string[], marker: ManagerMarker, overridden?: string, keepAutoMerge = false): Plan {
  return {
    verdict: "escalate",
    ...(overridden ? { overridden } : {}),
    operations: [
      comment("escalate", [`**Needs you:** ${why}`, ...sections], { ...marker, verdict: "escalate" }),
      // Normally an escalated pull request must not merge on its own. A refused update is the
      // exception: the review stands, and once a person merges the base in it should land.
      ...(live.autoMerge && !keepAutoMerge ? [{ kind: "disable-auto-merge" as const }] : []),
      // An escalated pull request is not cleared; leaving the label would let it merge on a
      // record the manager itself no longer stands behind. A refused update is different: the
      // clearance still stands, and a person's merge of the base is an exact trunk merge it
      // accepts, so the label stays and the pull request can still land.
      ...(keepAutoMerge ? [] : removeLabels(live, MANAGER_REVIEWED_LABEL)),
      ...(live.labels.includes(NEEDS_HUMAN_LABEL) ? [] : [{ kind: "add-label" as const, label: NEEDS_HUMAN_LABEL }]),
    ],
  };
}

function findingsTable(decision: Decision): string {
  if (!decision.findings.length) return "";
  const cell = (text: string) => inert(text).replace(/\|/g, "\\|").replace(/\s+/g, " ");
  return ["| Finding | Severity | Result |", "|---|---|---|", ...decision.findings.map(f => `| ${cell(f.id)}: ${cell(f.description)} | ${f.severity} | ${f.disposition} |`)].join("\n");
}

/** Turn a session's decision into operations, or into an escalation when it does not hold up. */
export function planDecision(decision: Decision, live: LiveState, ctx: Context): Plan {
  const marker: ManagerMarker = { head: live.headSha, verdict: decision.action, attempts: ctx.attempts + 1, at: ctx.now.toISOString() };
  const sections = [inert(decision.summary), `**Why:** ${inert(decision.reasoning)}`, findingsTable(decision), `Run: ${ctx.runUrl}`];
  const refuse = (why: string) => escalate(live, why, sections, marker, why);

  if (isWorkInProgress(live)) return holdWorkInProgress(live, { ...marker, verdict: "wait" }, `Run: ${ctx.runUrl}`);

  // The session reported the head it finished on. If the branch has moved since, somebody else
  // is working on it and everything the session concluded is about a different commit.
  if (decision.head !== live.headSha) {
    return { verdict: "wait", overridden: "the branch moved during the session", operations: [comment("wait", ["The branch moved while this run was working, so nothing was applied. The next run starts from the new head.", `Run: ${ctx.runUrl}`], { ...marker, verdict: "wait" })] };
  }

  if (decision.action === "wait") {
    return { verdict: "wait", operations: [comment("wait", sections, { ...marker, verdict: "wait" })] };
  }

  if (decision.action === "ready" || decision.action === "dormant") {
    const why = `\`${decision.action}\` is a triage decision, and this pull request was not sent to triage`;
    return { verdict: "wait", overridden: why, operations: [comment("wait", [`Nothing was applied: ${why}.`, ...sections], { ...marker, verdict: "wait" })] };
  }

  if (decision.action === "escalate") {
    return escalate(live, inert(decision.needsHuman ?? decision.reasoning), sections, marker);
  }

  // An abandoned draft that has not done what its roadmap item defines. Not a failure and not
  // obsolete: it is unfinished work, and saying so is what stops it reading as nearly merged.
  if (decision.action === "incomplete") {
    return {
      verdict: "incomplete",
      operations: [
        comment("incomplete", [`**Still missing:** ${inert(decision.missing ?? decision.reasoning)}`, "The manager will leave this alone until it gets a new push.", ...sections], { ...marker, verdict: "incomplete" }),
        ...(live.labels.includes(INCOMPLETE_LABEL) ? [] : [{ kind: "add-label" as const, label: INCOMPLETE_LABEL }]),
      ],
    };
  }

  if (decision.action === "close") {
    if (!ctx.policy.actions.close) return refuse("the session proposed closing this, and closing is disabled by policy");
    // Closing on a model's say-so is the one irreversible-feeling action here, so it needs a
    // fact the plan can check: the superseding pull request really merged. Anything less is a
    // warning with a grace period.
    if (decision.supersededBy !== undefined && live.supersededMerged === true) {
      return { verdict: "close", operations: [comment("close", [`Superseded by #${decision.supersededBy}, which merged. Reopen this if that is wrong; the branch is untouched.`, ...sections], marker), ...removeLabels(live, NEEDS_HUMAN_LABEL, STALE_LABEL), { kind: "close" }] };
    }
    return {
      verdict: "warn-stale",
      operations: [
        comment("warn-stale", [`This will be closed in ${ctx.policy.closeGraceDays} days unless it gets a new push or someone removes the \`${STALE_LABEL}\` label. The branch will be left in place.`, ...sections], { ...marker, verdict: "warn-stale" }),
        ...(live.labels.includes(STALE_LABEL) ? [] : [{ kind: "add-label" as const, label: STALE_LABEL }]),
      ],
    };
  }

  // merge
  if (!ctx.policy.actions.merge) return refuse("the session proposed merging, and merging is disabled by policy");
  const body = decision.body ?? live.body;
  if (live.isDraft && !(decision.markReady && ctx.policy.actions.undraft)) {
    return refuse("this is still a draft and the session did not judge it complete enough to mark ready");
  }
  const protectedPaths = humanGatedPaths(live.changedFiles, ctx.policy);
  // A manager session may have requested its own review even though the author's independent
  // review is already valid. Its own clearance cannot cover protected paths; use the author's
  // verified record only when the session and PR body are unchanged.
  const authorFallback = decision.usedManagerReview && ctx.policy.authorReviewedProtectedMerge &&
    protectedPaths.length > 0 && live.authorRecordValid === true &&
    live.sessionPushed === "nothing" && !live.isDraft &&
    (decision.body === undefined || decision.body === live.body);
  const useManagerReview = decision.usedManagerReview && !authorFallback;
  if (useManagerReview) {
    if (!ctx.policy.actions.review) return refuse("the merge rests on a manager review, and manager review is disabled by policy");
    if (protectedPaths.length) return refuse(`this changes ${protectedPaths.slice(0, 3).join(", ")}${protectedPaths.length > 3 ? ` and ${protectedPaths.length - 3} more` : ""}, which the manager may not clear on its own review`);
    if (!hasVisibleLine(body, "manager-review-record")) return refuse("the session claimed a manager review but the pull request body carries no manager-review-record: line");
    // Checked here with the same code `check pr` runs, so a record the gate would refuse is an
    // escalation now rather than a red check and another session later.
    if (live.recordProblem) return refuse(`the manager review record does not validate: ${live.recordProblem}`);
  } else {
    if (!live.labels.includes("agent-reviewed") && !live.authorRecordValid) {
      return refuse(live.authorRecordProblem
        ? `the author's independent review record does not validate: ${live.authorRecordProblem}`
        : "the session proposed merging without a manager review, and no completed independent review is on record");
    }
    // Merging on the author's review means the session may have added nothing of its own. A
    // session holds push access, so "I only merged trunk" is verified, not taken on its word:
    // anything else is unreviewed authoring that the author's record would otherwise carry.
    if (live.sessionPushed !== "nothing" && live.sessionPushed !== "trunk-merges") {
      return refuse(live.sessionPushed === "other"
        ? "the session changed the branch beyond a clean merge of trunk, so the author's review no longer covers it; that needed a manager review of its own"
        : "what the session pushed could not be verified, so the author's review cannot be relied on for it");
    }
  }

  return {
    verdict: "merge",
    operations: [
      // First, and before the label: the label event re-runs `check pr`, which reads the cleared
      // head from this comment.
      comment("merge", [`Auto-merge is being enabled; GitHub merges this once the required checks pass.${live.behind ? " The branch is behind its base, so the base is being merged in." : ""}`, ...sections], { ...marker, ...(useManagerReview ? { cleared: live.headSha } : {}), ...(live.behind ? { updated: live.headSha } : {}) }),
      ...(decision.body !== undefined && decision.body !== live.body ? [{ kind: "set-body" as const, body: decision.body }] : []),
      ...(live.isDraft ? [{ kind: "ready" as const }] : []),
      ...removeLabels(live, NEEDS_HUMAN_LABEL, STALE_LABEL, INCOMPLETE_LABEL, DORMANT_LABEL),
      // Removed and re-applied on every clearance, never left in place: whoever applied it
      // before, the newest `labeled` event must be the App's and must follow the comment above.
      ...(useManagerReview ? [...removeLabels(live, MANAGER_REVIEWED_LABEL), { kind: "add-label" as const, label: MANAGER_REVIEWED_LABEL }] : []),
      ...(!useManagerReview && !live.labels.includes("agent-reviewed") ? [{ kind: "add-label" as const, label: "agent-reviewed" }] : []),
      ...(live.cancelledRunIds.length ? [{ kind: "rerun" as const, runIds: live.cancelledRunIds }] : []),
      ...(live.autoMerge ? [] : [{ kind: "auto-merge" as const }]),
      ...updateIfBehind(live),
    ],
  };
}

/**
 * Turn a triage session's decision into operations. Triage is read-only and never lands anything:
 * the most it does is mark a plain draft ready for review, after which the ordinary path decides,
 * with its review, check and merge rules unchanged. Draft state alone neither blocks this nor
 * authorizes a merge, a close or an implementation.
 */
export function planTriage(decision: Decision, live: LiveState, ctx: Context): Plan {
  const marker = triageMarker(live, ctx);
  const run = `Run: ${ctx.runUrl}`;
  const sections = [inert(decision.summary), `**Why:** ${inert(decision.reasoning)}`, run];
  const wait = (why: string, say: boolean): Plan => ({ verdict: "wait", overridden: why, operations: say ? [comment("wait", [`Nothing was applied: ${why}.`, ...sections], marker)] : [] });

  // Queued auto-merge on WIP is cancelled before anything else, exactly as the sweep's hold does.
  if (live.autoMerge && isWorkInProgress(live)) return holdWorkInProgress(live, marker, run);
  // Triage may not touch the branch at all, not even with a clean merge of trunk. What was pushed
  // is read from Git between the sweep's head and the live head, never taken from the decision,
  // so a session that pushed and then reported the old head is still caught here.
  const pushed = branchChanged(live, sections, marker);
  if (pushed) return pushed;
  // A person promoted it while the session ran: the ordinary path takes it from here.
  if (!isWorkInProgress(live)) return wait("it is no longer a draft or WIP, so the ordinary path takes it next run", false);
  if (live.sessionPushed === "unverified") return wait("what the triage session pushed could not be verified", true);
  if (decision.head !== live.headSha) return wait("the decision names a head other than the branch's, which did not move", true);

  switch (decision.action) {
    case "ready": {
      const ready = { ...marker, verdict: "ready" as const };
      const cleared = removeLabels(live, INCOMPLETE_LABEL, DORMANT_LABEL, NEEDS_HUMAN_LABEL);
      if (live.isDraft && !hasWipName(live) && ctx.policy.actions.undraft) {
        return { verdict: "ready", operations: [
          comment("ready", ["Marked ready for review. From here the ordinary path applies: nothing merges without a complete review and passing required checks, and the usual quiet period still holds.", ...sections], ready),
          ...cleared,
          { kind: "ready" },
        ] };
      }
      const why = !ctx.policy.actions.undraft ? "marking drafts ready is disabled by policy" : "its WIP branch or title says a person must take it out of WIP";
      return { verdict: "ready", operations: [comment("ready", [`This reads as complete, but it was left as it is: ${why}.`, ...sections], ready), ...cleared] };
    }
    case "incomplete":
      return { verdict: "incomplete", operations: [
        comment("incomplete", [
          `**Still missing:** ${inert(decision.missing ?? decision.reasoning)}`,
          decision.remainingChecks ? `**Checks to run before review:** ${inert(decision.remainingChecks)}` : "",
          "Another agent can pick this up on its branch; the manager does not implement it. It leaves this alone until it gets a new push or someone removes the `manager:incomplete` label.",
          ...sections,
        ], { ...marker, verdict: "incomplete" }),
        ...removeLabels(live, DORMANT_LABEL),
        ...(live.labels.includes(INCOMPLETE_LABEL) ? [] : [{ kind: "add-label" as const, label: INCOMPLETE_LABEL }]),
      ] };
    case "dormant":
      return { verdict: "dormant", operations: [
        comment("dormant", ["Nothing is closed. The manager will not look at this again until it gets a new push or someone removes the `manager:dormant` label.", ...sections], { ...marker, verdict: "dormant" }),
        ...removeLabels(live, INCOMPLETE_LABEL),
        ...(live.labels.includes(DORMANT_LABEL) ? [] : [{ kind: "add-label" as const, label: DORMANT_LABEL }]),
      ] };
    case "escalate":
      return escalate(live, inert(decision.needsHuman ?? decision.reasoning), sections, marker);
    case "wait":
      return { verdict: "wait", operations: [comment("wait", sections, marker)] };
    default:
      return wait(`a triage session may not ${decision.action} a pull request; at most it marks a plain draft ready`, true);
  }
}

/** Every marker triage writes says so, which keeps its attempt budget apart from the ordinary path's. */
function triageMarker(live: LiveState, ctx: Context): ManagerMarker {
  return { head: live.headSha, verdict: "wait", attempts: ctx.attempts + 1, at: ctx.now.toISOString(), triage: true };
}

/** The branch changed between the sweep and now, which triage may not do: a person has to look. */
function branchChanged(live: LiveState, sections: string[], marker: ManagerMarker): Plan | undefined {
  if (live.sessionPushed !== "other" && live.sessionPushed !== "trunk-merges") return undefined;
  return escalate(live, "this branch changed while the triage session ran, and triage may not change a branch. Check who pushed the new commits and revert them if they are not the author's.", sections, marker, "the branch changed during the triage session");
}

/**
 * A triage session that wrote no usable decision. It still spent a triage attempt, a queued
 * auto-merge on WIP is still cancelled, and a branch it changed is still escalated.
 */
export function planTriageNoDecision(problem: string, live: LiveState, ctx: Context): Plan {
  const marker = triageMarker(live, ctx);
  const run = `Run: ${ctx.runUrl}`;
  if (live.autoMerge && isWorkInProgress(live)) return holdWorkInProgress(live, marker, run);
  const pushed = branchChanged(live, [`The session ended without a usable decision: ${problem}`, run], marker);
  if (pushed) return pushed;
  return { verdict: "wait", overridden: problem, operations: [comment("wait", [`The session ended without a usable decision, so nothing was applied: ${problem}`, run], marker)] };
}

/** Last, after auto-merge is queued: the update starts a fresh CI run that the queue then follows. */
function updateIfBehind(live: LiveState): Operation[] {
  return live.behind ? [{ kind: "update-branch", expectedHead: live.headSha }] : [];
}

/** Operations for a route the sweep decided without a session. */
export function planRoute(routed: Routed, live: LiveState, ctx: Context): Plan {
  // No session ran, so the attempt count is carried, not incremented.
  const marker: ManagerMarker = { head: live.headSha, verdict: "wait", attempts: routed.attempts, at: ctx.now.toISOString() };
  const run = `Run: ${ctx.runUrl}`;
  if (isWorkInProgress(live) && !(routed.route === "escalate" && routed.reason === "rescued-trunk-edits" && !live.autoMerge)) {
    return holdWorkInProgress(live, marker, run);
  }
  if (routed.headSha !== live.headSha) return { verdict: "wait", overridden: "the branch moved after the sweep", operations: [] };

  if (routed.route === "merge") {
    const rerun: Operation[] = live.cancelledRunIds.length ? [{ kind: "rerun", runIds: live.cancelledRunIds }] : [];
    if (live.autoMerge) {
      // Already queued. Bringing it up to date pushes a commit, so it is recorded; a rerun alone
      // needs no new comment every run.
      if (!live.behind) return { verdict: "merge", operations: rerun };
      return { verdict: "merge", operations: [comment("merge", ["Auto-merge is waiting on a branch behind its base, which strict protection never merges. Merging the base in with GitHub's update-branch; CI then runs again and auto-merge follows it.", run], { ...marker, verdict: "merge", updated: live.headSha }), ...rerun, ...updateIfBehind(live)] };
    }
    return { verdict: "merge", operations: [comment("merge", [`${routed.detail}. No session was needed: the review on record is complete and the checks pass.${live.behind ? " The branch is behind its base, so the base is being merged in." : ""}`, run], { ...marker, verdict: "merge", ...(live.behind ? { updated: live.headSha } : {}) }), ...rerun, { kind: "auto-merge" }, ...updateIfBehind(live)] };
  }
  if (routed.route === "close") {
    return { verdict: "close", operations: [comment("close", [`${routed.detail}. Reopen this if it is still wanted; the branch is untouched.`, run], { ...marker, verdict: "close" }), ...removeLabels(live, STALE_LABEL), { kind: "close" }] };
  }
  if (routed.route === "escalate") {
    if (routed.reason === "update-refused") return escalate(live, `${routed.detail}.`, [run], marker, undefined, true);
    return escalate(live, `${routed.detail}. The manager has stopped working on this pull request until it gets a new push.`, [run], marker);
  }
  return { verdict: "wait", operations: [] };
}

/**
 * A session that ended without a decision file. It still spent an attempt, and it must still
 * say so: a session that ran and reported nothing would otherwise look exactly like one that
 * found nothing to do, and would be retried at full cost on every run.
 */
export function planNoDecision(problem: string, live: LiveState, ctx: Context): Plan {
  const marker: ManagerMarker = { head: live.headSha, verdict: "wait", attempts: ctx.attempts + 1, at: ctx.now.toISOString() };
  return { verdict: "wait", overridden: problem, operations: [comment("wait", [`The session ended without a usable decision, so nothing was applied: ${problem}`, `Run: ${ctx.runUrl}`], marker)] };
}
