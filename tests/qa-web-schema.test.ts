import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WEB_QA_LIMITS, parseWebQaBatch, parseWebQaReceipt, webQaPathIssue } from "../src/qa/web/schema.js";
import { WEB_OVERLAY_COLUMN_PX, WEB_OVERLAY_JS } from "../src/qa/web/overlay-client.js";
import { QA_COLUMN_PX, QA_PIN_COLOR } from "../src/qa/web/visuals.js";

const ID = "6f1c1b2e-6a3b-4c1d-9e2f-0a1b2c3d4e5f";
const comment = { text: "Button overlaps the footer", path: "/settings/billing", scope: "element", x: 0.25, y: 0.75, viewportWidth: 1280, viewportHeight: 800 };
const batch = (over: Record<string, unknown> = {}, c: Record<string, unknown> = {}) =>
  ({ batchId: ID, comments: [{ ...comment, ...c }], buildAndDeploy: false, makeFeatureFlag: false, ...over });

describe("parseWebQaBatch", () => {
  it("accepts the exact payload and returns it unchanged", () => {
    const value = batch({}, { anchor: "billing.plan-card" });
    const parsed = parseWebQaBatch(value);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(value);
  });

  it("refuses any field outside the contract, so page text or markup cannot ride along", () => {
    expect(parseWebQaBatch(batch({}, { html: "<b>x</b>" })).success).toBe(false);
    expect(parseWebQaBatch(batch({}, { dom: { text: "secret" } })).success).toBe(false);
    expect(parseWebQaBatch(batch({ screenshot: "data:image/png;base64," })).success).toBe(false);
  });

  it("bounds the comment count at exactly 20", () => {
    const many = (n: number) => batch({ comments: Array.from({ length: n }, () => comment) });
    expect(parseWebQaBatch(many(20)).success).toBe(true);
    expect(parseWebQaBatch(many(21)).success).toBe(false);
    expect(parseWebQaBatch(many(0)).success).toBe(false);
  });

  it("bounds text at 2000 characters after trimming and refuses blank text", () => {
    expect(parseWebQaBatch(batch({}, { text: "a".repeat(2000) })).success).toBe(true);
    expect(parseWebQaBatch(batch({}, { text: "a".repeat(2001) })).success).toBe(false);
    expect(parseWebQaBatch(batch({}, { text: "   " })).success).toBe(false);
  });

  it("accepts optional batch notes up to 2000 characters after trimming", () => {
    const notes = "a".repeat(2000);
    expect(parseWebQaBatch(batch({ notes: " " + notes })).data?.notes).toBe(notes);
    expect(parseWebQaBatch(batch({ notes: notes + "b" })).success).toBe(false);
    expect(parseWebQaBatch(batch({ notes: { text: "not a string" } })).success).toBe(false);
    expect(parseWebQaBatch(batch()).data).not.toHaveProperty("notes");
  });

  it("requires a UUID batch id", () => {
    expect(parseWebQaBatch(batch({ batchId: "20261115T000000Z-ab12" })).success).toBe(false);
  });

  it("keeps coordinates normalized, inclusive at 0 and 1", () => {
    expect(parseWebQaBatch(batch({}, { x: 0, y: 1 })).success).toBe(true);
    expect(parseWebQaBatch(batch({}, { x: -0.0001 })).success).toBe(false);
    expect(parseWebQaBatch(batch({}, { y: 1.0001 })).success).toBe(false);
    expect(parseWebQaBatch(batch({}, { x: Number.NaN })).success).toBe(false);
  });

  it("bounds the viewport to whole pixels from 1 to the limit", () => {
    expect(parseWebQaBatch(batch({}, { viewportWidth: 1, viewportHeight: WEB_QA_LIMITS.viewportMax })).success).toBe(true);
    expect(parseWebQaBatch(batch({}, { viewportWidth: 0 })).success).toBe(false);
    expect(parseWebQaBatch(batch({}, { viewportHeight: WEB_QA_LIMITS.viewportMax + 1 })).success).toBe(false);
    expect(parseWebQaBatch(batch({}, { viewportWidth: 1280.5 })).success).toBe(false);
  });

  it("allows a feature flag only with build and deploy", () => {
    expect(parseWebQaBatch(batch({ buildAndDeploy: true, makeFeatureFlag: true })).success).toBe(true);
    const refused = parseWebQaBatch(batch({ buildAndDeploy: false, makeFeatureFlag: true }));
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.path).toEqual(["makeFeatureFlag"]);
  });

  it("accepts only explicit anchor tokens", () => {
    expect(parseWebQaBatch(batch({}, { anchor: "a".repeat(64) })).success).toBe(true);
    expect(parseWebQaBatch(batch({}, { anchor: "a".repeat(65) })).success).toBe(false);
    expect(parseWebQaBatch(batch({}, { anchor: "main > div:nth-of-type(2)" })).success).toBe(false);
    expect(parseWebQaBatch(batch({}, { anchor: "x\"]" })).success).toBe(false);
  });

  it("rejects scopes outside element, view and page", () => {
    expect(parseWebQaBatch(batch({}, { scope: "view" })).success).toBe(true);
    expect(parseWebQaBatch(batch({}, { scope: "site" })).success).toBe(false);
  });
});

describe("webQaPathIssue", () => {
  it.each([
    ["/", null],
    ["/caf%C3%A9/items", null],
    ["relative", "must start with /"],
    ["//evil.example/x", "must not start with //"],
    ["/a?token=1", "must not include a query or fragment"],
    ["/a#section", "must not include a query or fragment"],
    ["/a\\b", "must not include a backslash"],
    ["/a\u001b[31m", "must not include control characters"],
    ["/a\u007f", "must not include control characters"],
    ["/a%1B", "must not escape control characters or backslashes"],
    ["/a%5Cb", "must not escape control characters or backslashes"],
    ["/a%zz", "has a malformed percent escape"],
    ["/a/../b", "must not include dot segments"],
  ])("%j → %j", (path, issue) => {
    expect(webQaPathIssue(path)).toBe(issue);
  });

  it("bounds the length at the limit", () => {
    expect(webQaPathIssue("/" + "a".repeat(WEB_QA_LIMITS.pathChars - 1))).toBeNull();
    expect(webQaPathIssue("/" + "a".repeat(WEB_QA_LIMITS.pathChars))).toMatch(/at most/);
  });

  it("is what the batch schema enforces", () => {
    expect(parseWebQaBatch(batch({}, { path: "/a?x=1" })).success).toBe(false);
  });
});

describe("parseWebQaReceipt", () => {
  it("accepts the three factory states and nothing else", () => {
    for (const factory of ["not-requested", "queued", "retry"]) expect(parseWebQaReceipt({ batchId: ID, factory }).success).toBe(true);
    expect(parseWebQaReceipt({ batchId: ID, factory: "done" }).success).toBe(false);
    expect(parseWebQaReceipt({ batchId: ID, factory: "queued", extra: 1 }).success).toBe(false);
  });
});

describe("shared visuals", () => {
  it("keep the localhost overlay and the production panel on the same pin colour and column", () => {
    expect(WEB_OVERLAY_JS).toContain(`background:${QA_PIN_COLOR}`);
    expect(WEB_OVERLAY_JS).toContain(`var COLUMN = ${QA_COLUMN_PX};`);
    expect(WEB_OVERLAY_COLUMN_PX).toBe(QA_COLUMN_PX);
  });
});

describe("the public production package", () => {
  it("ships no addresses, project names or QA data in its sources", () => {
    for (const file of ["schema.ts", "drafts.ts", "mount.ts", "visuals.ts"]) {
      const source = readFileSync(new URL(`../src/qa/web/${file}`, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/https?:\/\//);
      expect(source, file).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
      expect(source, file).not.toMatch(/\b(evo|darwin|lakina|kairos)\b/i);
      expect(source, file).not.toMatch(/\beval\(|new Function|innerHTML|<iframe/);
    }
  });
});

it("refuses percent-escaped dot segments before a browser can resolve another route", () => {
  expect(webQaPathIssue("/account/%2e%2e/billing")).toMatch(/dot segments/);
  expect(webQaPathIssue("/account/.%2e/billing")).toMatch(/dot segments/);
});
