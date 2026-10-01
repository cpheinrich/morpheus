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
 * The session holds a token that can push to the pull request's branch and
 * nothing else: it cannot label, comment, merge or close. It writes a decision
 * file instead, and this module turns that file into operations only after
 * checking it against live state and the repository's policy. A decision is a
 * request from a model that has been reading a pull request's text; the plan
 * is what a deterministic step is willing to do about it.
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
  body: string;
  /** Every path the pull request changes against its base. */
  changedFiles: string[];
  /** Whether `supersededBy` names a merged pull request; undefined when it could not be read. */
  supersededMerged?: boolean | undefined;
  /** Runs to rerun because their check was cancelled. */
  cancelledRunIds: number[];
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
      ...(live.autoMerge ? [{ kind: "disable-auto-merge" as const }] : []),
      // An escalated pull request is not cleared; leaving the label would let it merge on a
      // record the manager itself no longer stands behind.
      ...removeLabels(live, MANAGER_REVIEWED_LABEL),
      ...(live.labels.includes(NEEDS_HUMAN_LABEL) ? [] : [{ kind: "add-label" as const, label: NEEDS_HUMAN_LABEL }]),
      comment("escalate", [`**Needs you:** ${why}`, ...sections], { ...marker, verdict: "escalate" }),
    ],
  };
}

function findingsTable(decision: Decision): string {
  if (!decision.findings.length) return "";
  const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ");
  return ["| Finding | Severity | Result |", "|---|---|---|", ...decision.findings.map(f => `| ${cell(f.id)}: ${cell(f.description)} | ${f.severity} | ${f.disposition} |`)].join("\n");
}

/** Turn a session's decision into operations, or into an escalation when it does not hold up. */
export function planDecision(decision: Decision, live: LiveState, ctx: Context): Plan {
  const marker: ManagerMarker = { head: live.headSha, verdict: decision.action, attempts: ctx.attempts + 1, at: ctx.now.toISOString() };
  const sections = [decision.summary, `**Why:** ${decision.reasoning}`, findingsTable(decision), `Run: ${ctx.runUrl}`];
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
    return escalate(live, decision.needsHuman ?? decision.reasoning, sections, marker);
  }

  // An abandoned draft that has not done what its roadmap item defines. Not a failure and not
  // obsolete: it is unfinished work, and saying so is what stops it reading as nearly merged.
  if (decision.action === "incomplete") {
    return {
      verdict: "incomplete",
      operations: [
        ...(live.labels.includes(INCOMPLETE_LABEL) ? [] : [{ kind: "add-label" as const, label: INCOMPLETE_LABEL }]),
        comment("incomplete", [`**Still missing:** ${decision.missing ?? decision.reasoning}`, "The manager will leave this alone until it gets a new push.", ...sections], { ...marker, verdict: "incomplete" }),
      ],
    };
  }

  if (decision.action === "close") {
    if (!ctx.policy.actions.close) return refuse("the session proposed closing this, and closing is disabled by policy");
    // Closing on a model's say-so is the one irreversible-feeling action here, so it needs a
    // fact the plan can check: the superseding pull request really merged. Anything less is a
    // warning with a grace period.
    if (decision.supersededBy !== undefined && live.supersededMerged === true) {
      return { verdict: "close", operations: [...removeLabels(live, NEEDS_HUMAN_LABEL, STALE_LABEL), comment("close", [`Superseded by #${decision.supersededBy}, which merged. Reopen this if that is wrong; the branch is untouched.`, ...sections], marker), { kind: "close" }] };
    }
    return {
      verdict: "warn-stale",
      operations: [
        ...(live.labels.includes(STALE_LABEL) ? [] : [{ kind: "add-label" as const, label: STALE_LABEL }]),
        comment("warn-stale", [`This will be closed in ${ctx.policy.closeGraceDays} days unless it gets a push or a reply. The branch will be left in place.`, ...sections], { ...marker, verdict: "warn-stale" }),
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
  } else if (!live.labels.includes("agent-reviewed")) {
    return refuse("the session proposed merging without a manager review, and no completed independent review is on record");
  }

  return {
    verdict: "merge",
    operations: [
      ...(decision.body !== undefined && decision.body !== live.body ? [{ kind: "set-body" as const, body: decision.body }] : []),
      ...(live.isDraft ? [{ kind: "ready" as const }] : []),
      ...removeLabels(live, NEEDS_HUMAN_LABEL, STALE_LABEL, INCOMPLETE_LABEL),
      ...(decision.usedManagerReview && !live.labels.includes(MANAGER_REVIEWED_LABEL) ? [{ kind: "add-label" as const, label: MANAGER_REVIEWED_LABEL }] : []),
      ...(live.cancelledRunIds.length ? [{ kind: "rerun" as const, runIds: live.cancelledRunIds }] : []),
      ...(live.autoMerge ? [] : [{ kind: "auto-merge" as const }]),
      comment("merge", ["Auto-merge is on; GitHub merges this once the required checks pass.", ...sections], marker),
    ],
  };
}

/** Operations for a route the sweep decided without a session. */
export function planRoute(routed: Routed, live: LiveState, ctx: Context): Plan {
  // No session ran, so the attempt count is carried, not incremented.
  const marker: ManagerMarker = { head: live.headSha, verdict: "wait", attempts: routed.attempts, at: ctx.now.toISOString() };
  const run = `Run: ${ctx.runUrl}`;
  if (routed.headSha !== live.headSha) return { verdict: "wait", overridden: "the branch moved after the sweep", operations: [] };

  if (routed.route === "merge") {
    const rerun: Operation[] = live.cancelledRunIds.length ? [{ kind: "rerun", runIds: live.cancelledRunIds }] : [];
    // Already queued: a rerun needs no new comment every run.
    if (live.autoMerge) return { verdict: "merge", operations: rerun };
    return { verdict: "merge", operations: [...rerun, { kind: "auto-merge" }, comment("merge", [`${routed.detail}. No session was needed: the review on record is complete and the checks pass.`, run], { ...marker, verdict: "merge" })] };
  }
  if (routed.route === "close") {
    return { verdict: "close", operations: [...removeLabels(live, STALE_LABEL), comment("close", [`${routed.detail}. Reopen this if it is still wanted; the branch is untouched.`, run], { ...marker, verdict: "close" }), { kind: "close" }] };
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
