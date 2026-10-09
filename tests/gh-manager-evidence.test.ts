import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Decision } from "../src/gh-manager/decision.js";
import { applyEvidence, type EvidenceItem, evidencePrefix, evidenceUrl, hasPlaceholder, MAX_EVIDENCE_FILES, prepareEvidence, substituteEvidence } from "../src/gh-manager/evidence.js";
import { GhManagerPolicy } from "../src/gh-manager/policy.js";
import { sessionPrompt } from "../src/gh-manager/prompt.js";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("rest of a png")]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("rest of a jpeg")]);
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "evidence-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("evidence URLs", () => {
  it("links through the tag of the commit the apply step wrote, named by content", () => {
    expect(evidencePrefix("darwin-health/evo")).toBe("https://github.com/darwin-health/evo/raw/gh-manager-evidence/");
    expect(evidenceUrl("darwin-health/evo", "c".repeat(40), 378, { sha256: "ab".repeat(32), ext: "png" })).toBe(`https://github.com/darwin-health/evo/raw/gh-manager-evidence/${"c".repeat(40)}/pr-378/${"ab".repeat(32)}.png`);
  });
});

describe("preparing what a session captured", () => {
  it("accepts PNG and JPEG by their content, and hashes them", () => {
    writeFileSync(join(dir, "home.png"), PNG);
    writeFileSync(join(dir, "home-phone.jpg"), JPG);
    const result = prepareEvidence(dir, [{ file: "home.png", caption: "Home on desktop" }, { file: "home-phone.jpg", caption: "Home on a phone" }]);
    expect("items" in result && result.items.map(i => [i.file, i.ext, i.sha256.length])).toEqual([["home.png", "png", 64], ["home-phone.jpg", "jpg", 64]]);
  });
  it("refuses anything that is not a plain, captured, real image", () => {
    writeFileSync(join(dir, "fake.png"), Buffer.from("<html>not an image</html>"));
    writeFileSync(join(dir, "empty.png"), Buffer.alloc(0));
    writeFileSync(join(dir, "ok.png"), PNG);
    const problem = (file: string) => { const r = prepareEvidence(dir, [{ file, caption: "caption" }]); return "problem" in r ? r.problem : ""; };
    expect(problem("fake.png")).toContain("not a PNG or JPEG");
    expect(problem("empty.png")).toContain("0 bytes");
    expect(problem("missing.png")).toContain("not captured");
    for (const bad of ["../ok.png", "sub/ok.png", "ok.svg", ".hidden.png", "a b.png"]) expect(problem(bad), bad).toContain("not a plain");
    const twice = prepareEvidence(dir, [{ file: "ok.png", caption: "one" }, { file: "ok.png", caption: "two" }]);
    expect("problem" in twice && twice.problem).toContain("listed twice");
    const many = Array.from({ length: MAX_EVIDENCE_FILES + 1 }, (_, i) => ({ file: `s${i}.png`, caption: "caption" }));
    const tooMany = prepareEvidence(dir, many);
    expect("problem" in tooMany && tooMany.problem).toContain("more than the 10 allowed");
  });
});

describe("placing the published images in the body", () => {
  const published = [{ file: "home.png", caption: "Home [desktop]", url: "https://example.test/a.png" }];
  it("swaps each placeholder for the image and keeps the caption from breaking out", () => {
    const result = substituteEvidence("## Visual evidence\n\n{{gh-manager-evidence:home.png}}\n", published);
    expect(result).toEqual({ body: "## Visual evidence\n\n![Home  desktop](https://example.test/a.png)\n" });
  });
  it("keeps a backslash or backtick in a caption from breaking the image", () => {
    const result = substituteEvidence("{{gh-manager-evidence:home.png}}", [{ file: "home.png", caption: "Settings `page` \\", url: "https://example.test/a.png" }]);
    expect(result).toEqual({ body: "![Settings  page](https://example.test/a.png)" });
  });
  it("refuses a placeholder for an image that was not captured, and an image never placed", () => {
    expect(substituteEvidence("{{gh-manager-evidence:other.png}} {{gh-manager-evidence:home.png}}", published)).toEqual({ problem: 'the body refers to "other.png", which was not captured' });
    expect(substituteEvidence("no placeholder", published)).toEqual({ problem: '"home.png" was captured but the body never shows it' });
  });
  it("detects a placeholder left with nothing listed", () => {
    expect(hasPlaceholder("x {{gh-manager-evidence:a.png}} y")).toBe(true);
    expect(hasPlaceholder("x {{other:a.png}} y")).toBe(false);
  });
});

describe("the decision and the brief", () => {
  it("accepts an evidence list and defaults it to empty", () => {
    const base = { version: 1, pr: 7, head: "a".repeat(40), action: "merge", summary: "Captured the page.", reasoning: "Evidence was the only gap." };
    expect(Decision.parse(base).evidence).toEqual([]);
    expect(Decision.parse({ ...base, evidence: [{ file: "a.png", caption: "Home" }] }).evidence).toEqual([{ file: "a.png", caption: "Home" }]);
    expect(() => Decision.parse({ ...base, evidence: [{ file: "a.png", caption: "Home", url: "x" }] })).toThrow();
  });
  it("tells the session how to capture, where to save, and what this repository must accept", () => {
    const text = sessionPrompt({ repo: "darwin-health/evo", number: 378, branch: "ev-1", base: "main", sweepDetail: "d", attempts: 0, runRef: "r", decisionPath: "/t/decision-378.json", evidenceDir: "/t/evidence-378", cli: "morpheus", policy: GhManagerPolicy.parse({ version: 1 }) });
    expect(text).toContain("https://github.com/darwin-health/evo/raw/gh-manager-evidence/");
    expect(text).toContain(`playwright screenshot --full-page --viewport-size=1280,900 '<url>' "/t/evidence-378/<name>.png"`);
    expect(text).toContain("{{gh-manager-evidence:<name>.png}}");
    expect(text).toContain("You cannot capture iOS or simulator screens");
    // The preview URL comes from deployment records bound to the commit, never a comment.
    expect(text).toContain(`gh api "repos/darwin-health/evo/deployments?sha=$(git rev-parse HEAD)"`);
    expect(text).toContain('select(.creator.login == "vercel[bot]")');
    expect(text).toContain("never from a comment");
  });
});

describe("the apply step's handling of screenshots", () => {
  const HEAD = "a".repeat(40);
  const body = "## Visual evidence\n\n{{gh-manager-evidence:home.png}}\n\nmanager-review-record: .agent/worklog/x.md";
  const merge = { action: "merge", head: HEAD, body, evidence: [{ file: "home.png", caption: "Home" }] };
  const link = (items: EvidenceItem[]) => items.map(i => ({ file: i.file, caption: i.caption, url: `https://example.test/${i.sha256}.png` }));
  let published = 0;
  const opts = (over: Partial<Parameters<typeof applyEvidence>[1]> = {}) => ({ dir, liveHead: HEAD, open: true, dryRun: false, publish: (items: EvidenceItem[]) => { published++; return link(items); }, preview: link, ...over });
  beforeEach(() => { published = 0; writeFileSync(join(dir, "home.png"), PNG); });

  it("publishes and places the images for a merge on the session's head, keeping the record line", () => {
    const out = applyEvidence(merge, opts());
    expect(out.action).toBe("merge");
    expect(out.body).toMatch(/^## Visual evidence\n\n!\[Home\]\(https:\/\/example\.test\/[0-9a-f]{64}\.png\)\n\nmanager-review-record: \.agent\/worklog\/x\.md$/);
    expect(published).toBe(1);
  });
  it("turns the merge into an escalation when publishing fails, and never merges", () => {
    const out = applyEvidence(merge, opts({ publish: () => { throw Object.assign(new Error("x"), { stderr: "HTTP 403: Resource not accessible\nmore" }); } }));
    expect(out).toMatchObject({ action: "escalate", needsHuman: "The session captured screenshots as visual evidence, but they could not be published: HTTP 403: Resource not accessible. Attach the evidence by hand." });
  });
  it("refuses before publishing when the body cannot place the images", () => {
    const out = applyEvidence({ ...merge, body: "no placeholder here" }, opts());
    expect(out).toMatchObject({ action: "escalate" });
    expect(published).toBe(0);
    expect(applyEvidence({ ...merge, evidence: [{ file: "missing.png", caption: "Gone" }] }, opts())).toMatchObject({ action: "escalate" });
    expect(applyEvidence({ ...merge, body: undefined }, opts())).toMatchObject({ action: "escalate" });
    expect(published).toBe(0);
  });
  it("never publishes in a dry run, but still substitutes the would-be links", () => {
    const out = applyEvidence(merge, opts({ dryRun: true }));
    expect(published).toBe(0);
    expect(out.action).toBe("merge");
    expect(out.body).toContain("![Home](https://example.test/");
  });
  it("leaves every other action, a moved head and a closed pull request alone", () => {
    for (const action of ["escalate", "wait", "incomplete", "close"]) {
      const decision = { ...merge, action, needsHuman: "the session's own question", evidence: [{ file: "missing.png", caption: "Gone" }] };
      expect(applyEvidence(decision, opts()), action).toBe(decision);
    }
    expect(applyEvidence(merge, opts({ liveHead: "b".repeat(40) }))).toBe(merge);
    expect(applyEvidence(merge, opts({ open: false }))).toBe(merge);
    expect(published).toBe(0);
  });
  it("escalates a merge that left a placeholder but listed no screenshots", () => {
    expect(applyEvidence({ ...merge, evidence: [] }, opts())).toMatchObject({ action: "escalate" });
    const plain = { ...merge, body: "no evidence needed", evidence: [] };
    expect(applyEvidence(plain, opts())).toBe(plain);
  });
});
