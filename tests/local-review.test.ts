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
  return { version: 1, base, reviewed, covered: reviewed, authorSession: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d", reviewerSession: "a1b2c3d4e5f6a7b8c", risk: "normal", elapsedMinutes: 3, outcome: "complete", summary: "Independent review found no actionable defects.", findings: [] };
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
    expect(check(save({ ...record(), reviewerSession: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d" }))[0]?.message).toContain("independent");
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
    r.followUp = { reviewerSession: "b2c3d4e5f6a7b8c9d", commit: reviewed, outcome: "cleared", elapsedMinutes: 2, summary: "Verified the authorization guard" };
    expect(check(save(r))[0]?.message).toContain("original reviewer");
    r.followUp.reviewerSession = r.reviewerSession;
    expect(check(save(r))).toEqual([]);
    r.followUp.outcome = "blocked";
    expect(check(save(r))).toHaveLength(1);
  });
  it("keeps incidental pre-existing defects nonblocking once tracked", () => {
    mkdirSync(join(root, "hq/product/roadmap"), { recursive: true });
    writeFileSync(join(root, "hq/product/roadmap/MO-26-09-22-08.00.00-fix-other.md"), "---\nid: MO-26-09-22-08.00.00\n---\n"); reviewed = commit();
    const r = record(); r.findings = [{ id: "F01", severity: "incidental", description: "Unrelated pre-existing defect", paths: ["other.ts"], disposition: "deferred", response: "Recorded for a separate follow-up ticket", roadmap: "MO-26-09-22-08.00.00" }];
    expect(check(save(r))).toEqual([]);
  });
  it("bounds budgets and permits only a recorded initial extension", () => {
    const r = { ...record(), risk: "small" as const, elapsedMinutes: 11 };
    expect(check(save(r))[0]?.message).toContain("budget");
    expect(check(save({ ...r, extensionReason: "Unexpectedly risky caller discovered" }))).toEqual([]);
    expect(check(save({ ...r, elapsedMinutes: 15, extensionReason: "Unexpectedly risky caller discovered" }))).toEqual([]);
    expect(check(save({ ...r, elapsedMinutes: 15.1, extensionReason: "Unexpectedly risky caller discovered" }))).toHaveLength(1);
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
    const r = { ...record(), findings: [substantive], followUp: { reviewerSession: "a1b2c3d4e5f6a7b8c", commit: reviewed, outcome: "cleared" as const, elapsedMinutes: 2, summary: "The original reviewer cleared the fix." } };
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
    return { reviewerSession: "a1b2c3d4e5f6a7b8c", commit, outcome, elapsedMinutes, summary: `Follow-up returned ${outcome} after inspecting the fix.` };
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

describe("late corrections after clearance", () => {
  const substantive = { id: "F01", severity: "substantive" as const, description: "Missing authorization guard", paths: ["code.ts"], disposition: "fixed" as const, response: "Added the authorization guard" };
  const minor = { id: "F01", severity: "minor" as const, description: "Missing helpful error context", paths: ["code.ts"], disposition: "fixed" as const, response: "Added the missing context" };
  const scopeReason = "Late CI correction: two legacy UI tests assumed the old layout";
  function turn(commit: string, outcome: "cleared" | "incomplete" | "blocked", elapsedMinutes = 2) {
    return { reviewerSession: "a1b2c3d4e5f6a7b8c", commit, outcome, elapsedMinutes, summary: `Follow-up returned ${outcome} after inspecting the fix.` };
  }
  it("lets the first follow-up after a clean initial review clear a late correction, only with a scope reason", () => {
    save(record());
    writeFileSync(join(root, "code.ts"), "late CI correction"); const corrected = commit();
    expect(check(corrected)[0]?.message).toContain("invalidate");
    const r = { ...record(), covered: corrected, followUps: [{ ...turn(corrected, "cleared"), scopeReason }] };
    expect(check(save(r))).toEqual([]);
    expect(check(save({ ...r, followUps: [turn(corrected, "cleared")] }))[0]?.message).toContain("needs an explicit scope reason");
    expect(check(save({ ...r, followUps: [{ ...turn(corrected, "cleared", 7.6), scopeReason }] }))[0]?.message).toContain("follow-up exceeded its budget");
    expect(check(save({ ...r, followUps: [{ ...turn(corrected, "blocked"), scopeReason }] }))[0]?.message).toContain("final follow-up must clear");
  });
  it("serves a minor-only initial review the same way", () => {
    writeFileSync(join(root, "code.ts"), "minor fix"); const minorFix = commit();
    expect(check(save({ ...record(), covered: minorFix, findings: [minor] }))).toEqual([]);
    writeFileSync(join(root, "code.ts"), "late CI correction"); const corrected = commit();
    const r = { ...record(), covered: corrected, findings: [minor], followUps: [{ ...turn(corrected, "cleared"), scopeReason }] };
    expect(check(save(r))).toEqual([]);
    expect(check(save({ ...r, followUps: [turn(corrected, "cleared")] }))[0]?.message).toContain("needs an explicit scope reason");
  });
  it("spends the last turn on a correction after a cleared fix follow-up", () => {
    writeFileSync(join(root, "code.ts"), "first fix"); const first = commit();
    writeFileSync(join(root, "code.ts"), "late CI correction"); const corrected = commit();
    const r = { ...record(), covered: corrected, findings: [substantive], followUps: [turn(first, "cleared"), { ...turn(corrected, "cleared"), scopeReason }] };
    expect(check(save(r))).toEqual([]);
    expect(check(save({ ...r, followUps: [turn(first, "cleared"), turn(corrected, "cleared")] }))[0]?.message).toContain("only after the second turn returned blocked");
    // The scope reason belongs on the turn that spends the slot, not the one that cleared before it.
    expect(check(save({ ...r, followUps: [{ ...turn(first, "cleared"), scopeReason }, turn(corrected, "cleared")] }))[0]?.message).toContain("only after the second turn returned blocked");
    // Without the correction turn, the correction commit is exactly the uncovered code the rule refuses.
    expect(check(save({ ...r, covered: first, followUps: [turn(first, "cleared")] }))[0]?.message).toContain("invalidate");
  });
  it("never follows an incomplete turn, even with a scope reason", () => {
    writeFileSync(join(root, "code.ts"), "first fix"); const first = commit();
    writeFileSync(join(root, "code.ts"), "late CI correction"); const corrected = commit();
    const r = { ...record(), covered: corrected, findings: [substantive], followUps: [turn(first, "incomplete"), { ...turn(corrected, "cleared"), scopeReason }] };
    expect(check(save(r))[0]?.message).toContain("only after the second turn returned blocked");
  });
  it("refuses a correction once both follow-up turns are spent", () => {
    writeFileSync(join(root, "code.ts"), "first fix"); const first = commit();
    writeFileSync(join(root, "code.ts"), "second fix"); const second = commit();
    writeFileSync(join(root, "code.ts"), "late CI correction"); const corrected = commit();
    const r = { ...record(), covered: corrected, findings: [substantive], followUps: [turn(first, "blocked"), turn(second, "cleared"), { ...turn(corrected, "cleared"), scopeReason }] };
    const findings = check(save(r as unknown as LocalReviewRecord));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("<=2");
  });
  it("keeps a named hand-resolved trunk merge valid once a correction turn moves covered past it", () => {
    save(record());
    git(root, ["checkout", "-qb", "new-trunk", base]);
    writeFileSync(join(root, "code.ts"), "export const answer = 1; export const trunk = true;"); const newBase = commit();
    git(root, ["checkout", "-q", "-"]);
    expect(() => git(root, ["merge", "--no-ff", "-m", "conflicting integration", newBase])).toThrow();
    writeFileSync(join(root, "code.ts"), "export const answer = 2; export const trunk = true;");
    git(root, ["add", "code.ts"]); git(root, ["commit", "-qm", "resolve"]); const merge = git(root, ["rev-parse", "HEAD"]);
    const r = { ...record(), trunkIntegrations: [{ commit: merge, reason: "Resolved the answer constant against trunk's new export; both sides kept." }] };
    const verify = (rec: LocalReviewRecord) => checkLocalReview({ root, body: `review-record: ${path}`, labels: ["agent-reviewed"], head: save(rec), base: newBase });
    expect(verify(r)).toEqual([]);
    writeFileSync(join(root, "code.ts"), "late CI correction"); const corrected = commit();
    expect(verify({ ...r, covered: corrected, followUps: [{ ...turn(corrected, "cleared"), scopeReason }] })).toEqual([]);
    // Naming a plain commit in that range is still stray: only trunk merges are integrations.
    expect(verify({ ...r, covered: corrected, followUps: [{ ...turn(corrected, "cleared"), scopeReason }], trunkIntegrations: [{ commit: corrected, reason: "The correction commit is not a trunk merge." }] })[0]?.message).toContain("not a trunk merge");
  });
  it("still invalidates a code commit after a cleared correction", () => {
    writeFileSync(join(root, "code.ts"), "late CI correction"); const corrected = commit();
    const r = { ...record(), covered: corrected, followUps: [{ ...turn(corrected, "cleared"), scopeReason }] };
    expect(check(save(r))).toEqual([]);
    writeFileSync(join(root, "code.ts"), "another unreviewed change");
    expect(check(commit())[0]?.message).toContain("invalidate");
  });
});

describe("review evidence floors and shapes", () => {
  it("refuses an author-chosen reviewer label and accepts runner-issued ids", () => {
    for (const label of ["reviewer-mo-26-09-18-b", "7f3a9c2e", "/root/task_review", "claude-fable-review-7k2q"]) {
      expect(check(save({ ...record(), reviewerSession: label }))[0]?.message).toContain("runner-issued");
    }
    for (const id of ["a1b2c3d4e5f6a7b8c", "claude-code-subagent/a5f6df64ce8403def", "codex:0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4e", "0B1C2D3E-4F50-4A6B-8C7D-9E0F1A2B3C4E"]) {
      expect(check(save({ ...record(), reviewerSession: id }))).toEqual([]);
    }
  });
  it("refuses a reviewer session that already reviewed another task in this repository", () => {
    writeFileSync(join(root, ".agent/worklog/2026-09-09-earlier.md"), `Earlier review.\n\n\`\`\`morpheus-review\n${JSON.stringify({ ...record(), summary: "Earlier review." })}\n\`\`\`\n`);
    reviewed = commit();
    expect(check(save(record()))[0]?.message).toContain("already appears in .agent/worklog/2026-09-09-earlier.md");
    expect(check(save({ ...record(), reviewerSession: "c3d4e5f6a7b8c9d0e" }))).toEqual([]);
  });
  it("floors the initial review at one minute for normal and high risk only", () => {
    expect(check(save({ ...record(), elapsedMinutes: 0.99 }))[0]?.message).toContain("under one minute");
    expect(check(save({ ...record(), elapsedMinutes: 1 }))).toEqual([]);
    expect(check(save({ ...record(), risk: "high", elapsedMinutes: 0.7 }))[0]?.message).toContain("under one minute");
    expect(check(save({ ...record(), risk: "small", elapsedMinutes: 0.5 }))).toEqual([]);
  });
  it("gives small risk a ten-minute ceiling and a five-minute follow-up ceiling", () => {
    expect(check(save({ ...record(), risk: "small", elapsedMinutes: 10 }))).toEqual([]);
    expect(check(save({ ...record(), risk: "small", elapsedMinutes: 10.1 }))[0]?.message).toContain("budget");
    const turn = (elapsedMinutes: number) => ({ reviewerSession: "a1b2c3d4e5f6a7b8c", commit: reviewed, outcome: "cleared" as const, elapsedMinutes, scopeReason: "Late CI correction: one legacy test assumed the old layout", summary: "Cleared the correction after inspecting the fix." });
    expect(check(save({ ...record(), risk: "small", followUps: [turn(5)] }))).toEqual([]);
    expect(check(save({ ...record(), risk: "small", followUps: [turn(5.1)] }))[0]?.message).toContain("follow-up exceeded");
  });
});

describe("tracked deferrals", () => {
  const incidental = { id: "F01", severity: "incidental" as const, description: "Cron job has no year and fires every anniversary", paths: ["ops/cron.yaml"], disposition: "deferred" as const, response: "Cannot bite before the next anniversary; tracked." };
  it("requires a roadmap item for a deferred or open finding and checks it exists", () => {
    expect(check(save({ ...record(), findings: [incidental] }))[0]?.message).toContain("without a roadmap item");
    expect(check(save({ ...record(), findings: [{ ...incidental, disposition: "open" }] }))[0]?.message).toContain("without a roadmap item");
    expect(check(save({ ...record(), findings: [{ ...incidental, roadmap: "MO-26-09-22-08.00.00" }] }))[0]?.message).toContain("no such roadmap item");
    mkdirSync(join(root, "hq/product/roadmap"), { recursive: true });
    writeFileSync(join(root, "hq/product/roadmap/MO-26-09-22-08.00.00-fix-cron-year.md"), "---\nid: MO-26-09-22-08.00.00\n---\n");
    reviewed = commit();
    expect(check(save({ ...record(), findings: [{ ...incidental, roadmap: "MO-26-09-22-08.00.00" }] }))).toEqual([]);
    expect(check(save({ ...record(), findings: [{ ...incidental, disposition: "open", roadmap: "MO-26-09-22-08.00.00" }] }))).toEqual([]);
    expect(check(save({ ...record(), findings: [{ ...incidental, roadmap: "not-an-id" }] }))).toHaveLength(1);
  });
  it("does not ask a fixed finding for a roadmap item", () => {
    expect(check(save({ ...record(), findings: [{ ...incidental, disposition: "fixed", response: "Added the year field to the schedule." }] }))).toEqual([]);
  });
});

describe("conditional clearance", () => {
  const condition = { paths: ["code.ts"], evidence: "pnpm vitest run tests/code.test.ts must pass with the guard in place" };
  const substantive = { id: "TE-7", severity: "substantive" as const, description: "Two call sites on the operator path still bypass the guard", paths: ["code.ts"], disposition: "fixed" as const, response: "Routed both call sites through the guard." };
  const met: LocalReviewRecord["findings"][number] = { ...substantive, condition, conditionMet: "Ran the named vitest file at the covered commit: 12 passed." };
  it("lets a conditionally cleared substantive finding merge without a follow-up, within the condition's paths", () => {
    writeFileSync(join(root, "code.ts"), "guarded operator path"); const covered = commit();
    const r: LocalReviewRecord = { ...record(), covered, findings: [{ ...substantive, condition }] };
    expect(check(save(r))[0]?.message).toContain("record conditionMet");
    r.findings = [met];
    expect(check(save(r))).toEqual([]);
    writeFileSync(join(root, "other.ts"), "an edit the condition did not cover"); r.covered = commit();
    expect(check(save(r))[0]?.message).toContain("exceed the minor finding paths and reviewer conditions");
  });
  it("still requires a follow-up when any substantive finding is unconditional or disputed", () => {
    const findings: LocalReviewRecord["findings"] = [met, { ...substantive, id: "TE-8" }];
    expect(check(save({ ...record(), findings }))[0]?.message).toContain("require a follow-up");
    expect(check(save({ ...record(), findings: [{ ...substantive, condition, disposition: "disputed", response: "The operator path is unreachable in production." }] }))[0]?.message).toContain("require a follow-up");
  });
  it("refuses conditionMet that has no reviewer condition behind it", () => {
    expect(check(save({ ...record(), findings: [{ ...substantive, conditionMet: "Ran the tests; all passed." }] }))[0]?.message).toContain("without a reviewer condition");
  });
  it("lets a conditional follow-up clearance cover a later fix, but only within its paths", () => {
    const turn = { reviewerSession: "a1b2c3d4e5f6a7b8c", commit: reviewed, outcome: "cleared" as const, elapsedMinutes: 2, summary: "Cleared on condition that TE-7 is fixed within code.ts." };
    writeFileSync(join(root, "code.ts"), "guarded operator path"); const covered = commit();
    const r = { ...record(), covered, findings: [met], followUps: [turn] };
    expect(check(save(r))).toEqual([]);
    expect(check(save({ ...r, findings: [{ ...substantive, id: "TE-9" }] }))[0]?.message).toContain("final follow-up must clear the covered commit");
    writeFileSync(join(root, "other.ts"), "outside the condition"); r.covered = commit();
    expect(check(save(r))[0]?.message).toContain("exceed the reviewer's recorded conditions");
  });
});
