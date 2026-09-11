import { execFileSync } from "node:child_process";
import { z } from "zod";
import type { Finding } from "../check/pr.js";
import { visibleProse } from "../check/pr.js";

const Sha = z.string().regex(/^[a-f0-9]{40}$/);
const Text = z.string().trim().min(8);
const Session = z.string().trim().min(3);
const Path = z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\s\\]+$/);
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
  findings: z.array(z.object({
    id: Session,
    severity: z.enum(["minor", "substantive", "incidental"]),
    description: Text,
    paths: z.array(Path).min(1),
    disposition: z.enum(["fixed", "disputed", "deferred", "open"]),
    response: Text,
  }).strict()),
  followUp: z.object({
    reviewerSession: Session,
    commit: Sha,
    base: Sha.optional(),
    scopeReason: Text.optional(),
    outcome: z.enum(["cleared", "incomplete", "blocked"]),
    elapsedMinutes: z.number().nonnegative(),
    summary: Text,
  }).strict().optional(),
}).strict();
export type LocalReviewRecord = z.infer<typeof ReviewRecord>;

export function reviewRequired(config: unknown): boolean {
  const parsed = z.object({ review: z.object({ required: z.boolean().optional() }).passthrough().optional() }).passthrough().parse(config);
  return parsed.review?.required ?? true;
}

export function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 }).trim();
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
  if (substantive && !record.followUp) throw new Error("substantive findings require one follow-up from the original reviewer");
  if (record.findings.some(f => f.severity === "substantive" && f.disposition !== "fixed" && f.disposition !== "disputed")) throw new Error("substantive findings cannot be deferred");
  if (record.followUp && (record.followUp.reviewerSession !== record.reviewerSession || record.followUp.outcome !== "cleared" || record.followUp.commit !== record.covered)) {
    throw new Error("follow-up must clear the covered commit using the original reviewer session");
  }
  const budget = { small: 5, normal: 15, high: 30 }[record.risk];
  const multiplier = record.extensionReason ? 1.5 : 1;
  if (record.elapsedMinutes > budget * multiplier || (record.followUp?.elapsedMinutes ?? 0) > budget / 2) throw new Error("review exceeded its budget; record incomplete and escalate instead of claiming completion");
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
    const coveredBase = record.followUp?.base ?? record.base;
    if (coveredBase !== record.base) {
      if (!record.followUp?.scopeReason) throw new Error("base integration requires an explicit follow-up scope reason");
      git(opts.root, ["merge-base", "--is-ancestor", record.base, coveredBase]);
      git(opts.root, ["merge-base", "--is-ancestor", coveredBase, record.covered]);
    }
    if (git(opts.root, ["merge-base", opts.base, opts.head]) !== coveredBase) throw new Error("review base is stale; reconcile the base and review coverage explicitly");
    const after = git(opts.root, ["diff", "--name-only", "--no-renames", record.covered, opts.head, "--"]).split("\n").filter(Boolean);
    if (after.some(p => p !== path)) throw new Error("changes after covered commit invalidate review (only its worklog may change)");
    if (!record.followUp && record.reviewed !== record.covered) {
      const allowed = new Set(record.findings.filter(f => f.severity === "minor" && f.disposition === "fixed").flatMap(f => f.paths));
      const fixes = git(opts.root, ["diff", "--name-only", "--no-renames", record.reviewed, record.covered, "--"]).split("\n").filter(Boolean);
      if (fixes.some(p => p !== path && !allowed.has(p))) throw new Error("author-only fixes exceed the minor finding paths; review coverage must be renewed explicitly");
    }
    return [];
  } catch (error) {
    return [{ level: "error", rule: "agent-review", message: error instanceof Error ? error.message : String(error) }];
  }
}
