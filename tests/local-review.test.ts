import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkLocalReview, committedConfig, DRAFT_PENDING, git, MISSING_LABEL, reviewRequired, type LocalReviewRecord } from "../src/review/local.js";
import { checkPr, formatFindings } from "../src/check/pr.js";
import { prepareReview, validateReview } from "../src/cli/review.js";

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
  it.each(["complete", "incomplete"] as const)("reports the missing label without inferring that a %s record is unfinished", outcome => {
    const head = save({ ...record(), outcome });
    expect(check(head, `review-record: ${path}`, [])).toEqual([{
      level: "error",
      rule: "agent-review",
      message: "agent-reviewed label is not applied, so the PR is not marked merge-ready. Review record validation was not run. Apply the label once independent review covers the current head; leave it absent while a correction or follow-up is pending. While review is still under way, keep the PR a draft (gh pr ready --undo) and this check reports pending instead of failing.",
    }]);
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

describe("measured review timing", () => {
  const timing = (durationMs: number) => ({ source: "runner" as const, durationMs, evidence: "Runner invocation result total_duration_ms for this reviewer turn." });
  const measured = (durationMs = 312615): LocalReviewRecord => ({ ...record(), version: 2, elapsedMinutes: durationMs / 60000, timing: timing(durationMs) });

  it("emits a version2 template and assigns measurement to the author in the actual review packet", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await prepareReview(join(root, "hq/product"), root, base)).toBe(0);
      const output = log.mock.calls.map(args => args.join(" ")).join("\n");
      const template = JSON.parse(output.match(/```morpheus-review\n([\s\S]*?)\n```/)![1]!);
      expect(template.version).toBe(2);
      expect(template.timing).toEqual({ source: "runner", durationMs: 0, evidence: "Replace with this turn's runner result reference and measured duration." });
      expect(template.outcome).toBe("incomplete");
      expect(output).toContain("The author measures each turn from runner duration metadata");
      expect(output).toContain("Do not estimate\nelapsed time from workload");
      expect(output).toContain("Zero is a placeholder, not a measurement");
      expect(output).not.toContain("risk class; elapsed minutes;");
    } finally { log.mockRestore(); }
  });

  it("accepts the measured duration from issue281 instead of the reviewer's 40-minute estimate", () => {
    expect(check(save(measured()))).toEqual([]);
    expect(check(save({ ...measured(), elapsedMinutes: 40 }))[0]?.message).toContain("elapsedMinutes must equal timing.durationMs / 60000");
  });
  it("requires timing evidence on every version2 turn, including the legacy followUp field", () => {
    expect(check(save({ ...record(), version: 2 }))[0]?.message).toContain("version 2 requires measured timing");
    const r = measured();
    const turn = { reviewerSession: r.reviewerSession, commit: reviewed, outcome: "cleared" as const, elapsedMinutes: 140701 / 60000, scopeReason: "Late correction from focused regression test", summary: "Verified the correction and its regression evidence." };
    expect(check(save({ ...r, followUp: turn }))[0]?.message).toContain("version 2 requires measured timing");
    expect(check(save({ ...r, followUps: [{ ...turn, timing: timing(140701) }] }))).toEqual([]);
    expect(check(save({ ...r, followUp: { ...turn, timing: timing(140701), elapsedMinutes: 16 } }))[0]?.message).toContain("elapsedMinutes must equal");
  });
  it("keeps historical version1 records valid and validates any timing they carry", () => {
    expect(check(save(record()))).toEqual([]);
    expect(check(save({ ...measured(), version: 1 }))).toEqual([]);
    expect(check(save({ ...measured(), version: 1, elapsedMinutes: 3 }))[0]?.message).toContain("elapsedMinutes must equal");
  });
  it("preserves measured budget and floor boundaries without rounding", () => {
    expect(check(save(measured(30000)))).toEqual([]);
    expect(check(save(measured(48176)))).toEqual([]);
    expect(check(save(measured(29999)))[0]?.message).toContain("under 30 seconds");
    expect(check(save(measured(900000)))).toEqual([]);
    expect(check(save(measured(900001)))[0]?.message).toContain("exceeded its budget");
    const r = measured();
    const turn = (durationMs: number) => ({ reviewerSession: r.reviewerSession, commit: reviewed, outcome: "cleared" as const, elapsedMinutes: durationMs / 60000, timing: timing(durationMs), scopeReason: "Late correction from focused regression test", summary: "Verified the correction and its regression evidence." });
    expect(check(save({ ...r, followUps: [turn(450000)] }))).toEqual([]);
    expect(check(save({ ...r, followUps: [turn(450001)] }))[0]?.message).toContain("follow-up exceeded its budget");
  });
  it("accepts actual clock evidence but rejects unsupported sources and invalid measurements", () => {
    const r = measured();
    expect(check(save({ ...r, timing: { ...r.timing!, source: "clock", evidence: "Clock start 09:00:00.000Z; end 09:05:12.615Z, same invocation." } }))).toEqual([]);
    for (const t of [{ ...timing(312615), source: "estimate" }, timing(-1), timing(1.5), { ...timing(312615), evidence: "" }]) {
      expect(check(save({ ...r, timing: t } as LocalReviewRecord))[0]?.level).toBe("error");
    }
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
  it("accepts a summary that names code, because inline code renders", () => {
    // Before visibleText, any summary with a backticked path could never match its own paragraph.
    const r = { ...record(), summary: "Reviewed `src/review/local.ts` and found no actionable defects." };
    expect(check(save(r))).toEqual([]);
    // Still refused when the only copy is hidden.
    for (const hidden of [`<!-- ${r.summary} -->`, `\`\`\`text\n${r.summary}\n\`\`\``, `~~~text\n${r.summary}\n~~~`]) {
      writeFileSync(join(root, path), `${hidden}\n\n\`\`\`morpheus-review\n${JSON.stringify(r)}\n\`\`\`\n`);
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
  it("never automatically follows an incomplete turn, even with a scope reason", () => {
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
    expect(findings[0]?.message).toContain("humanAuthorization");
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
    for (const label of ["reviewer-mo-26-09-18-b", "7f3a9c2e", "claude-fable-review-7k2q"]) {
      expect(check(save({ ...record(), reviewerSession: label }))[0]?.message).toContain("runner-issued");
    }
    for (const id of ["/root/task_review", "/root/author/review", "a1b2c3d4e5f6a7b8c", "claude-code-subagent/a5f6df64ce8403def", "codex:0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4e", "0B1C2D3E-4F50-4A6B-8C7D-9E0F1A2B3C4E"]) {
      expect(check(save({ ...record(), reviewerSession: id }))).toEqual([]);
    }
  });
  it("refuses a reviewer session that already reviewed another task in this repository", () => {
    writeFileSync(join(root, ".agent/worklog/2026-09-09-earlier.md"), `Earlier review.\n\n\`\`\`morpheus-review\n${JSON.stringify({ ...record(), summary: "Earlier review." })}\n\`\`\`\n`);
    reviewed = commit();
    expect(check(save(record()))[0]?.message).toContain("already appears in .agent/worklog/2026-09-09-earlier.md");
    // A provider prefix or a change of case does not make a reused session fresh.
    expect(check(save({ ...record(), reviewerSession: "claude-code-subagent/a1b2c3d4e5f6a7b8c" }))[0]?.message).toContain("already appears");
    expect(check(save({ ...record(), reviewerSession: "A1B2C3D4E5F6A7B8C" }))[0]?.message).toContain("already appears");
    expect(check(save({ ...record(), reviewerSession: "c3d4e5f6a7b8c9d0e" }))).toEqual([]);
  });
  it("requires a globally scoped parent session for task paths and rejects malformed paths", () => {
    expect(check(save({ ...record(), reviewerSession: "/root/review", authorSession: "author-label" }))[0]?.message).toContain("parent session");
    for (const id of ["/root", "/root/../review", "/root/review/", "/root//review", "/root/review-name", "codex:/root/review"]) {
      expect(check(save({ ...record(), reviewerSession: id }))[0]?.message).toContain("runner-issued");
    }
  });
  it("scopes task-path reuse to the parent session with exact structured path matching", () => {
    const previous = { ...record(), reviewerSession: "/root/review" };
    writeFileSync(join(root, ".agent/worklog/earlier.md"), `Example /root/other.\n\n\`\`\`morpheus-review\n${JSON.stringify(previous)}\n\`\`\`\n`);
    reviewed = commit();
    expect(check(save({ ...record(), reviewerSession: "/root/review" }))[0]?.message).toContain("already appears");
    expect(check(save({ ...record(), reviewerSession: "/root/review", authorSession: `codex:${previous.authorSession.toUpperCase()}` }))[0]?.message).toContain("already appears");
    expect(check(save({ ...record(), reviewerSession: "/root/review", authorSession: "1b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d" }))).toEqual([]);
    expect(check(save({ ...record(), reviewerSession: "/root/other" }))).toEqual([]);
    expect(check(save({ ...record(), reviewerSession: "/root/review_extra" }))).toEqual([]);
  });
  it.each(["authorSession", "reviewerSession"] as const)("normalizes whitespace in historical %s before checking task reuse", field => {
    const previous = { ...record(), reviewerSession: "/root/review" };
    previous[field] = `  ${previous[field]}  `;
    writeFileSync(join(root, ".agent/worklog/earlier.md"), `Earlier review.\n\n\`\`\`morpheus-review\n${JSON.stringify(previous)}\n\`\`\`\n`);
    reviewed = commit();
    expect(check(save({ ...record(), reviewerSession: "/root/review" }))[0]?.message).toContain("already appears");
  });
  it("rejects prefixed self review and preserves task-path follow-up identity", () => {
    expect(check(save({ ...record(), reviewerSession: `codex:${record().authorSession.toUpperCase()}` }))[0]?.message).toContain("independent");
    const r: LocalReviewRecord = { ...record(), reviewerSession: "/root/review" };
    r.followUp = { reviewerSession: "/root/review", commit: reviewed, scopeReason: "Late correction verified by original reviewer", outcome: "cleared", elapsedMinutes: 2, summary: "Verified the correction and focused tests." };
    expect(check(save(r))).toEqual([]);
    r.followUp.reviewerSession = "/root/other";
    expect(check(save(r))[0]?.message).toContain("original reviewer");
  });
  it("floors the initial review at 30 seconds for normal and high risk only", () => {
    expect(check(save({ ...record(), elapsedMinutes: 0.49 }))[0]?.message).toContain("under 30 seconds");
    expect(check(save({ ...record(), elapsedMinutes: 0.5 }))).toEqual([]);
    expect(check(save({ ...record(), risk: "high", elapsedMinutes: 0.4 }))[0]?.message).toContain("under 30 seconds");
    expect(check(save({ ...record(), risk: "small", elapsedMinutes: 0.4 }))).toEqual([]);
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


describe("human-authorized extra review turns", () => {
  const authorization = { approvedBy: "Chris Heinrich", approvedAt: "2026-09-25T18:00:00Z", reason: "Explicitly approved one additional review for the late CI correction." };
  function extraTurns() {
    const r = record();
    r.followUps = Array.from({ length: 3 }, () => ({ reviewerSession: r.reviewerSession, commit: reviewed, outcome: "cleared" as const, elapsedMinutes: 2, scopeReason: "Late CI correction requires another bounded review.", summary: "Verified the correction and its focused regression test." }));
    return r;
  }
  it("keeps the default cap and accepts an explicitly authorized extra turn", () => {
    const r = extraTurns();
    expect(check(save(r))[0]?.message).toContain("humanAuthorization");
    r.followUps![2]!.humanAuthorization = authorization;
    expect(check(save(r))).toEqual([]);
  });
  it("does not extend one authorization to the next turn", () => {
    const r = extraTurns(); r.followUps![2]!.humanAuthorization = authorization;
    r.followUps!.push({ ...r.followUps![0]! });
    expect(check(save(r))[0]?.message).toContain("humanAuthorization");
  });
  it("retains same-reviewer, final-clearance, and coverage requirements", () => {
    const r = extraTurns(); r.followUps![2]!.humanAuthorization = authorization;
    r.followUps![2]!.reviewerSession = "b2c3d4e5f6a7b8c9d";
    expect(check(save(r))[0]?.message).toContain("original reviewer");
    r.followUps![2]!.reviewerSession = r.reviewerSession;
    r.followUps![2]!.outcome = "blocked";
    expect(check(save(r))).toHaveLength(1);
    r.followUps![2]!.outcome = "cleared";
    save(r); writeFileSync(join(root, "code.ts"), "unreviewed correction");
    expect(check(commit())[0]?.message).toContain("invalidate");
  });
  it("rejects empty or malformed authorization evidence", () => {
    const r = extraTurns();
    for (const bad of [{ ...authorization, approvedBy: " " }, { ...authorization, approvedAt: "yesterday" }, { ...authorization, reason: "" }]) {
      r.followUps![2]!.humanAuthorization = bad;
      expect(check(save(r))).toHaveLength(1);
    }
  });
});

describe("one automatic finalization-only turn", () => {
  const session = "a1b2c3d4e5f6a7b8c";
  const attestation = { evidence: "Re-read the paragraph against the cleared diff; it restates the reviewed behaviour and adds no requirement.", attestation: "Finalization only: explanatory prose for the change I already cleared. No new implementation was reviewed." };
  function finalize(paths: string[], over: Record<string, unknown> = {}) {
    return { reviewerSession: session, commit: reviewed, outcome: "cleared" as const, elapsedMinutes: 1, scopeReason: "Finalize the explanatory documentation for the already-cleared fix.", summary: "Cleared the explanatory paragraph; nothing else changed.", finalization: { paths, ...attestation }, ...over };
  }
  function docCommit(text: string) {
    mkdirSync(join(root, "docs/runbooks"), { recursive: true });
    writeFileSync(join(root, "docs/runbooks/guide.md"), text);
    return commit();
  }
  it("clears an explanatory documentation commit beyond the cap, without a human decision", () => {
    const r = record();
    r.followUps = Array.from({ length: 3 }, () => ({ reviewerSession: session, commit: reviewed, outcome: "cleared" as const, elapsedMinutes: 2, scopeReason: "Late CI correction requires another bounded review.", summary: "Verified the correction and its focused regression test." }));
    r.followUps[2]!.humanAuthorization = { approvedBy: "Chris Heinrich", approvedAt: "2026-09-27T12:00:00Z", reason: "Explicitly approved one additional substantive review turn." };
    // A fourth follow-up would normally need its own authorization; a finalization turn does not.
    expect(check(save({ ...r, followUps: [...r.followUps, { ...finalize(["docs/runbooks/guide.md"]), finalization: undefined }] }))[0]?.message).toContain("humanAuthorization");
    const covered = docCommit("Explains the behaviour that was already reviewed.");
    r.covered = covered;
    r.followUps.push(finalize(["docs/runbooks/guide.md"], { commit: covered }));
    expect(check(save(r))).toEqual([]);
  });
  function cleared(overrides: Partial<LocalReviewRecord> = {}) {
    const covered = docCommit("Explains the behaviour that was already reviewed.");
    const r: LocalReviewRecord = { ...record(), covered, followUps: [{ reviewerSession: session, commit: reviewed, outcome: "cleared" as const, elapsedMinutes: 2, scopeReason: "Initial clearance of the implementation.", summary: "Cleared the implementation and its tests." }, finalize(["docs/runbooks/guide.md"], { commit: covered })], ...overrides };
    return r;
  }
  it("allows only one finalization turn per pull request", () => {
    const r = cleared();
    r.followUps!.splice(1, 0, finalize(["docs/runbooks/guide.md"]));
    expect(check(save(r))[0]?.message).toContain("one automatic finalization-only turn");
  });
  it("caps the turn at five minutes", () => {
    const r = cleared();
    r.followUps![1]!.elapsedMinutes = 5.5;
    expect(check(save(r))[0]?.message).toContain("capped at 5 minutes");
    r.followUps![1]!.elapsedMinutes = 5;
    expect(check(save(r))).toEqual([]);
  });
  it("requires the original reviewer and refuses a replacement", () => {
    const r = cleared();
    r.followUps![1]!.reviewerSession = "b2c3d4e5f6a7b8c9d";
    expect(check(save(r))[0]?.message).toContain("original reviewer session");
  });
  it.each(["blocked", "incomplete"] as const)("leaves a %s finalization turn blocked rather than clearing", outcome => {
    const r = cleared();
    r.followUps![1]!.outcome = outcome;
    expect(check(save(r))[0]?.message).toContain("blocked");
  });
  it("allows explicitly authorized continuation and still requires finalization scope", () => {
    const r = cleared();
    r.followUps!.push({ reviewerSession: session, commit: r.covered, outcome: "cleared", elapsedMinutes: 2, scopeReason: "Another look after finalization.", summary: "Verified the explicitly authorized correction after finalization.", humanAuthorization: { approvedBy: "Chris Heinrich", approvedAt: "2026-09-27T12:30:00Z", reason: "Authorized another substantive turn after the finalization turn." } });
    expect(check(save(r))).toEqual([]);
    delete r.followUps![2]!.humanAuthorization;
    expect(check(save(r))[0]?.message).toContain("humanAuthorization");
    const bare = cleared();
    delete bare.followUps![1]!.scopeReason;
    expect(check(save(bare))[0]?.message).toContain("scopeReason");
  });
  it("requires authorization after an early finalization even within the ordinary cap", () => {
    const r = cleared();
    r.followUps!.shift();
    r.followUps!.push({ reviewerSession: session, commit: r.covered, outcome: "cleared", elapsedMinutes: 2, scopeReason: "Late correction after finalization.", summary: "Verified the correction." });
    expect(check(save(r))[0]?.message).toContain("every turn after finalization");
  });
  it("checks the actual predecessor and historical finalization scope after authorized continuation", () => {
    const r = cleared();
    const authorization = { approvedBy: "Chris Heinrich", approvedAt: "2026-09-28T23:09:04Z", reason: "Explicitly authorized additional review rounds to complete the PR." };
    r.followUps!.push({ reviewerSession: session, commit: r.covered, outcome: "cleared", elapsedMinutes: 2, scopeReason: "Late correction after finalization.", summary: "Verified the correction.", humanAuthorization: authorization });
    r.followUps![0]!.outcome = "blocked";
    expect(check(save(r))[0]?.message).toContain("only follows a cleared turn");
    r.followUps![0]!.outcome = "cleared";
    r.followUps![1]!.finalization!.paths = ["AGENTS.md"];
    expect(check(save(r))[0]?.message).toContain("normative policy");
    r.followUps![1]!.finalization!.paths = ["docs/runbooks/guide.md"];
    writeFileSync(join(root, "code.ts"), "unreviewed code riding in finalization");
    r.covered = commit();
    r.followUps![1]!.commit = r.covered;
    r.followUps![2]!.commit = r.covered;
    expect(check(save(r))[0]?.message).toContain("may cover only the review record");
  });
  it("requires a separate authorization for every subsequent turn", () => {
    const r = cleared();
    const turn = { reviewerSession: session, commit: r.covered, outcome: "cleared" as const, elapsedMinutes: 2, scopeReason: "Authorized late correction.", summary: "Verified the correction.", humanAuthorization: { approvedBy: "Chris Heinrich", approvedAt: "2026-09-28T23:09:04Z", reason: "Explicitly authorized additional review rounds to complete the PR." } };
    r.followUps!.push(turn, { ...turn, humanAuthorization: undefined });
    expect(check(save(r))[0]?.message).toContain("humanAuthorization");
    r.followUps![3]!.humanAuthorization = turn.humanAuthorization;
    expect(check(save(r))).toEqual([]);
  });
  it("cannot resolve substantive findings by itself", () => {
    const substantive = { id: "TE-11", severity: "substantive" as const, description: "The operator path still bypasses the guard", paths: ["code.ts"], disposition: "fixed" as const, response: "Routed it through the guard." };
    const covered = docCommit("Explains the behaviour.");
    const r: LocalReviewRecord = { ...record(), covered, findings: [substantive], followUps: [finalize(["docs/runbooks/guide.md"], { commit: covered })] };
    expect(check(save(r))[0]?.message).toContain("cannot resolve substantive findings");
  });
  it("refuses normative policy paths however they are attested", () => {
    for (const path of ["AGENTS.md", "docs/nested/CLAUDE.md", "morpheus.json", ".github/workflows/ci.yml", ".ci/known-skips.json", ".morpheus/credentials.json"]) {
      const r = cleared();
      r.followUps![1]!.finalization!.paths = [path];
      const message = check(save(r))[0]?.message ?? "";
      expect(message).toContain("out of scope");
      expect(message).toContain("normative policy");
    }
  });
  it("refuses source files it merely attested, and admits a conditioned one", () => {
    const r = cleared();
    writeFileSync(join(root, "code.ts"), "an implementation change nobody reviewed");
    const covered = commit();
    r.covered = covered;
    r.followUps![1]!.commit = covered;
    r.followUps![1]!.finalization!.paths = ["code.ts", "docs/runbooks/guide.md"];
    expect(check(save(r))[0]?.message).toContain("neither a conditioned path nor explanatory documentation");
    r.findings = [{ id: "TE-12", severity: "substantive", description: "The operator path still bypasses the guard", paths: ["code.ts"], disposition: "fixed", response: "Routed it through the guard.", condition: { paths: ["code.ts"], evidence: "Run the focused guard test at the fix commit." }, conditionMet: "Ran it at the covered commit: 12 passed." }];
    expect(check(save(r))).toEqual([]);
  });
  it("checks the attestation against the diff it claims to cover", () => {
    const r = cleared();
    // Attesting documentation does not silently clear an implementation change in the same commit.
    writeFileSync(join(root, "code.ts"), "an implementation change riding along");
    const covered = docCommit("Explains the behaviour, alongside unreviewed code.");
    r.covered = covered;
    r.followUps![1]!.commit = covered;
    expect(check(save(r))[0]?.message).toContain("may cover only the review record");
  });
  it("leaves the ordinary three-turn contract and human authorizations unchanged", () => {
    const plain = record();
    plain.followUps = Array.from({ length: 3 }, () => ({ reviewerSession: session, commit: reviewed, outcome: "cleared" as const, elapsedMinutes: 2, scopeReason: "Late CI correction requires another bounded review.", summary: "Verified the correction and its focused regression test." }));
    expect(check(save(plain))[0]?.message).toContain("humanAuthorization");
    expect(check(save({ ...record(), followUps: [{ reviewerSession: session, commit: reviewed, outcome: "cleared", elapsedMinutes: 2, scopeReason: "Late CI correction.", summary: "Verified the correction and its regression test." }] }))).toEqual([]);
  });
});

describe("what a finalization turn must not be able to clear", () => {
  const session = "a1b2c3d4e5f6a7b8c";
  const attestation = { evidence: "Re-read the paragraph against the cleared diff; it adds no requirement.", attestation: "Finalization only: explanatory prose for work already cleared." };
  const substantive = { id: "TE-20", severity: "substantive" as const, description: "The operator path still bypasses the guard", paths: ["code.ts"], disposition: "fixed" as const, response: "Routed it through the guard." };
  function docCommit(text: string) {
    mkdirSync(join(root, "docs/runbooks"), { recursive: true });
    writeFileSync(join(root, "docs/runbooks/guide.md"), text);
    return commit();
  }
  // FIN-1: the guard required only that a non-finalization turn existed, not that one cleared, so
  // the five-minute automatic turn could flip a review blocked on a substantive finding into a merge.
  it("does not let it follow a blocked or incomplete turn", () => {
    const covered = docCommit("Explains the behaviour.");
    const fin = { reviewerSession: session, commit: covered, outcome: "cleared" as const, elapsedMinutes: 1, scopeReason: "Finalize the explanatory paragraph.", summary: "Cleared the paragraph.", finalization: { paths: ["docs/runbooks/guide.md"], ...attestation } };
    for (const outcome of ["blocked", "incomplete"] as const) {
      const r: LocalReviewRecord = { ...record(), covered, findings: [substantive], followUps: [{ reviewerSession: session, commit: reviewed, outcome, elapsedMinutes: 2, summary: `The operator path finding is ${outcome}.` }, fin] };
      expect(check(save(r))[0]?.message).toContain("only follows a cleared turn");
    }
    // A finalization turn alone still cannot stand in for the turn a substantive finding needs.
    expect(check(save({ ...record(), covered, findings: [substantive], followUps: [fin] }))[0]?.message).toContain("ordinary turn must clear them first");
  });
  // FIN-2: the scope used every condition, while the rest of the checker uses only satisfied ones,
  // so a condition the author never discharged still widened it to an implementation file.
  it("does not treat an unsatisfied condition's paths as cleared", () => {
    writeFileSync(join(root, "code.ts"), "an implementation change the condition never discharged");
    const covered = commit();
    const condition = { paths: ["code.ts"], evidence: "Run the focused guard test at the fix commit." };
    const disputed = { ...substantive, id: "TE-21", disposition: "disputed" as const, response: "The operator path is unreachable in production.", condition };
    const minorUnmet = { id: "TE-22", severity: "minor" as const, description: "Missing helpful error context on the guard", paths: ["code.ts"], disposition: "disputed" as const, response: "The context is already in the wrapping error.", condition };
    for (const finding of [disputed, minorUnmet]) {
      const r: LocalReviewRecord = {
        ...record(), covered, findings: [finding],
        followUps: [
          { reviewerSession: session, commit: reviewed, outcome: "cleared", elapsedMinutes: 2, scopeReason: "Late correction after the initial review.", summary: "Cleared the implementation after the fix follow-up." },
          { reviewerSession: session, commit: covered, outcome: "cleared", elapsedMinutes: 1, scopeReason: "Finalize the conditioned fix.", summary: "Cleared it.", finalization: { paths: ["code.ts"], ...attestation } },
        ],
      };
      expect(check(save(r))[0]?.message).toContain("neither a conditioned path nor explanatory documentation");
    }
    // The same path is admitted once the condition is actually satisfied.
    const met = { ...substantive, id: "TE-23", condition, conditionMet: "Ran the named guard test at the covered commit: 12 passed." };
    const ok: LocalReviewRecord = {
      ...record(), covered, findings: [met],
      followUps: [
        { reviewerSession: session, commit: reviewed, outcome: "cleared", elapsedMinutes: 2, summary: "Cleared the implementation after the fix follow-up." },
        { reviewerSession: session, commit: covered, outcome: "cleared", elapsedMinutes: 1, scopeReason: "Finalize the conditioned fix.", summary: "Cleared it.", finalization: { paths: ["code.ts"], ...attestation } },
      ],
    };
    expect(check(save(ok))).toEqual([]);
  });
  // FIN-3: the normative set was case-sensitive and anchored its directories at the repo root.
  it("refuses normative policy under any spelling or depth", () => {
    const covered = docCommit("Explains the behaviour.");
    for (const path of ["agents.md", "docs/Claude.md", "docs/claude.md", "apps/web/.github/workflows/ci.md", "packages/shared/.ci/skips.json", "apps/web/morpheus.json"]) {
      const r: LocalReviewRecord = { ...record(), covered, followUps: [
        { reviewerSession: session, commit: reviewed, outcome: "cleared", elapsedMinutes: 2, scopeReason: "Late correction after the clean initial review.", summary: "Cleared the implementation and its tests." },
        { reviewerSession: session, commit: covered, outcome: "cleared", elapsedMinutes: 1, scopeReason: "Finalize the paragraph.", summary: "Cleared it.", finalization: { paths: [path], ...attestation } },
      ] };
      expect(check(save(r))[0]?.message).toContain("normative policy");
    }
  });
});

describe("the shape Evo #291 needs", () => {
  // Four substantive turns, the last explicitly authorized, a conditional clearance the author
  // fixed, and one commit that also carried the runbook paragraph explaining that fix. Before the
  // finalization turn this was blocked with no honest way forward: the author could not widen the
  // reviewer's condition, the fix commit was pushed so it could not be split, and after `covered`
  // only the worklog may change.
  const session = "/root/ios_recovery_review";
  const author = "01a0ded27ceb77439092";
  it("clears the conditioned fix and its explanatory runbook paragraph, and still refuses new source", () => {
    writeFileSync(join(root, "controller.ts"), "ordering by start time");
    mkdirSync(join(root, "docs/runbooks"), { recursive: true });
    writeFileSync(join(root, "docs/runbooks/recovery.md"), "Explains that duplicates are judged by start time.");
    const covered = commit();
    const turn = (commit: string, over: Record<string, unknown> = {}) => ({ reviewerSession: session, commit, outcome: "cleared" as const, elapsedMinutes: 1, summary: "Reviewed the change and its regression tests.", ...over });
    const r: LocalReviewRecord = {
      ...record(), authorSession: author, reviewerSession: session, risk: "high", elapsedMinutes: 2.2, covered,
      findings: [{
        id: "REC-006", severity: "substantive", description: "Duplicate check contexts were ordered by completion time, so an unfinished rerun lost to an older success",
        paths: ["controller.ts"], disposition: "fixed", response: "Ordered by start time, with ambiguous duplicates pending.",
        condition: { paths: ["controller.ts"], evidence: "Run the focused recovery tests; sentinel, overlapping and ambiguous duplicates must be covered." },
        conditionMet: "Ran them at the fix commit: 50 passed, no skips, and web / web is green on Linux.",
      }],
      followUps: [
        turn(reviewed, { outcome: "blocked", summary: "Two findings need correction before this can clear." }),
        turn(reviewed, { scopeReason: "Resolve what the previous turn blocked." }),
        turn(reviewed, { scopeReason: "Trunk integration added source changes after the previous clearance.", humanAuthorization: { approvedBy: "Chris Heinrich", approvedAt: "2026-09-27T07:20:00Z", reason: "Explicitly authorized one additional review after trunk integration added source changes." } }),
        turn(covered, {
          scopeReason: "Finalize the runbook paragraph documenting the conditioned fix.",
          elapsedMinutes: 1.2,
          finalization: {
            paths: ["controller.ts", "docs/runbooks/recovery.md"],
            evidence: "Compared the paragraph with the diff I cleared; it restates the ordering rule and adds no requirement.",
            attestation: "Finalization only: the conditioned fix plus the explanatory runbook paragraph for it. No new implementation was reviewed.",
          },
        }),
      ],
    };
    expect(check(save(r))).toEqual([]);
    // The same turn cannot carry a source file it never conditioned.
    writeFileSync(join(root, "other.ts"), "new implementation");
    const wider = commit();
    r.covered = wider;
    r.followUps![3]!.commit = wider;
    r.followUps![3]!.finalization!.paths = [...r.followUps![3]!.finalization!.paths, "other.ts"];
    expect(check(save(r))[0]?.message).toContain("neither a conditioned path nor explanatory documentation");
  });
});


describe("authorized continuation after missing review evidence", () => {
  const authorization = { approvedBy: "Chris Heinrich", approvedAt: "2026-09-28T23:09:04Z", reason: "Explicitly authorized another same-reviewer turn after obtaining the missing evidence." };
  function pendingEvidence(): LocalReviewRecord {
    const r = record();
    r.version = 2;
    r.timing = { source: "runner", durationMs: 180000, evidence: "Initial runner duration: 180000 ms." };
    r.followUps = [
      { reviewerSession: r.reviewerSession, commit: reviewed, outcome: "incomplete", elapsedMinutes: 151444 / 60000, timing: { source: "runner", durationMs: 151444, evidence: "Missing-evidence review runner duration: 151444 ms." }, scopeReason: "Late correction requires diagnostic evidence.", summary: "Incomplete: diagnostic evidence is missing; no clearance was given." },
      { reviewerSession: r.reviewerSession, commit: reviewed, outcome: "cleared", elapsedMinutes: 2, timing: { source: "runner", durationMs: 120000, evidence: "Authorized follow-up runner duration: 120000 ms." }, humanAuthorization: authorization, scopeReason: "Review the missing evidence and resulting correction.", summary: "The original reviewer inspected the evidence and cleared the correction." },
    ];
    return r;
  }
  it("preserves an incomplete verdict when a human authorizes the next same-reviewer clearance", () => {
    const r = pendingEvidence();
    expect(check(save(r))).toEqual([]);
    expect(r.followUps![0]!.outcome).toBe("incomplete");
  });
  it("requires authorization on the next turn, even within the default turn cap", () => {
    const r = pendingEvidence();
    r.followUps![0]!.humanAuthorization = authorization;
    delete r.followUps![1]!.humanAuthorization;
    expect(check(save(r))[0]?.message).toContain("humanAuthorization");
  });
  it.each([0, 1])("still enforces the budget of follow-up %i", index => {
    const r = pendingEvidence();
    r.followUps![index]!.elapsedMinutes = 450001 / 60000;
    r.followUps![index]!.timing!.durationMs = 450001;
    expect(check(save(r))[0]?.message).toContain("follow-up exceeded its budget");
  });
  it("retains the original reviewer and requires final clearance", () => {
    const r = pendingEvidence();
    r.followUps![1]!.reviewerSession = "b2c3d4e5f6a7b8c9d";
    expect(check(save(r))[0]?.message).toContain("original reviewer");
    r.followUps![1]!.reviewerSession = r.reviewerSession;
    r.followUps![1]!.outcome = "incomplete";
    expect(check(save(r))[0]?.message).toContain("final follow-up must clear");
  });
});

describe("a draft is pending, not failing", () => {
  const draft = (head: string, labels: string[], body = `review-record: ${path}`) => checkLocalReview({ root, body, labels, head, base, draft: true });
  it("reports a draft without the label as a pending warning, never an error", () => {
    const head = save(record());
    expect(draft(head, [])).toEqual([{ level: "warning", rule: "agent-review", message: DRAFT_PENDING }]);
  });
  it("fails the same PR once it is ready, and when draft state is unknown", () => {
    const head = save(record());
    expect(checkLocalReview({ root, body: "", labels: [], head, base, draft: false })).toEqual([{ level: "error", rule: "agent-review", message: MISSING_LABEL }]);
    expect(checkLocalReview({ root, body: "", labels: [], head, base })).toEqual([{ level: "error", rule: "agent-review", message: MISSING_LABEL }]);
  });
  it("still validates the record on a draft once the label claims review is complete", () => {
    const head = save({ ...record(), outcome: "blocked" });
    expect(draft(head, ["agent-reviewed"])).toEqual([{ level: "error", rule: "agent-review", message: "review is blocked; leave the PR open and disable auto-merge" }]);
    expect(draft(save(record()), ["agent-reviewed"])).toEqual([]);
  });
  it("keeps a pending draft from failing PR conventions, and a ready one from passing", async () => {
    const head = save(record());
    const ctx = { body: "## Test plan\nRan tests\n## Open questions\nNone", branch: "inbox-2026-10-07", changedFiles: ["code.ts"], productDir: join(root, "hq/product") };
    const pending = await checkPr({ ...ctx, agentReview: draft(head, []) });
    expect(pending.filter(f => f.level === "error")).toEqual([]);
    expect(formatFindings(pending)).toContain(`! [agent-review] ${DRAFT_PENDING}`);
    const ready = await checkPr({ ...ctx, agentReview: check(head, `review-record: ${path}`, []) });
    expect(ready.filter(f => f.level === "error").map(f => f.message)).toEqual([MISSING_LABEL]);
  });
});

describe("reading morpheus.json at the head", () => {
  it("treats a manifest absent at a present commit as defaults, so review stays required", () => {
    git(root, ["rm", "-q", "morpheus.json"]);
    const head = commit();
    expect(committedConfig(root, head)).toEqual({});
    expect(check(head, `review-record: ${path}`, [])).toEqual([{ level: "error", rule: "agent-review", message: MISSING_LABEL }]);
  });
  it("names a head the checkout does not hold instead of surfacing a raw git failure", () => {
    const missing = "f".repeat(40);
    expect(() => committedConfig(root, missing)).toThrow(`commit ${missing} is not in this checkout`);
    expect(check(missing)[0]?.message).toContain(`git fetch origin ${missing}`);
    expect(check(missing)[0]?.message).not.toContain("Command failed");
  });
  it("reports an unparseable manifest as such", () => {
    writeFileSync(join(root, "morpheus.json"), "{ not json");
    const head = commit();
    expect(check(head)[0]?.message).toContain(`morpheus.json at ${head.slice(0, 12)} is not valid JSON`);
  });
});

describe("review validate runs CI's record check before a push", () => {
  let log: string[];
  let errors: string[];
  let cwd: string;
  beforeEach(() => {
    log = []; errors = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { log.push(args.join(" ")); });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { errors.push(args.join(" ")); });
    cwd = process.cwd();
  });
  afterEach(() => { vi.restoreAllMocks(); process.chdir(cwd); });
  it("finds the branch's committed record without being told, and passes it", () => {
    const head = save(record());
    expect(validateReview(root, base)).toBe(0);
    expect(log[0]).toBe(`✓ ${path} validates at ${head.slice(0, 12)} against ${base}.`);
  });
  it("refuses exactly what CI refuses, with CI's message", () => {
    // The commonest format failure in the field: the summary only inside the JSON block.
    const r = record();
    writeFileSync(join(root, path), `Some other prose.\n\n\`\`\`morpheus-review\n${JSON.stringify(r)}\n\`\`\`\n`);
    const head = commit();
    const ci = check(head)[0]!.message;
    expect(ci).toBe("repeat the review summary as a visible paragraph outside the JSON block");
    expect(validateReview(root, base, path)).toBe(1);
    expect(errors).toEqual([`✗ [agent-review] ${ci}`]);
  });
  it("refuses code committed after the covered commit, as CI does", () => {
    save(record()); writeFileSync(join(root, "code.ts"), "unreviewed change"); commit();
    expect(validateReview(root, base, path)).toBe(1);
    expect(errors[0]).toBe("✗ [agent-review] changes after covered commit invalidate review (only its worklog and trunk merges may follow)");
  });
  it("checks the PR body's review-record line and that it names the same file", () => {
    save(record());
    const body = join(root, "body.md");
    writeFileSync(body, "## Test plan\nno pointer here\n");
    expect(validateReview(root, base, undefined, body)).toBe(1);
    expect(errors[0]).toBe("✗ [agent-review] PR body needs one visible review-record: .agent/worklog/<task>.md line");
    writeFileSync(body, `review-record: ${path}\n`);
    expect(validateReview(root, base, ".agent/worklog/2026-09-10-other.md", body)).toBe(1);
    expect(errors[1]).toBe(`✗ [agent-review] the PR body names ${path}, not .agent/worklog/2026-09-10-other.md`);
    expect(validateReview(root, base, undefined, body)).toBe(0);
  });
  it("refuses to guess between records, or when none is committed", () => {
    expect(validateReview(root, base)).toBe(1);
    expect(errors[0]).toBe(`✗ [agent-review] no committed worklog changed since ${base} carries a morpheus-review block; commit the record, or name its path`);
    save(record());
    writeFileSync(join(root, ".agent/worklog/2026-09-10-second.md"), `x\n\n\`\`\`morpheus-review\n{}\n\`\`\`\n`); commit();
    expect(validateReview(root, base)).toBe(1);
    expect(errors[1]).toContain("several worklogs on this branch carry a review record");
  });
  it("warns that uncommitted edits to the record were not validated", () => {
    save(record());
    writeFileSync(join(root, path), "edited but not committed");
    expect(validateReview(root, base, path)).toBe(0);
    expect(log[1]).toBe(`! ${path} has uncommitted changes; they were not validated and CI will not see them until committed.`);
  });
  it("does not require the label it exists to justify applying", () => {
    save(record());
    expect(validateReview(root, base, path)).toBe(0);
    expect(errors).toEqual([]);
  });
});
