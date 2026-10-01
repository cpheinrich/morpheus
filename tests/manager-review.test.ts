import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { git } from "../src/review/local.js";
import { checkManagerReview, type ManagerReviewRecord, usesManagerReview } from "../src/review/manager.js";

const APP = "morpheus-gh-manager[bot]";
const path = ".agent/worklog/2026-10-01-gh-manager-pr-7.md";
const body = `## Test plan\nran it\n\nmanager-review-record: ${path}`;
let root: string;
let base: string;
let reviewed: string;

function put(file: string, text: string) {
  mkdirSync(join(root, file, ".."), { recursive: true });
  writeFileSync(join(root, file), text);
}
function commit(message = "fixture") {
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", message, "--allow-empty"]);
  return git(root, ["rev-parse", "HEAD"]);
}
function record(over: Partial<ManagerReviewRecord> = {}): ManagerReviewRecord {
  return {
    version: 1, managerSession: "https://github.test/ops/actions/runs/1 (pull request 7)", reviewed, covered: reviewed,
    priorReview: { state: "stalled", note: "Initial review left two findings unanswered." },
    findings: [], outcome: "cleared", summary: "Manager review found nothing further to fix.", ...over,
  };
}
function save(r: ManagerReviewRecord, prose = r.summary) {
  put(path, `${prose}\n\n\`\`\`morpheus-manager-review\n${JSON.stringify(r)}\n\`\`\`\n`);
  return commit("manager review record");
}
function check(head: string, over: Partial<Parameters<typeof checkManagerReview>[0]> = {}) {
  return checkManagerReview({ root, body, labels: ["manager-reviewed"], labelActor: APP, head, base: "main", ...over });
}
const message = (head: string, over: Partial<Parameters<typeof checkManagerReview>[0]> = {}) => check(head, over)[0]?.message ?? "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "manager-review-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  git(root, ["config", "user.name", "Test"]); git(root, ["config", "user.email", "test@example.com"]);
  put("morpheus.json", "{}");
  put("code.ts", "export const answer = 1;");
  base = commit("base");
  git(root, ["checkout", "-q", "-b", "feature"]);
  put("code.ts", "export const answer = 2;");
  reviewed = commit("the change");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("the GitHub Manager's review record", () => {
  it("is selected by its label alone", () => {
    expect(usesManagerReview(["manager-reviewed", "agent-reviewed"])).toBe(true);
    expect(usesManagerReview(["agent-reviewed"])).toBe(false);
  });

  it("clears a clean review, and reports that the exception was used", () => {
    expect(check(save(record()))).toEqual([{
      level: "waived",
      rule: "agent-review",
      message: "cleared by the GitHub Manager (https://github.test/ops/actions/runs/1 (pull request 7)): one review, 0 findings fixed in the same session; prior review was stalled",
    }]);
  });

  it("refuses the label from anyone but the App, including an actor it could not read", () => {
    const head = save(record());
    expect(check(head, { labelActor: "cpheinrich" })).toEqual([{ level: "error", rule: "agent-review", message: expect.stringContaining("it was applied by cpheinrich") }]);
    expect(message(head, { labelActor: undefined })).toContain("an actor that could not be determined");
    // The login without its suffix is a user account anyone could register.
    expect(check(head, { labelActor: "morpheus-gh-manager" })[0]?.level).toBe("error");
  });

  it("needs one visible record line naming a worklog", () => {
    const head = save(record());
    expect(message(head, { body: "## Test plan\nran it" })).toContain("manager-review-record:");
    expect(message(head, { body: `<!-- manager-review-record: ${path} -->` })).toContain("manager-review-record:");
    expect(message(head, { body: `manager-review-record: ${path}\nmanager-review-record: ${path}` })).toContain("one visible");
    expect(message(head, { body: "manager-review-record: ../../etc/passwd" })).toContain("worklog Markdown file");
  });

  it("refuses an escalated record and an unfixed finding", () => {
    expect(message(save(record({ outcome: "escalated" })))).toContain("escalated");
    const finding = { id: "M01", description: "Off-by-one in the pager", paths: ["code.ts"], response: "Left for the author" };
    expect(message(save(record({ findings: [{ ...finding, severity: "substantive", disposition: "noted" }] })))).toContain("M01 is substantive and not fixed");
    expect(message(save(record({ findings: [{ ...finding, severity: "minor", disposition: "noted" }] })))).toContain("M01 is minor and not fixed");
    // Only an incidental finding may be left noted.
    expect(check(save(record({ findings: [{ ...finding, severity: "incidental", disposition: "noted" }] })))[0]?.level).toBe("waived");
  });

  it("requires the summary to be readable outside the JSON", () => {
    expect(message(save(record(), "A different paragraph."))).toContain("visible paragraph");
  });

  it("accepts fix commits inside the paths its findings name, and counts them", () => {
    put("code.ts", "export const answer = 3;");
    const covered = commit("manager fix");
    const r = record({ covered, findings: [{ id: "M01", severity: "substantive", description: "Wrong constant returned", paths: ["code.ts"], disposition: "fixed", response: "Corrected and ran the unit test" }] });
    expect(check(save(r))[0]).toMatchObject({ level: "waived", message: expect.stringContaining("1 finding fixed") });
  });

  it("refuses a fix commit touching a path no fixed finding names", () => {
    put("code.ts", "export const answer = 3;");
    put("other.ts", "export const stray = true;");
    const covered = commit("manager fix plus a stray edit");
    const r = record({ covered, findings: [{ id: "M01", severity: "substantive", description: "Wrong constant returned", paths: ["code.ts"], disposition: "fixed", response: "Corrected and ran the unit test" }] });
    expect(message(save(r))).toContain("touch paths no fixed finding names");
  });

  it("is invalidated by code pushed after the covered commit", () => {
    save(record());
    put("code.ts", "export const answer = 99;");
    expect(message(commit("unreviewed"))).toContain("invalidate the manager review");
  });

  it("survives an exact trunk merge after coverage", () => {
    const head = save(record());
    git(root, ["checkout", "-q", "main"]);
    put("unrelated.ts", "export const trunk = true;");
    commit("trunk moves");
    git(root, ["checkout", "-q", "feature"]);
    git(root, ["merge", "-q", "--no-edit", "main"]);
    expect(head).not.toBe(git(root, ["rev-parse", "HEAD"]));
    expect(check(git(root, ["rev-parse", "HEAD"]))[0]?.level).toBe("waived");
  });

  it("refuses to clear normative policy, wherever the manager's commits were", () => {
    put(".github/workflows/ci.yml", "name: ci");
    reviewed = commit("touch a workflow");
    expect(message(save(record()))).toContain("cannot clear a change to policy");
    expect(message(save(record()))).toContain(".github/workflows/ci.yml");
  });

  it("honours the project's protected paths, and refuses when they cannot be read", () => {
    git(root, ["checkout", "-q", "main"]);
    put(".github/morpheus-gh-manager.json", JSON.stringify({ version: 1, protectedPaths: ["billing"] }));
    commit("policy on trunk");
    git(root, ["checkout", "-q", "feature"]);
    git(root, ["merge", "-q", "--no-edit", "main"]);
    put("billing/plan.ts", "export const price = 5;");
    reviewed = commit("touch billing");
    expect(message(save(record()))).toContain("billing/plan.ts");

    git(root, ["checkout", "-q", "main"]);
    put(".github/morpheus-gh-manager.json", "{ not json");
    commit("broken policy on trunk");
    git(root, ["checkout", "-q", "feature"]);
    git(root, ["merge", "-q", "--no-edit", "main"]);
    expect(message(git(root, ["rev-parse", "HEAD"]))).toContain("protected paths cannot be determined");
  });

  it("refuses a reviewed commit that is trunk history, or out of order", () => {
    expect(message(save(record({ reviewed: base, covered: base })))).toContain("trunk history");
    put("code.ts", "export const answer = 4;");
    const later = commit("later");
    expect(message(save(record({ reviewed: later, covered: reviewed })))).toContain("ancestor chain");
  });

  it("is waived outright when the project opted out of review", () => {
    put("morpheus.json", JSON.stringify({ review: { required: false } }));
    expect(check(commit("opt out"), { labelActor: "anyone" })).toEqual([{ level: "waived", rule: "agent-review", message: "independent review disabled by project review.required=false" }]);
  });
});
