import { z } from "zod";
import { visibleProse } from "../check/pr.js";
import {
  type GhManagerPolicy,
  humanGatedPaths,
  INCOMPLETE_LABEL,
  MANAGER_REVIEWED_LABEL,
  NEEDS_HUMAN_LABEL,
  STALE_LABEL,
} from "./policy.js";
import { type ManagerMarker, renderMarker, type Routed } from "./sweep.js";

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
  action: z.enum(["merge", "escalate", "close", "incomplete", "wait"]),
  /** One paragraph: what the session found and did. */
  summary: Text,
  /** Why this action and not another. */
  reasoning: Text,
  /** True when the merge rests on the manager's own review record rather than the author's. */
  usedManagerReview: z.boolean().default(false),
  /** A complete replacement pull request body, when the session had to repair it. */
  body: z.string().max(60_000).optional(),
  /** Mark a draft ready for review. */
  markReady: z.boolean().default(false),
  /** For `close`: the merged pull request that made this one obsolete. */
  supersededBy: z.number().int().positive().optional(),
  /** For `incomplete`: what the roadmap item asks for that the branch does not yet do. */
  missing: Text.optional(),
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
  wait: "no action",
};

function comment(verdict: ManagerMarker["verdict"], sections: string[], marker: ManagerMarker): Operation {
  return { kind: "comment", body: [`### GitHub Manager — ${HEADLINE[verdict]}`, ...sections.filter(Boolean), renderMarker(marker)].join("\n\n") };
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

function escalate(live: LiveState, why: string, sections: string[], marker: ManagerMarker, overridden?: string): Plan {
  return {
    verdict: "escalate",
    ...(overridden ? { overridden } : {}),
    operations: [
      comment("escalate", [`**Needs you:** ${why}`, ...sections], { ...marker, verdict: "escalate" }),
      ...(live.autoMerge ? [{ kind: "disable-auto-merge" as const }] : []),
      // An escalated pull request is not cleared; leaving the label would let it merge on a
      // record the manager itself no longer stands behind.
      ...removeLabels(live, MANAGER_REVIEWED_LABEL),
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

  // The session reported the head it finished on. If the branch has moved since, somebody else
  // is working on it and everything the session concluded is about a different commit.
  if (decision.head !== live.headSha) {
    return { verdict: "wait", overridden: "the branch moved during the session", operations: [comment("wait", ["The branch moved while this run was working, so nothing was applied. The next run starts from the new head.", `Run: ${ctx.runUrl}`], { ...marker, verdict: "wait" })] };
  }

  if (decision.action === "wait") {
    return { verdict: "wait", operations: [comment("wait", sections, { ...marker, verdict: "wait" })] };
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
  if (decision.usedManagerReview) {
    if (!ctx.policy.actions.review) return refuse("the merge rests on a manager review, and manager review is disabled by policy");
    const gated = humanGatedPaths(live.changedFiles, ctx.policy);
    if (gated.length) return refuse(`this changes ${gated.slice(0, 3).join(", ")}${gated.length > 3 ? ` and ${gated.length - 3} more` : ""}, which the manager may not clear on its own review`);
    if (!hasVisibleLine(body, "manager-review-record")) return refuse("the session claimed a manager review but the pull request body carries no manager-review-record: line");
    // Checked here with the same code `check pr` runs, so a record the gate would refuse is an
    // escalation now rather than a red check and another session later.
    if (live.recordProblem) return refuse(`the manager review record does not validate: ${live.recordProblem}`);
  } else {
    if (!live.labels.includes("agent-reviewed")) return refuse("the session proposed merging without a manager review, and no completed independent review is on record");
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
      comment("merge", ["Auto-merge is being enabled; GitHub merges this once the required checks pass.", ...sections], decision.usedManagerReview ? { ...marker, cleared: live.headSha } : marker),
      ...(decision.body !== undefined && decision.body !== live.body ? [{ kind: "set-body" as const, body: decision.body }] : []),
      ...(live.isDraft ? [{ kind: "ready" as const }] : []),
      ...removeLabels(live, NEEDS_HUMAN_LABEL, STALE_LABEL, INCOMPLETE_LABEL),
      // Removed and re-applied on every clearance, never left in place: whoever applied it
      // before, the newest `labeled` event must be the App's and must follow the comment above.
      ...(decision.usedManagerReview ? [...removeLabels(live, MANAGER_REVIEWED_LABEL), { kind: "add-label" as const, label: MANAGER_REVIEWED_LABEL }] : []),
      ...(live.cancelledRunIds.length ? [{ kind: "rerun" as const, runIds: live.cancelledRunIds }] : []),
      ...(live.autoMerge ? [] : [{ kind: "auto-merge" as const }]),
      ...updateIfBehind(live),
    ],
  };
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
  if (routed.headSha !== live.headSha) return { verdict: "wait", overridden: "the branch moved after the sweep", operations: [] };

  if (routed.route === "merge") {
    const rerun: Operation[] = live.cancelledRunIds.length ? [{ kind: "rerun", runIds: live.cancelledRunIds }] : [];
    if (live.autoMerge) {
      // Already queued. Bringing it up to date pushes a commit, so it is recorded; a rerun alone
      // needs no new comment every run.
      if (!live.behind) return { verdict: "merge", operations: rerun };
      return { verdict: "merge", operations: [comment("merge", ["Auto-merge was waiting on a branch behind its base, which strict protection never merges. Merged the base in with GitHub's update-branch; CI runs again and auto-merge follows it.", run], { ...marker, verdict: "merge" }), ...rerun, ...updateIfBehind(live)] };
    }
    return { verdict: "merge", operations: [comment("merge", [`${routed.detail}. No session was needed: the review on record is complete and the checks pass.`, run], { ...marker, verdict: "merge" }), ...rerun, { kind: "auto-merge" }, ...updateIfBehind(live)] };
  }
  if (routed.route === "close") {
    return { verdict: "close", operations: [comment("close", [`${routed.detail}. Reopen this if it is still wanted; the branch is untouched.`, run], { ...marker, verdict: "close" }), ...removeLabels(live, STALE_LABEL), { kind: "close" }] };
  }
  if (routed.route === "escalate") {
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
