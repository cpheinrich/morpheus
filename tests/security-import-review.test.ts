import { describe, expect, it } from "vitest";
// @ts-expect-error operational workflow script is intentionally JavaScript
import { candidateReceipt, parseReviewDecision, requireReviewedCheckout, reviewDecisionFromSession, reviewMarker, reviewPrerequisitesReady, validTestMerge } from "../scripts/security-import-review.mjs";

const head = "a".repeat(40);
const base = "b".repeat(40);
const mergeSha = "c".repeat(40);
const pr = {
  user: { login: "morpheus-security[bot]" },
  base: { repo: { full_name: "cpheinrich/morpheus" }, sha: base },
  head: { repo: { full_name: "cpheinrich/morpheus" }, ref: "morpheus-security/npm-gray-matter", sha: head },
  merge_commit_sha: mergeSha,
  draft: false,
};
const receipt = { version: 2, mode: "import-only-compatibility", repository: "cpheinrich/morpheus",
  headSha: head, advisory: "GHSA-example", dependency: "gray-matter", replacement: "@11ty/gray-matter",
  replacementVersion: "3.0.0",
  sourcePath: "pnpm-lock.yaml", importFiles: ["src/review/local.ts"], importCount: 1,
  generatedFiles: ["dist/review/local.js"] };
const check = { name: "Morpheus Security / candidate", head_sha: head, app: { slug: "morpheus-security" },
  status: "completed", conclusion: "success", output: { summary: JSON.stringify(receipt) } };
const files = ["package.json", "pnpm-lock.yaml", "src/review/local.ts", "dist/review/local.js"]
  .map((filename) => ({ filename, status: "modified" }));

describe("review-only Security candidate admission", () => {
  it("waits for the current required CI before spending a model review", () => {
    const required = ["node / check", "pm / pm", "pr / conventions"];
    const passed = required.slice(0, 2).map((name, id) => ({ id: id + 1, name,
      head_sha: mergeSha, app: { slug: "github-actions" }, status: "completed", conclusion: "success" }));
    const merge = { sha: mergeSha, parents: [{ sha: base }, { sha: head }] };
    expect(validTestMerge(pr, merge)).toBe(true);
    expect(validTestMerge(pr, { ...merge, parents: [{ sha: base }, { sha: "d".repeat(40) }] })).toBe(false);
    expect(validTestMerge(pr, { ...merge, parents: [{ sha: "d".repeat(40) }, { sha: head }] })).toBe(false);
    expect(validTestMerge(pr, { ...merge, sha: "d".repeat(40) })).toBe(false);
    expect(validTestMerge(pr, null)).toBe(false);
    expect(reviewPrerequisitesReady(passed, required, mergeSha)).toBe(true);
    expect(reviewPrerequisitesReady([{ ...passed[0], status: "queued" }, passed[1]], required, mergeSha)).toBe(false);
    expect(reviewPrerequisitesReady([...passed, { ...passed[0], id: 3, conclusion: "failure" }], required, mergeSha)).toBe(false);
    expect(reviewPrerequisitesReady([{ ...passed[0], app: { slug: "other" } }, passed[1]], required, mergeSha)).toBe(false);
    expect(reviewPrerequisitesReady([{ ...passed[0], head_sha: head }, passed[1]], required, mergeSha)).toBe(false);
    expect(reviewPrerequisitesReady(passed, ["pr / conventions"], mergeSha)).toBe(false);
    expect(reviewPrerequisitesReady(passed, required, null)).toBe(false);
  });
  it("admits a signed, exact-head, bounded import candidate", () => {
    expect(candidateReceipt(pr, [check], files)).toEqual(receipt);
  });

  it("rejects forged App provenance, changed heads, policy paths, and excessive imports", () => {
    expect(candidateReceipt(pr, [{ ...check, app: { slug: "other" } }], files)).toBeNull();
    expect(candidateReceipt({ ...pr, head: { ...pr.head, sha: "b".repeat(40) } }, [check], files)).toBeNull();
    expect(candidateReceipt(pr, [check], [...files, { filename: ".github/workflows/ci.yml", status: "modified" }]))
      .toBeNull();
    expect(candidateReceipt(pr, [{ ...check, output: { summary: JSON.stringify({ ...receipt, importCount: 21 }) } }], files))
      .toBeNull();
    expect(candidateReceipt(pr, [{ ...check, output: { summary: JSON.stringify({ ...receipt, replacementVersion: "latest" }) } }], files))
      .toBeNull();
    expect(candidateReceipt(pr, [check], files.map((file) => file.filename === "src/review/local.ts"
      ? { ...file, status: "added" } : file))).toBeNull();
    for (const path of ["src/trading/foo.ts", "src/auth.ts", "src/authorization.ts", "src/credentials.ts",
      "src/trades.ts", "src/orders.ts", "src/portfolio.ts", "src/market-data.ts", "tests/trade.test.ts"]) {
      const unsafe = { ...receipt, importFiles: [path] };
      expect(candidateReceipt(pr, [{ ...check, output: { summary: JSON.stringify(unsafe) } }],
        files.map((file) => file.filename === "src/review/local.ts" ? { ...file, filename: path } : file))).toBeNull();
    }
  });

  it("accepts only a complete, exact-head review decision and marker", () => {
    expect(() => requireReviewedCheckout(head, head)).not.toThrow();
    expect(() => requireReviewedCheckout(head, "b".repeat(40))).toThrow("not the attested live PR head");
    const decision = { version: 1, repository: "cpheinrich/morpheus", pr: 42, headSha: head,
      verdict: "clear", summary: "Inspected the replacement package, source imports, generated output, advisory and passing exact-head checks.", findings: [] };
    expect(parseReviewDecision(decision, "cpheinrich/morpheus", 42, head)).toEqual(decision);
    expect(reviewDecisionFromSession({ is_error: false, result: JSON.stringify(decision) })).toEqual(decision);
    expect(reviewDecisionFromSession({ is_error: true, result: JSON.stringify(decision) })).toBeNull();
    expect(reviewDecisionFromSession({ is_error: false, result: "not JSON" })).toBeNull();
    expect(parseReviewDecision({ ...decision, headSha: "b".repeat(40) }, "cpheinrich/morpheus", 42, head)).toBeNull();
    expect(parseReviewDecision({ ...decision, findings: ["Suspicious behavior"] }, "cpheinrich/morpheus", 42, head)).toBeNull();
    const marker = `<!-- morpheus-security-review ${JSON.stringify({ version: 1, repository: "cpheinrich/morpheus", pr: 42, headSha: head, verdict: "clear" })} -->`;
    expect(reviewMarker(marker)).toEqual(expect.objectContaining({ headSha: head, verdict: "clear" }));
    expect(reviewMarker(marker.replace('"clear"', '"approve-anything"'))).toBeNull();
    const hold = `<!-- morpheus-security-review ${JSON.stringify({ version: 1, repository: "cpheinrich/morpheus", pr: 42, headSha: head, verdict: "hold", attempt: 2 })} -->`;
    expect(reviewMarker(hold)).toEqual(expect.objectContaining({ verdict: "hold", attempt: 2 }));
    expect(reviewMarker(hold.replace('"attempt":2', '"attempt":3'))).toBeNull();
  });
});
