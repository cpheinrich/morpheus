import { describe, expect, it } from "vitest";
// @ts-expect-error operational workflow script is intentionally JavaScript
import { candidateReceipt, parseReviewDecision, reviewMarker } from "../scripts/security-import-review.mjs";

const head = "a".repeat(40);
const pr = {
  user: { login: "morpheus-security[bot]" },
  base: { repo: { full_name: "cpheinrich/morpheus" } },
  head: { repo: { full_name: "cpheinrich/morpheus" }, ref: "morpheus-security/npm-gray-matter", sha: head },
  draft: false,
};
const receipt = { version: 2, mode: "import-only-compatibility", repository: "cpheinrich/morpheus",
  headSha: head, advisory: "GHSA-example", dependency: "gray-matter", replacement: "@11ty/gray-matter",
  sourcePath: "pnpm-lock.yaml", importFiles: ["src/review/local.ts"], importCount: 1,
  generatedFiles: ["dist/review/local.js"] };
const check = { name: "Morpheus Security / candidate", head_sha: head, app: { slug: "morpheus-security" },
  status: "completed", conclusion: "success", output: { summary: JSON.stringify(receipt) } };
const files = ["package.json", "pnpm-lock.yaml", "src/review/local.ts", "dist/review/local.js"]
  .map((filename) => ({ filename, status: "modified" }));

describe("review-only Security candidate admission", () => {
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
    expect(candidateReceipt(pr, [check], files.map((file) => file.filename === "src/review/local.ts"
      ? { ...file, status: "added" } : file))).toBeNull();
  });

  it("accepts only a complete, exact-head review decision and marker", () => {
    const decision = { version: 1, repository: "cpheinrich/morpheus", pr: 42, headSha: head,
      verdict: "clear", summary: "Inspected the replacement package, source imports, generated output, advisory and passing exact-head checks.", findings: [] };
    expect(parseReviewDecision(decision, "cpheinrich/morpheus", 42, head)).toEqual(decision);
    expect(parseReviewDecision({ ...decision, headSha: "b".repeat(40) }, "cpheinrich/morpheus", 42, head)).toBeNull();
    expect(parseReviewDecision({ ...decision, findings: ["Suspicious behavior"] }, "cpheinrich/morpheus", 42, head)).toBeNull();
    const marker = `<!-- morpheus-security-review ${JSON.stringify({ version: 1, repository: "cpheinrich/morpheus", pr: 42, headSha: head, verdict: "clear" })} -->`;
    expect(reviewMarker(marker)).toEqual(expect.objectContaining({ headSha: head, verdict: "clear" }));
    expect(reviewMarker(marker.replace('"clear"', '"approve-anything"'))).toBeNull();
  });
});
