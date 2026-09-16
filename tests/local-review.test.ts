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
  git(root, ["commit", "-qm", "fixture"]);
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
  it("preserves the initial review and requires scoped follow-up after trunk integration", () => {
    git(root, ["checkout", "-qb", "new-trunk", base]);
    writeFileSync(join(root, "trunk.ts"), "new trunk code"); const newBase = commit();
    git(root, ["checkout", "--detach", reviewed]);
    git(root, ["merge", "--no-ff", "-m", "integrate trunk", newBase]); const covered = git(root, ["rev-parse", "HEAD"]);
    const r = { ...record(), covered };
    const verify = () => checkLocalReview({ root, body: `review-record: ${path}`, labels: ["agent-reviewed"], head: save(r), base: newBase });
    expect(verify()[0]?.message).toContain("base is stale");
    const followUp = { reviewerSession: r.reviewerSession, commit: covered, base: newBase, outcome: "cleared" as const, elapsedMinutes: 2, summary: "Reviewed the integration and affected paths" };
    Object.assign(r, { followUp });
    expect(verify()[0]?.message).toContain("scope reason");
    Object.assign(followUp, { scopeReason: "Explicitly include required trunk integration in the one follow-up" });
    expect(verify()).toEqual([]);
    followUp.base = reviewed; // Not the PR merge base, even though it is an ancestor.
    expect(verify()[0]?.message).toContain("base is stale");
  });
});

describe("reviewed documentation integration without another review round", () => {
  const sourcePath = '.agent/worklog/2026-09-10-docs.md';
  function integrate(opts: { file?: string; sourceOutcome?: 'complete' | 'incomplete'; sourceBase?: string; symlink?: boolean; executable?: boolean; conflict?: boolean } = {}) {
    const r = record();
    r.findings = [{ id: 'F01', severity: 'substantive', description: 'Missing authorization check', paths: ['code.ts'], disposition: 'fixed', response: 'Implemented and verified the check' }];
    r.followUp = { reviewerSession: r.reviewerSession, commit: reviewed, outcome: 'cleared', elapsedMinutes: 2, summary: 'The original reviewer cleared the fix.' };
    const feature = save(r);
    git(root, ['checkout', '--detach', base]);
    const file = opts.file ?? 'README.md';
    if (opts.symlink) execFileSync('ln', ['-s', 'code.ts', join(root, file)]);
    else writeFileSync(join(root, file), file === 'morpheus.json' ? '{"review":{"required":true}}' : 'Document the operations directory.');
    if (opts.executable) execFileSync('chmod', ['+x', join(root, file)]);
    const docReviewed = commit();
    const docRecord: LocalReviewRecord = { ...record(), base: opts.sourceBase ?? base, reviewed: docReviewed, covered: docReviewed, outcome: opts.sourceOutcome ?? 'complete', summary: 'Independent documentation review completed.' };
    mkdirSync(join(root, ".agent/worklog"), { recursive: true });
    writeFileSync(join(root, sourcePath), `${docRecord.summary}\n\n\`\`\`morpheus-review\n${JSON.stringify(docRecord)}\n\`\`\`\n`);
    const docHead = commit();
    // Production repositories squash the documentation PR: original review hashes
    // are retained as evidence rather than pretending they identify the squash.
    git(root, ['checkout', '--detach', base]);
    git(root, ['merge', '--squash', docHead]);
    const newBase = commit();
    git(root, ['checkout', '--detach', feature]);
    if (opts.conflict) {
      writeFileSync(join(root, 'README.md'), 'Different feature documentation.');
      r.covered = r.reviewed = reviewed = commit();
      r.followUp!.commit = reviewed;
      save(r);
      expect(() => git(root, ['merge', '--no-ff', '-m', 'conflicting integration', newBase])).toThrow();
      writeFileSync(join(root, 'README.md'), 'Manually resolved documentation.');
      commit();
    } else git(root, ['merge', '--no-ff', '-m', 'integrate documentation', newBase]);
    r.documentationIntegrations = [{ base: newBase, commit: git(root, ['rev-parse', 'HEAD']), reason: 'Integrate already reviewed documentation without changing executable files.', sources: [{ commit: newBase, reviewRecord: sourcePath }] }];
    const verify = () => checkLocalReview({ root, body: `review-record: ${path}`, labels: ['agent-reviewed'], head: save(r), base: newBase });
    return { r, newBase, verify };
  }
  it('preserves both cleared review rounds after a verified documentation squash merge', () => {
    const { r, verify } = integrate();
    const original = [r.base, r.reviewed, r.covered, r.followUp!.commit];
    expect(verify()).toEqual([]);
    expect([r.base, r.reviewed, r.covered, r.followUp!.commit]).toEqual(original);
  });
  it('requires explicit integration evidence even for documentation', () => {
    const { r, verify } = integrate(); delete r.documentationIntegrations; r.summary = 'The integration proof was deliberately omitted.';
    expect(verify()).toHaveLength(1);
  });
  it.each(['another.ts', 'AGENTS.md', 'morpheus.json'])('rejects incoming executable/configuration/instruction path %s', file => {
    expect(integrate({ file }).verify()[0]?.message).toContain('non-documentation');
  });
  it('rejects a Markdown symlink', () => {
    expect(integrate({ symlink: true }).verify()[0]?.message).toContain('regular non-executable');
  });
  it('rejects executable Markdown', () => {
    expect(integrate({ executable: true }).verify()[0]?.message).toContain('regular non-executable');
  });
  it('rejects incomplete or unrelated source review evidence', () => {
    expect(integrate({ sourceOutcome: 'incomplete' }).verify()[0]?.message).toContain('incomplete');
  });
  it('rejects a copied review based on the wrong trunk parent', () => {
    expect(integrate({ sourceBase: 'a'.repeat(40) }).verify()[0]?.message).toContain('trunk parent');
  });
  it('requires evidence for every incoming commit', () => {
    const { r, verify } = integrate();
    r.documentationIntegrations![0]!.sources[0]!.commit = base;
    expect(verify()[0]?.message).toContain('every incoming');
  });
  it('rejects conflict resolution even when only Markdown conflicts', () => {
    expect(integrate({ conflict: true }).verify()).toHaveLength(1);
  });
  it('rejects extra edits hidden in the integration commit', () => {
    const { r, verify } = integrate();
    writeFileSync(join(root, 'README.md'), 'An additional unreviewed edit.');
    git(root, ['add', 'README.md']); git(root, ['commit', '--amend', '--no-edit']);
    r.documentationIntegrations![0]!.commit = git(root, ['rev-parse', 'HEAD']);
    expect(verify()[0]?.message).toContain('merge tree');
  });
  it('rejects source changes after integration', () => {
    const { verify } = integrate();
    writeFileSync(join(root, 'code.ts'), 'unreviewed code'); commit();
    expect(verify()[0]?.message).toContain('invalidate');
  });
  it('does not clear unresolved findings in the original review', () => {
    const { r, verify } = integrate(); r.findings[0]!.disposition = 'open';
    expect(verify()[0]?.message).toContain('unresolved');
  });
});
