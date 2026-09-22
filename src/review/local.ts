import { execFileSync } from "node:child_process";
import { z } from "zod";
import type { Finding } from "../check/pr.js";
import { visibleProse } from "../check/pr.js";
import { ROADMAP_ID } from "../pm/id.js";

const Sha = z.string().regex(/^[a-f0-9]{40}$/);
const Text = z.string().trim().min(8);
const Session = z.string().trim().min(3);
/**
 * A reviewer session is the id the runner issued for that session (a UUID thread id, or the
 * 16-plus hex subagent id a tool result reports), optionally behind a provider prefix such as
 * `claude-code-subagent/`. Not a label the author composes: the corpus showed consecutive
 * records whose reviewer ids were permutations of the same eight characters.
 */
const ReviewerSession = z.string().trim().regex(/^(?:[a-z][a-z0-9-]*[:/])?(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,})$/i, "reviewerSession must be the runner-issued session id, not an author-chosen label");
const Path = z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\s\\]+$/);
const FollowUp = z.object({
  reviewerSession: ReviewerSession,
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
 * author and a reviewer trading fixes and findings indefinitely: a turn is spent to resolve
 * what the previous one left blocked, or on a late correction after a clearance that names
 * its scope decision, and nothing after the last one is automatic.
 */
export const MAX_FOLLOW_UPS = 2;

export const ReviewRecord = z.object({
  version: z.literal(1),
  base: Sha,
  reviewed: Sha,
  covered: Sha,
  authorSession: Session,
  reviewerSession: ReviewerSession,
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

/** Findings the reviewer pre-cleared and the author fixed under the stated condition. */
export function conditionallyCleared(record: LocalReviewRecord): string[] {
  return record.findings.filter(f => f.condition && f.disposition === "fixed" && f.conditionMet).flatMap(f => f.condition!.paths);
}

/** Initial-review ceilings in minutes; a follow-up gets half. Small was 5 until the data showed only creative accounting. */
export const REVIEW_BUDGET_MINUTES = { small: 10, normal: 15, high: 30 } as const;

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
  for (const f of record.findings) {
    if ((f.disposition === "deferred" || f.disposition === "open") && !f.roadmap) throw new Error(`finding ${f.id} is left ${f.disposition} without a roadmap item to track it`);
    if (f.condition && f.disposition === "fixed" && !f.conditionMet) throw new Error(`finding ${f.id} was cleared conditionally; record conditionMet with the evidence that was run`);
    if (f.conditionMet && !f.condition) throw new Error(`finding ${f.id} records conditionMet without a reviewer condition`);
  }
  const substantive = record.findings.some(f => f.severity === "substantive");
  // A substantive finding the reviewer pre-cleared under a condition, and the author fixed
  // under it, needs no turn; any other substantive finding still does.
  const unconditional = record.findings.some(f => f.severity === "substantive" && !(f.condition && f.disposition === "fixed" && f.conditionMet));
  const turns = followUpTurns(record);
  if (unconditional && !turns.length) throw new Error("substantive findings require a follow-up from the original reviewer unless cleared under a recorded condition");
  if (record.findings.some(f => f.severity === "substantive" && f.disposition !== "fixed" && f.disposition !== "disputed")) throw new Error("substantive findings cannot be deferred");
  const budget = REVIEW_BUDGET_MINUTES[record.risk];
  const multiplier = record.extensionReason ? 1.5 : 1;
  if (record.elapsedMinutes > budget * multiplier) throw new Error("review exceeded its budget; record incomplete and escalate instead of claiming completion");
  // A 42-second "review" at normal risk cleared the PR that adopted this policy. Small risk keeps
  // no floor: a one-line change can genuinely be read in under a minute.
  if (record.risk !== "small" && record.elapsedMinutes < 1) throw new Error("an initial review under one minute at normal or high risk is not a review; record what was actually done");
  // A turn after a clearance is a late correction, such as a fix full CI asked for after the
  // reviewer cleared the code. It spends one of the remaining turns and must name the scope
  // decision in its scopeReason, so the record shows why a cleared review was reopened. A turn
  // after blocked, or after substantive initial findings, is the ordinary fix follow-up and needs
  // none. An incomplete turn exhausted its budget and escalates; nothing follows it.
  if (!substantive && turns[0] && !turns[0].scopeReason) throw new Error("a follow-up after a clean initial review is a late correction and needs an explicit scope reason");
  turns.forEach((turn, index) => {
    if (turn.reviewerSession !== record.reviewerSession) throw new Error("every follow-up must use the original reviewer session");
    if (turn.elapsedMinutes > budget / 2) throw new Error("follow-up exceeded its budget; record incomplete and escalate instead of claiming completion");
    const next = turns[index + 1];
    if (!next) {
      // With a conditional clearance the author's fix may land after the final turn; the commit
      // check then happens in checkLocalReview, which can see the paths.
      const coversLast = turn.commit === record.covered || conditionallyCleared(record).length > 0;
      if (turn.outcome !== "cleared" || !coversLast) throw new Error("the final follow-up must clear the covered commit using the original reviewer session");
    } else if (turn.outcome === "incomplete" || (turn.outcome === "cleared" && !next.scopeReason)) {
      throw new Error("a third turn is allowed only after the second turn returned blocked, or after a cleared turn as a late correction with an explicit scope reason");
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

/** First-parent two-parent merges in a range whose second parent is trunk history. */
function trunkMerges(root: string, from: string, to: string, trunk: string): string[] {
  return git(root, ["rev-list", "--first-parent", "--merges", `${from}..${to}`]).split("\n").filter(Boolean).filter(commit => {
    const parents = git(root, ["show", "-s", "--format=%P", commit]).split(" ");
    return parents.length === 2 && isAncestor(root, parents[1]!, trunk);
  });
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
    checkFreshReviewer(opts.root, record, path, opts.head);
    checkTrackedDeferrals(opts.root, record, opts.head);
    for (const [older, newer] of [[record.base, record.reviewed], [record.reviewed, record.covered], [record.covered, opts.head]]) {
      git(opts.root, ["merge-base", "--is-ancestor", older!, newer!]);
    }
    checkFollowUpChain(opts.root, record);
    // The reviewer's base must be real trunk history behind this PR; trunk may have moved on since.
    if (!isAncestor(opts.root, coveredBase(record), git(opts.root, ["merge-base", opts.base, opts.head]))) {
      throw new Error("the recorded review base must precede the PR's merge base with trunk; reconcile the base and coverage explicitly");
    }
    const merges = new Set<string>();
    const turns = followUpTurns(record);
    const conditional = conditionallyCleared(record);
    if (!turns.length && record.reviewed !== record.covered) {
      const allowed = new Set([path, ...conditional, ...record.findings.filter(f => f.severity === "minor" && f.disposition === "fixed").flatMap(f => f.paths)]);
      for (const commit of verifyUncoveredCommits(opts.root, record, record.reviewed, record.covered, opts.base, allowed, "author-only fixes exceed the minor finding paths and reviewer conditions; review coverage must be renewed explicitly")) merges.add(commit);
    }
    const last = turns[turns.length - 1];
    if (last && last.commit !== record.covered) {
      // Only a conditional clearance lets `covered` run past the final turn, and only within its paths.
      if (!isAncestor(opts.root, last.commit, record.covered)) throw new Error("the final follow-up must clear the covered commit using the original reviewer session");
      for (const commit of verifyUncoveredCommits(opts.root, record, last.commit, record.covered, opts.base, new Set([path, ...conditional]), "author fixes after the final follow-up exceed the reviewer's recorded conditions")) merges.add(commit);
    }
    for (const commit of verifyUncoveredCommits(opts.root, record, record.covered, opts.head, opts.base, new Set([path]), "changes after covered commit invalidate review (only its worklog and trunk merges may follow)")) merges.add(commit);
    // A hand-resolved merge named before a late correction moved `covered` past it now sits in a
    // range the correction turn cleared. The entry stays true and accepted; it is not stray.
    if (followUpTurns(record).length) for (const commit of trunkMerges(opts.root, record.reviewed, record.covered, opts.base)) merges.add(commit);
    const stray = (record.trunkIntegrations ?? []).find(entry => !merges.has(entry.commit));
    if (stray) throw new Error("trunkIntegrations names a commit that is not a trunk merge on this branch after review");
    return [];
  } catch (error) {
    return [{ level: "error", rule: "agent-review", message: error instanceof Error ? error.message : String(error) }];
  }
}

/**
 * A reviewer session reviews one task. The same id in another worklog means the reviewer was
 * reused or the id was composed, and either way it is not the fresh session the contract requires.
 */
function checkFreshReviewer(root: string, record: LocalReviewRecord, worklog: string, head: string): void {
  let hits: string[] = [];
  try { hits = git(root, ["grep", "-l", "-F", record.reviewerSession, head, "--", ".agent/worklog"]).split("\n").filter(Boolean); } catch { hits = []; }
  const other = hits.map(hit => hit.replace(/^[^:]*:/, "")).find(p => p !== worklog);
  if (other) throw new Error(`reviewer session ${record.reviewerSession} already appears in ${other}; every review needs a fresh reviewer session`);
}

/** A deferral is a ticket, not a sentence: the named roadmap item must exist on this branch. */
function checkTrackedDeferrals(root: string, record: LocalReviewRecord, head: string): void {
  const ids = [...new Set(record.findings.map(f => f.roadmap).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  const items = git(root, ["ls-tree", "--name-only", head, "--", "hq/product/roadmap/"]).split("\n").map(p => p.replace(/^hq\/product\/roadmap\//, ""));
  for (const id of ids) {
    if (!items.some(name => name === `${id}.md` || name.startsWith(`${id}-`))) throw new Error(`finding tracked by ${id}, but no such roadmap item exists on this branch; file it with pm new`);
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
