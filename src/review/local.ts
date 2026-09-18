import { execFileSync } from "node:child_process";
import { z } from "zod";
import type { Finding } from "../check/pr.js";
import { visibleProse } from "../check/pr.js";

const Sha = z.string().regex(/^[a-f0-9]{40}$/);
const Text = z.string().trim().min(8);
const Session = z.string().trim().min(3);
const Path = z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\s\\]+$/);
const FollowUp = z.object({
  reviewerSession: Session,
  commit: Sha,
  base: Sha.optional(),
  scopeReason: Text.optional(),
  outcome: z.enum(["cleared", "incomplete", "blocked"]),
  elapsedMinutes: z.number().nonnegative(),
  summary: Text,
}).strict();
export type ReviewFollowUp = z.infer<typeof FollowUp>;

/**
 * Reviewer turns after the initial review. Three turns in total is the cap that stops an
 * author and a reviewer trading fixes and findings indefinitely: a third turn exists only
 * to resolve what the second left blocked, and nothing after it is automatic.
 */
export const MAX_FOLLOW_UPS = 2;

export const ReviewRecord = z.object({
  version: z.literal(1),
  base: Sha,
  reviewed: Sha,
  covered: Sha,
  authorSession: Session,
  reviewerSession: Session,
  risk: z.enum(["small", "normal", "high"]),
  elapsedMinutes: z.number().nonnegative(),
  extensionReason: Text.optional(),
  outcome: z.enum(["complete", "incomplete", "blocked"]),
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
    severity: z.enum(["minor", "substantive", "incidental"]),
    description: Text,
    paths: z.array(Path).min(1),
    disposition: z.enum(["fixed", "disputed", "deferred", "open"]),
    response: Text,
  }).strict()),
  /** The single-follow-up shape records written under the two-turn contract still carry. */
  followUp: FollowUp.optional(),
  /** Follow-up turns in order; the last one must clear `covered`. */
  followUps: z.array(FollowUp).min(1).max(MAX_FOLLOW_UPS).optional(),
}).strict().refine(record => !(record.followUp && record.followUps), { message: "record follow-up turns as either followUp or followUps, not both" });
export type LocalReviewRecord = z.infer<typeof ReviewRecord>;

/** Follow-up turns in order, whichever field the record used. */
export function followUpTurns(record: LocalReviewRecord): ReviewFollowUp[] {
  return record.followUps ?? (record.followUp ? [record.followUp] : []);
}

/** The trunk base the reviewer's clearance covered: the latest recorded integration, else the original. */
export function coveredBase(record: LocalReviewRecord): string {
  return followUpTurns(record).reduce((base, turn) => turn.base ?? base, record.base);
}

export function reviewRequired(config: unknown): boolean {
  const parsed = z.object({ review: z.object({ required: z.boolean().optional() }).passthrough().optional() }).passthrough().parse(config);
  return parsed.review?.required ?? true;
}

export function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 }).trim();
}

function isAncestor(root: string, older: string, newer: string): boolean {
  try { git(root, ["merge-base", "--is-ancestor", older, newer]); return true; } catch { return false; }
}

export function parseReviewRecord(markdown: string): LocalReviewRecord {
  const blocks = [...markdown.matchAll(/^```morpheus-review\r?\n([\s\S]*?)^```[ \t]*$/gm)];
  if (blocks.length !== 1) throw new Error("worklog needs exactly one morpheus-review JSON block");
  const record = ReviewRecord.parse(JSON.parse(blocks[0]![1]!));
  // The human audit must remain visible without reading JSON.
  if (!visibleProse(markdown.replace(blocks[0]![0], "")).includes(record.summary)) {
    throw new Error("repeat the review summary as a visible paragraph outside the JSON block");
  }
  return record;
}

export function validateReviewRecord(record: LocalReviewRecord): void {
  if (record.authorSession === record.reviewerSession) throw new Error("reviewer must be a fresh independent session");
  if (record.outcome !== "complete") throw new Error(`review is ${record.outcome}; leave the PR open and disable auto-merge`);
  if (new Set(record.findings.map(f => f.id)).size !== record.findings.length) throw new Error("finding IDs must be unique");
  if (record.findings.some(f => f.severity !== "incidental" && f.disposition === "open")) throw new Error("unresolved finding");
  const substantive = record.findings.some(f => f.severity === "substantive");
  const turns = followUpTurns(record);
  if (substantive && !turns.length) throw new Error("substantive findings require a follow-up from the original reviewer");
  if (record.findings.some(f => f.severity === "substantive" && f.disposition !== "fixed" && f.disposition !== "disputed")) throw new Error("substantive findings cannot be deferred");
  const budget = { small: 5, normal: 15, high: 30 }[record.risk];
  const multiplier = record.extensionReason ? 1.5 : 1;
  if (record.elapsedMinutes > budget * multiplier) throw new Error("review exceeded its budget; record incomplete and escalate instead of claiming completion");
  turns.forEach((turn, index) => {
    if (turn.reviewerSession !== record.reviewerSession) throw new Error("every follow-up must use the original reviewer session");
    if (turn.elapsedMinutes > budget / 2) throw new Error("follow-up exceeded its budget; record incomplete and escalate instead of claiming completion");
    if (index === turns.length - 1) {
      if (turn.outcome !== "cleared" || turn.commit !== record.covered) throw new Error("the final follow-up must clear the covered commit using the original reviewer session");
    } else if (turn.outcome !== "blocked") {
      // A cleared turn ends the review; an incomplete one exhausted its budget. Neither earns a third turn.
      throw new Error("a third turn is allowed only after the second turn returned blocked");
    }
  });
}

function changedPaths(root: string, older: string, newer: string): string[] {
  return git(root, ["diff", "--name-only", "-z", "--no-renames", older, newer, "--"]).split("\0").filter(Boolean);
}

/** True when Git's own merge of the two parents reproduces this commit's tree exactly: nothing was hand-edited. */
function exactMerge(root: string, commit: string, parents: string[]): boolean {
  let expected = "";
  // merge-tree exits non-zero on a conflict; that is simply "not exact", not a failure to report.
  try { expected = git(root, ["merge-tree", "--write-tree", parents[0]!, parents[1]!]); } catch { return false; }
  return /^[a-f0-9]{40}$/.test(expected) && git(root, ["rev-parse", `${commit}^{tree}`]) === expected;
}

/**
 * Walk the first-parent commits in a range that the reviewer did not clear. Merging trunk never
 * invalidates coverage, as on a human team: a merge Git reproduces exactly passes on its own, and a
 * hand-resolved one passes when the record names it, so the unreviewed resolution is visible rather
 * than hidden. Any other commit may touch only the allowed paths. Returns the merges it accepted.
 */
function verifyUncoveredCommits(root: string, record: LocalReviewRecord, from: string, to: string, trunk: string, allowed: Set<string>, refusal: string): Set<string> {
  const named = new Map((record.trunkIntegrations ?? []).map(entry => [entry.commit, entry]));
  const accepted = new Set<string>();
  for (const commit of git(root, ["rev-list", "--first-parent", "--reverse", `${from}..${to}`]).split("\n").filter(Boolean)) {
    const parents = git(root, ["show", "-s", "--format=%P", commit]).split(" ");
    if (parents.length === 2) {
      if (!isAncestor(root, parents[1]!, trunk)) throw new Error("a merge after review coverage may bring in trunk only");
      if (!exactMerge(root, commit, parents) && !named.has(commit)) {
        throw new Error("a hand-resolved trunk merge after review coverage must be named in trunkIntegrations with its reason");
      }
      accepted.add(commit);
      continue;
    }
    if (parents.length !== 1) throw new Error("only two-parent trunk merges are accepted after review coverage");
    if (changedPaths(root, parents[0]!, commit).some(p => !allowed.has(p))) throw new Error(refusal);
  }
  return accepted;
}

/** Read only committed evidence; paths and refs are data, never shell text. */
export function checkLocalReview(opts: { root: string; body: string; labels: string[]; head: string; base: string }): Finding[] {
  try {
    const config = JSON.parse(git(opts.root, ["show", `${opts.head}:morpheus.json`]));
    if (!reviewRequired(config)) return [{ level: "waived", rule: "agent-review", message: "independent review disabled by project review.required=false" }];
    if (!opts.labels.includes("agent-reviewed")) throw new Error("add agent-reviewed only after completing the independent review");
    const lines = [...visibleProse(opts.body).matchAll(/^review-record:[ \t]*(\S+)[ \t]*$/gm)];
    if (lines.length !== 1) throw new Error("PR body needs one visible review-record: .agent/worklog/<task>.md line");
    const path = lines[0]![1]!;
    if (!/^\.agent\/worklog\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(path)) throw new Error("review-record must name a worklog Markdown file");
    const mode = git(opts.root, ["ls-tree", opts.head, "--", path]).split(" ")[0];
    if (mode !== "100644") throw new Error("review worklog must be a regular committed file");
    const record = parseReviewRecord(git(opts.root, ["show", `${opts.head}:${path}`]));
    validateReviewRecord(record);
    for (const [older, newer] of [[record.base, record.reviewed], [record.reviewed, record.covered], [record.covered, opts.head]]) {
      git(opts.root, ["merge-base", "--is-ancestor", older!, newer!]);
    }
    checkFollowUpChain(opts.root, record);
    // The reviewer's base must be real trunk history behind this PR; trunk may have moved on since.
    if (!isAncestor(opts.root, coveredBase(record), git(opts.root, ["merge-base", opts.base, opts.head]))) {
      throw new Error("the recorded review base must precede the PR's merge base with trunk; reconcile the base and coverage explicitly");
    }
    const merges = new Set<string>();
    if (!followUpTurns(record).length && record.reviewed !== record.covered) {
      const allowed = new Set([path, ...record.findings.filter(f => f.severity === "minor" && f.disposition === "fixed").flatMap(f => f.paths)]);
      for (const commit of verifyUncoveredCommits(opts.root, record, record.reviewed, record.covered, opts.base, allowed, "author-only fixes exceed the minor finding paths; review coverage must be renewed explicitly")) merges.add(commit);
    }
    for (const commit of verifyUncoveredCommits(opts.root, record, record.covered, opts.head, opts.base, new Set([path]), "changes after covered commit invalidate review (only its worklog and trunk merges may follow)")) merges.add(commit);
    const stray = (record.trunkIntegrations ?? []).find(entry => !merges.has(entry.commit));
    if (stray) throw new Error("trunkIntegrations names a commit that is not a trunk merge on this branch after review");
    return [];
  } catch (error) {
    return [{ level: "error", rule: "agent-review", message: error instanceof Error ? error.message : String(error) }];
  }
}

/**
 * Each follow-up turn must sit on the commit chain after the one before it, and a turn that
 * moved the base must say why and keep the bases in trunk order as well.
 */
function checkFollowUpChain(root: string, record: LocalReviewRecord): void {
  let previousCommit = record.reviewed;
  let previousBase = record.base;
  for (const turn of followUpTurns(record)) {
    if (!isAncestor(root, previousCommit, turn.commit)) throw new Error("follow-up turns must be recorded in commit order, each covering a descendant of the last");
    if (turn.base) {
      if (!turn.scopeReason) throw new Error("base integration requires an explicit follow-up scope reason");
      if (!isAncestor(root, previousBase, turn.base) || !isAncestor(root, turn.base, turn.commit)) throw new Error("a follow-up base must move forward along trunk and precede that turn's commit");
      previousBase = turn.base;
    }
    previousCommit = turn.commit;
  }
}
