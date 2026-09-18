import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkLocalReview, git, reviewRequired, type LocalReviewRecord } from "../src/review/local.js";
import { checkPr } from "../src/check/pr.js";

let root: string;
let base: string;
let reviewed: string;
const path = ".agent/worklog/2026-09-10-task.md";
function commit() {
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "fixture", "--allow-empty"]);
  return git(root, ["rev-parse", "HEAD"]);
}
function record(): LocalReviewRecord {
  return { version: 1, base, reviewed, covered: reviewed, authorSession: "author-1", reviewerSession: "reviewer-2", risk: "normal", elapsedMinutes: 3, outcome: "complete", summary: "Independent review found no actionable defects.", findings: [] };
}
function save(r: LocalReviewRecord) {
  writeFileSync(join(root, path), `${r.summary}\n\n\`\`\`morpheus-review\n${JSON.stringify(r)}\n\`\`\`\n`);
  return commit();
}
function check(head: string, body = `review-record: ${path}`, labels = ["agent-reviewed"]) {
  return checkLocalReview({ root, body, labels, head, base });
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "local-review-"));
  execFileSync("git", ["init", "-q", root]);
  git(root, ["config", "user.name", "Test"]); git(root, ["config", "user.email", "test@example.com"]);
  mkdirSync(join(root, ".agent/worklog"), { recursive: true });
  writeFileSync(join(root, "morpheus.json"), '{}');
  writeFileSync(join(root, "code.ts"), 'export const answer = 1;'); base = commit();
  writeFileSync(join(root, "code.ts"), 'export const answer = 2;'); reviewed = commit();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("independent review lifecycle", () => {
  it("defaults on and refuses malformed configuration", () => {
    expect(reviewRequired({})).toBe(true);
    expect(reviewRequired({ review: { visualEvidence: {}, required: false } })).toBe(false);
    expect(() => reviewRequired({ review: { required: "false" } })).toThrow();
    expect(() => reviewRequired(null)).toThrow();
  });
  it("accepts a clean review followed only by its worklog commit", () => expect(check(save(record()))).toEqual([]));
  it("requires both a visible record pointer and the label", () => {
    const head = save(record());
    expect(check(head, `<!-- review-record: ${path} -->`)[0]?.rule).toBe("agent-review");
    expect(check(head, `review-record: ${path}`, [])).toHaveLength(1);
    expect(check(head, `review-record: ../../secret.md`)).toHaveLength(1);
  });
  it.each(["incomplete", "blocked"] as const)("refuses %s review", outcome => {
    expect(check(save({ ...record(), outcome }))[0]?.message).toContain(outcome);
  });
  it("refuses self-review and nonexistent commits", () => {
    expect(check(save({ ...record(), reviewerSession: "author-1" }))[0]?.message).toContain("independent");
    expect(check(save({ ...record(), reviewed: "a".repeat(40) }))).toHaveLength(1);
  });
  it("invalidates new code after completion", () => {
    save(record()); writeFileSync(join(root, "code.ts"), "unreviewed change");
    expect(check(commit())[0]?.message).toContain("invalidate");
  });
  it("permits author-only minor fixes but rejects unrelated files", () => {
    writeFileSync(join(root, "code.ts"), "minor fix"); const covered = commit();
    const r = { ...record(), covered, findings: [{ id: "F01", severity: "minor" as const, description: "Missing helpful error context", paths: ["code.ts"], disposition: "fixed" as const, response: "Added the missing context" }] };
    expect(check(save(r))).toEqual([]);
    writeFileSync(join(root, "other.ts"), "unrelated"); r.covered = commit();
    expect(check(save(r))[0]?.message).toContain("exceed");
  });
  it("requires the original reviewer to clear substantive fixes", () => {
    const r = record(); r.findings = [{ id: "F01", severity: "substantive", description: "Missing authorization guard", paths: ["code.ts"], disposition: "fixed", response: "Added the authorization guard" }];
    expect(check(save(r))[0]?.message).toContain("follow-up");
    r.followUp = { reviewerSession: "other-reviewer", commit: reviewed, outcome: "cleared", elapsedMinutes: 2, summary: "Verified the authorization guard" };
    expect(check(save(r))[0]?.message).toContain("original reviewer");
    r.followUp.reviewerSession = r.reviewerSession;
    expect(check(save(r))).toEqual([]);
    r.followUp.outcome = "blocked";
    expect(check(save(r))).toHaveLength(1);
  });
  it("keeps incidental pre-existing defects nonblocking", () => {
    const r = record(); r.findings = [{ id: "F01", severity: "incidental", description: "Unrelated pre-existing defect", paths: ["other.ts"], disposition: "deferred", response: "Recorded for a separate follow-up ticket" }];
    expect(check(save(r))).toEqual([]);
  });
  it("bounds budgets and permits only a recorded initial extension", () => {
    const r = { ...record(), risk: "small" as const, elapsedMinutes: 6 };
    expect(check(save(r))[0]?.message).toContain("budget");
    expect(check(save({ ...r, extensionReason: "Unexpectedly risky caller discovered" }))).toEqual([]);
    expect(check(save({ ...r, elapsedMinutes: 8, extensionReason: "Unexpectedly risky caller discovered" }))).toHaveLength(1);
  });
  it("refuses missing summary, duplicate records and malformed JSON", () => {
    for (const text of ['```morpheus-review\n{}\n```', '```morpheus-review\nnot json\n```', `${record().summary}\n`]) {
      writeFileSync(join(root, path), text); expect(check(commit())).toHaveLength(1);
    }
  });
  it("reports explicit project opt-out as waived, not reviewed", () => {
    writeFileSync(join(root, "morpheus.json"), '{"review":{"required":false}}');
    expect(check(commit(), "", [])[0]?.level).toBe("waived");
  });
  it("wires missing evidence into PR conventions while preserving records-only work", async () => {
    const ctx = { body: "## Test plan\nRan tests", branch: "inbox-2026-09-10", changedFiles: ["code.ts"], productDir: join(root, "hq/product") };
    expect((await checkPr(ctx)).some(f => f.rule === "agent-review" && f.level === "error")).toBe(true);
    expect((await checkPr({ ...ctx, changedFiles: [path] })).some(f => f.rule === "agent-review")).toBe(false);
  });
});

describe("visible evidence and trunk integration", () => {
  it("refuses a review paragraph hidden in a comment or code fence", () => {
    const r = record();
    for (const summary of [`<!-- ${r.summary} -->`, `\`\`\`text\n${r.summary}\n\`\`\``]) {
      writeFileSync(join(root, path), `${summary}\n\n\`\`\`morpheus-review\n${JSON.stringify(r)}\n\`\`\`\n`);
      expect(check(commit())[0]?.message).toContain("visible paragraph");
    }
  });
  it("keeps a review valid across a trunk merge and still checks a moved base", () => {
    git(root, ["checkout", "-qb", "new-trunk", base]);
    writeFileSync(join(root, "trunk.ts"), "new trunk code"); const newBase = commit();
    git(root, ["checkout", "--detach", reviewed]);
    git(root, ["merge", "--no-ff", "-m", "integrate trunk", newBase]); const covered = git(root, ["rev-parse", "HEAD"]);
    const r = { ...record(), covered };
    const verify = () => checkLocalReview({ root, body: `review-record: ${path}`, labels: ["agent-reviewed"], head: save(r), base: newBase });
    expect(verify()).toEqual([]);
    const followUp = { reviewerSession: r.reviewerSession, commit: covered, base: newBase, outcome: "cleared" as const, elapsedMinutes: 2, summary: "Reviewed the integration and affected paths" };
    Object.assign(r, { followUp });
    expect(verify()[0]?.message).toContain("scope reason");
    Object.assign(followUp, { scopeReason: "Explicitly include required trunk integration in the one follow-up" });
    expect(verify()).toEqual([]);
    followUp.base = reviewed; // Not trunk history at all, even though it is an ancestor of covered.
    expect(verify()[0]?.message).toContain("precede the PR's merge base");
  });
});

describe("merging trunk after coverage", () => {
  const substantive = { id: "F01", severity: "substantive" as const, description: "Missing authorization check", paths: ["code.ts"], disposition: "fixed" as const, response: "Implemented and verified the check" };
  /** A cleared two-turn review, then trunk moves; returns the new trunk tip and a verifier against it. */
  function cleared(trunkFile = "trunk.ts") {
    const r = { ...record(), findings: [substantive], followUp: { reviewerSession: "reviewer-2", commit: reviewed, outcome: "cleared" as const, elapsedMinutes: 2, summary: "The original reviewer cleared the fix." } };
    const feature = save(r);
    git(root, ["checkout", "--detach", base]);
    writeFileSync(join(root, trunkFile), "export const trunk = true;"); const newBase = commit();
    git(root, ["checkout", "--detach", feature]);
    const verify = () => checkLocalReview({ root, body: `review-record: ${path}`, labels: ["agent-reviewed"], head: save(r), base: newBase });
    return { r, newBase, verify };
  }
  it("accepts an exact merge of trunk code with no record entry and no new turn", () => {
    const { r, newBase, verify } = cleared();
    git(root, ["merge", "--no-ff", "-m", "integrate trunk", newBase]);
    const original = [r.base, r.reviewed, r.covered, r.followUp!.commit];
    expect(verify()).toEqual([]);
    expect([r.base, r.reviewed, r.covered, r.followUp!.commit]).toEqual(original);
    writeFileSync(join(root, "later.ts"), "export const later = true;"); git(root, ["checkout", "-qb", "later-trunk", newBase]);
    const laterBase = commit(); git(root, ["checkout", "-q", "-"]);
    git(root, ["merge", "--no-ff", "-m", "integrate later trunk", laterBase]);
    expect(checkLocalReview({ root, body: `review-record: ${path}`, labels: ["agent-reviewed"], head: save(r), base: laterBase })).toEqual([]);
  });
  it("requires a named entry for a hand-resolved conflict and then accepts it", () => {
    const { r, newBase, verify } = cleared("code.ts");
    expect(() => git(root, ["merge", "--no-ff", "-m", "conflicting integration", newBase])).toThrow();
    writeFileSync(join(root, "code.ts"), "export const answer = 2; export const trunk = true;");
    git(root, ["add", "code.ts"]); git(root, ["commit", "-qm", "resolve"]);
    const merge = git(root, ["rev-parse", "HEAD"]);
    expect(verify()[0]?.message).toContain("hand-resolved trunk merge");
    r.trunkIntegrations = [{ commit: merge, reason: "Resolved the answer constant against trunk's new export; both sides kept." }];
    expect(verify()).toEqual([]);
  });
  it("treats an edit hidden inside a merge commit as hand-resolved", () => {
    const { r, newBase, verify } = cleared();
    git(root, ["merge", "--no-ff", "-m", "integrate trunk", newBase]);
    writeFileSync(join(root, "code.ts"), "export const answer = 3;");
    git(root, ["add", "code.ts"]); git(root, ["commit", "-q", "--amend", "--no-edit"]);
    const merge = git(root, ["rev-parse", "HEAD"]);
    expect(verify()[0]?.message).toContain("hand-resolved trunk merge");
    r.trunkIntegrations = [{ commit: merge, reason: "Adjusted the constant while resolving the merge." }];
    expect(verify()).toEqual([]);
  });
  it("refuses a merge that brings in anything but trunk", () => {
    const { r, verify } = cleared();
    git(root, ["checkout", "-qb", "side", base]);
    writeFileSync(join(root, "side.ts"), "export const side = true;"); const side = commit();
    git(root, ["checkout", "-q", "-"]);
    git(root, ["merge", "--no-ff", "-m", "integrate a side branch", side]);
    expect(verify()[0]?.message).toContain("trunk only");
    r.trunkIntegrations = [{ commit: git(root, ["rev-parse", "HEAD"]), reason: "Naming it does not make a side branch into trunk." }];
    expect(verify()[0]?.message).toContain("trunk only");
  });
  it("refuses an octopus merge even when every parent is trunk", () => {
    const { newBase, verify } = cleared();
    git(root, ["checkout", "-qb", "other-trunk", base]);
    writeFileSync(join(root, "other.ts"), "export const other = true;"); const otherBase = commit();
    git(root, ["checkout", "-q", "-"]);
    git(root, ["merge", "--no-ff", "-m", "octopus", newBase, otherBase]);
    expect(verify()[0]?.message).toContain("only two-parent");
  });
  it("refuses an entry that names a commit which is not a merge after review", () => {
    const { r, verify } = cleared();
    r.trunkIntegrations = [{ commit: reviewed, reason: "The reviewed commit itself is not an integration." }];
    expect(verify()[0]?.message).toContain("not a trunk merge");
  });
  it("still invalidates a plain code commit after the merge", () => {
    const { newBase, verify } = cleared();
    git(root, ["merge", "--no-ff", "-m", "integrate trunk", newBase]);
    writeFileSync(join(root, "code.ts"), "unreviewed code"); commit();
    expect(verify()[0]?.message).toContain("invalidate");
  });
  it("accepts a merge between reviewed and covered when only minor fixes surround it", () => {
    git(root, ["checkout", "--detach", base]);
    writeFileSync(join(root, "trunk.ts"), "export const trunk = true;"); const newBase = commit();
    git(root, ["checkout", "--detach", reviewed]);
    git(root, ["merge", "--no-ff", "-m", "integrate trunk", newBase]);
    writeFileSync(join(root, "code.ts"), "minor fix"); const covered = commit();
    const r = { ...record(), covered, findings: [{ id: "F01", severity: "minor" as const, description: "Missing helpful error context", paths: ["code.ts"], disposition: "fixed" as const, response: "Added the missing context" }] };
    const verify = () => checkLocalReview({ root, body: `review-record: ${path}`, labels: ["agent-reviewed"], head: save(r), base: newBase });
    expect(verify()).toEqual([]);
    writeFileSync(join(root, "other.ts"), "unrelated"); r.covered = commit();
    expect(verify()[0]?.message).toContain("exceed");
  });
  it("still parses a record carrying the retired documentationIntegrations field", () => {
    const { r, newBase, verify } = cleared();
    git(root, ["merge", "--no-ff", "-m", "integrate trunk", newBase]);
    r.documentationIntegrations = [{ base: newBase, commit: git(root, ["rev-parse", "HEAD"]), reason: "Written under the documentation-only rule of 2026-09-16.", sources: [{ commit: newBase, reviewRecord: ".agent/worklog/2026-09-10-docs.md" }] }];
    expect(verify()).toEqual([]);
  });
});

describe("three-turn cap", () => {
  const substantive = { id: "F01", severity: "substantive" as const, description: "Missing authorization guard", paths: ["code.ts"], disposition: "fixed" as const, response: "Added the authorization guard" };
  function turn(commit: string, outcome: "cleared" | "incomplete" | "blocked", elapsedMinutes = 2) {
    return { reviewerSession: "reviewer-2", commit, outcome, elapsedMinutes, summary: `Follow-up returned ${outcome} after inspecting the fix.` };
  }
  it("treats followUps of one as the legacy followUp", () => {
    const r = { ...record(), findings: [substantive], followUps: [turn(reviewed, "cleared")] };
    expect(check(save(r))).toEqual([]);
    expect(check(save({ ...r, followUp: turn(reviewed, "cleared") }))[0]?.message).toContain("not both");
  });
  it("allows a third turn only after a blocked second turn", () => {
    writeFileSync(join(root, "code.ts"), "first fix"); const first = commit();
    writeFileSync(join(root, "code.ts"), "second fix"); const covered = commit();
    const r = { ...record(), covered, findings: [substantive], followUps: [turn(first, "blocked"), turn(covered, "cleared")] };
    expect(check(save(r))).toEqual([]);
    expect(check(save({ ...r, followUps: [turn(first, "cleared"), turn(covered, "cleared")] }))[0]?.message).toContain("only after the second turn returned blocked");
    expect(check(save({ ...r, followUps: [turn(first, "incomplete"), turn(covered, "cleared")] }))[0]?.message).toContain("only after the second turn returned blocked");
    expect(check(save({ ...r, followUps: [turn(first, "blocked"), turn(covered, "blocked")] }))[0]?.message).toContain("final follow-up must clear");
  });
  it("refuses a fourth turn outright", () => {
    const r = { ...record(), findings: [substantive], followUps: [turn(reviewed, "blocked"), turn(reviewed, "blocked"), turn(reviewed, "cleared")] };
    expect(check(save(r as unknown as LocalReviewRecord))).toHaveLength(1);
  });
  it("holds every follow-up to the follow-up ceiling at its boundary", () => {
    writeFileSync(join(root, "code.ts"), "first fix"); const first = commit();
    writeFileSync(join(root, "code.ts"), "second fix"); const covered = commit();
    const r = { ...record(), covered, findings: [substantive], followUps: [turn(first, "blocked", 7.5), turn(covered, "cleared", 7.5)] };
    expect(check(save(r))).toEqual([]);
    expect(check(save({ ...r, followUps: [turn(first, "blocked", 7.5), turn(covered, "cleared", 7.6)] }))[0]?.message).toContain("follow-up exceeded its budget");
    expect(check(save({ ...r, followUps: [turn(first, "blocked", 7.6), turn(covered, "cleared", 7.5)] }))[0]?.message).toContain("follow-up exceeded its budget");
  });
  it("keeps the turns in commit order", () => {
    writeFileSync(join(root, "code.ts"), "first fix"); const first = commit();
    writeFileSync(join(root, "code.ts"), "second fix"); const second = commit();
    const r = { ...record(), covered: second, findings: [substantive], followUps: [turn(second, "blocked"), turn(second, "cleared")] };
    expect(check(save(r))).toEqual([]);
    git(root, ["checkout", "-qb", "side", first]);
    writeFileSync(join(root, "code.ts"), "side fix"); const side = commit();
    git(root, ["checkout", "-q", "-"]);
    expect(check(save({ ...r, followUps: [turn(side, "blocked"), turn(second, "cleared")] }))[0]?.message).toContain("commit order");
  });
  it("carries a base moved by the second turn through the third", () => {
    git(root, ["checkout", "-qb", "new-trunk", base]);
    writeFileSync(join(root, "trunk.ts"), "new trunk code"); const newBase = commit();
    git(root, ["checkout", "--detach", reviewed]);
    git(root, ["merge", "--no-ff", "-m", "integrate trunk", newBase]); const integrated = git(root, ["rev-parse", "HEAD"]);
    writeFileSync(join(root, "code.ts"), "second fix"); const covered = commit();
    const second = { ...turn(integrated, "blocked"), base: newBase, scopeReason: "Explicitly include required trunk integration in this follow-up" };
    const r = { ...record(), covered, findings: [substantive], followUps: [second, turn(covered, "cleared")] };
    const verify = (rec: LocalReviewRecord) => checkLocalReview({ root, body: `review-record: ${path}`, labels: ["agent-reviewed"], head: save(rec), base: newBase });
    expect(verify(r)).toEqual([]);
    expect(verify({ ...r, followUps: [{ ...second, scopeReason: undefined }, turn(covered, "cleared")] })[0]?.message).toContain("scope reason");
    // A later turn may only move the base forward, never back to the original.
    expect(verify({ ...r, followUps: [second, { ...turn(covered, "cleared"), base, scopeReason: "Attempt to rewind the base to the original trunk" }] })[0]?.message).toContain("move forward");
  });
});
