import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  checkPr,
  formatFindings,
  hasSection,
  roadmapIdFromBranch,
  waiverReason,
  type PrContext,
} from "../src/check/pr.js";
import { hasNoSubstantiveChange, isRecordsOnly } from "../src/paths.js";

let product: string;

const RM = (id: string, status: string) => `id: ${id}
title: An item that exists
status: ${status}
priority: P1
owner: agent
prs: []
created: 2026-07-01
updated: 2026-07-28`;

async function seedRoadmap(id: string, status: string) {
  const dir = join(product, "roadmap");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}.md`), `---\n${RM(id, status)}\n---\n\nBody.\n`);
}

/** A PR that satisfies every rule, so each test can break exactly one thing. */
function goodPr(overrides: Partial<PrContext> = {}): PrContext {
  return {
    body: "## Test plan\n\nRan the suite.\n\n## Open questions\n\nNone.\n",
    branch: "ev-014-something",
    changedFiles: ["src/pm/parse.ts", "tests/pm.test.ts"],
    productDir: product,
    ...overrides,
  };
}

beforeEach(async () => {
  product = await mkdtemp(join(tmpdir(), "morpheus-check-"));
  await seedRoadmap("EV-014", "review");
});

describe("roadmapIdFromBranch", () => {
  it("extracts an id from a conventional branch name", () => {
    expect(roadmapIdFromBranch("ev-014-calorie-pipeline")).toBe("EV-014");
    expect(roadmapIdFromBranch("EV-002-workflows")).toBe("EV-002");
    expect(roadmapIdFromBranch("ev-014")).toBe("EV-014");
  });

  it("extracts a timestamp id (MO-057)", () => {
    // The dated form must win over the legacy one. Matching `\\d{3,}` against
    // `mo-2026-08-01-...` yields "MO-2026" — a plausible id for an item that
    // cannot exist — and the check then reports a missing roadmap item. That is
    // exactly what happened on the first PR created under the new scheme.
    expect(roadmapIdFromBranch("mo-26-08-01-15.26.34-blocked-is-an-outcome")).toBe(
      "MO-26-08-01-15.26.34",
    );
    expect(roadmapIdFromBranch("mo-26-08-01-15.26.34")).toBe("MO-26-08-01-15.26.34");
  });

  it("extracts a migrated id", () => {
    expect(roadmapIdFromBranch("mo-26-07-29-045-simplify-architecture")).toBe(
      "MO-26-07-29-045",
    );
  });

  it("never returns a truncated prefix of a dated branch", () => {
    // The specific regression: any dated branch must not degrade to PREFIX-YYYY.
    for (const b of ["mo-26-08-01-15.26.34-x", "ev-26-12-31-045-y", "cph-26-01-02-00.00.01"]) {
      expect(roadmapIdFromBranch(b)).not.toMatch(/^[A-Z]{2,4}-\d{2,4}$/);
    }
  });

  it("returns null for a branch that does not reference one", () => {
    expect(roadmapIdFromBranch("main")).toBeNull();
    expect(roadmapIdFromBranch("fix-the-thing")).toBeNull();
    expect(roadmapIdFromBranch("ev-14-too-short")).toBeNull();
    expect(roadmapIdFromBranch("inbox-2026-08-01")).toBeNull();
  });
});

describe("hasSection", () => {
  it("finds a heading with content under it", () => {
    expect(hasSection("## Test plan\n\nI ran it.\n", "Test plan")).toBe(true);
  });

  it("rejects a heading with nothing under it", () => {
    expect(hasSection("## Test plan\n\n## Next\n\nstuff", "Test plan")).toBe(false);
  });

  it("is case insensitive and works at any heading level", () => {
    expect(hasSection("#### test PLAN\n\ncontent", "Test plan")).toBe(true);
  });
});

describe("checkPr", () => {
  it("passes a well-formed PR", async () => {
    expect(await checkPr(goodPr())).toHaveLength(0);
  });

  it("blocks a source change with no test change", async () => {
    const findings = await checkPr(goodPr({ changedFiles: ["src/pm/parse.ts"] }));
    const rule = findings.find((f) => f.rule === "tests-with-source");
    expect(rule?.level).toBe("error");
  });

  // Allowed, but no longer silent: a waiver is the author's own say-so about
  // their own PR, which is exactly what a verifier must not swallow.
  it("allows an explicitly justified test waiver, and surfaces it", async () => {
    const findings = await checkPr(
      goodPr({
        changedFiles: ["src/pm/parse.ts"],
        body: "## Test plan\n\nManual.\n\n## Open questions\n\nNone.\n\nskip-tests: pure rename\n",
      }),
    );
    const rule = findings.find((f) => f.rule === "tests-with-source");
    expect(rule?.level).toBe("waived");
    expect(rule?.message).toContain("pure rename");
    expect(findings.filter((f) => f.level === "error")).toHaveLength(0);
  });

  it("does not demand tests for a docs-only change", async () => {
    const findings = await checkPr(goodPr({ changedFiles: ["architecture.md"] }));
    expect(findings.find((f) => f.rule === "tests-with-source")).toBeUndefined();
  });

  it("blocks a missing test plan", async () => {
    const findings = await checkPr(goodPr({ body: "## Open questions\n\nNone.\n" }));
    expect(findings.find((f) => f.rule === "test-plan")?.level).toBe("error");
  });

  it("warns rather than blocks on missing open questions", async () => {
    const findings = await checkPr(goodPr({ body: "## Test plan\n\nRan it.\n" }));
    expect(findings.find((f) => f.rule === "open-questions")?.level).toBe("warning");
  });

  it("blocks when the roadmap item was not moved to review", async () => {
    await seedRoadmap("EV-014", "in-progress");
    const findings = await checkPr(goodPr());
    expect(findings.find((f) => f.rule === "roadmap-status")?.level).toBe("error");
  });

  it("accepts an item already marked shipped", async () => {
    await seedRoadmap("EV-014", "shipped");
    expect(await checkPr(goodPr())).toHaveLength(0);
  });

  it("blocks a branch referencing an item that does not exist", async () => {
    const findings = await checkPr(goodPr({ branch: "ev-999-ghost" }));
    expect(findings.find((f) => f.rule === "roadmap-item-exists")?.level).toBe("error");
  });

  it("warns on a branch with no roadmap reference", async () => {
    const findings = await checkPr(goodPr({ branch: "hotfix" }));
    expect(findings.find((f) => f.rule === "branch-name")?.level).toBe("warning");
  });

  // Both of these fire after the work is done, when renaming the branch is
  // expensive. Reporting the violation without the recovery is what let the
  // same mistake happen three times.
  it("names the recovery command when the branch stakes no id", async () => {
    const findings = await checkPr(goodPr({ branch: "hotfix" }));
    expect(findings.find((f) => f.rule === "branch-name")?.message).toContain("pm claim");
  });

  it("names the recovery command when the item does not exist", async () => {
    const findings = await checkPr(goodPr({ branch: "ev-999-ghost" }));
    const message = findings.find((f) => f.rule === "roadmap-item-exists")?.message ?? "";
    expect(message).toContain("pm new roadmap");
    expect(message).toContain("pm claim");
  });
});

describe("isRecordsOnly", () => {
  it("recognises an inbox cycle", () => {
    expect(
      isRecordsOnly(["hq/inbox/cpheinrich.md", ".agent/inbox-archive/2026-07-29-1330-x.md"]),
    ).toBe(true);
  });

  it("is false when anything outside the records changed", () => {
    expect(isRecordsOnly(["hq/inbox/cpheinrich.md", "src/pm/parse.ts"])).toBe(false);
  });

  // The regression that matters. `every` is vacuously true on an empty array,
  // so a failed `git diff` would have exempted a PR from every roadmap rule at
  // once — a check reporting an empty thing as correct.
  it("is false for no changed files at all, which is a failure to determine", () => {
    expect(isRecordsOnly([])).toBe(false);
  });
});

describe("a PR that only moves records", () => {
  const cycle = () =>
    goodPr({
      branch: "inbox-2026-07-29",
      changedFiles: ["hq/inbox/cpheinrich.md", ".agent/inbox-archive/2026-07-29-1330-x.md"],
    });

  it("needs no roadmap item, so a branch staking none is fine", async () => {
    const findings = await checkPr(cycle());
    expect(findings.find((f) => f.rule === "branch-name")).toBeUndefined();
    expect(findings).toHaveLength(0);
  });

  it("blocks when it borrows a claimed branch, which is how MO-010 shipped unstarted", async () => {
    await seedRoadmap("EV-014", "in-progress");
    const findings = await checkPr({ ...cycle(), branch: "ev-014-something" });

    const f = findings.find((x) => x.rule === "no-work-for-claimed-item");
    expect(f?.level).toBe("error");
    expect(f?.message).toContain("EV-014");
  });

  it("still requires a test plan, since a human reads these too", async () => {
    const findings = await checkPr({ ...cycle(), body: "## Open questions\n\nNone.\n" });
    expect(findings.find((f) => f.rule === "test-plan")?.level).toBe("error");
  });
});

/**
 * The real file lists from the three PRs the audit turned up. `isRecordsOnly`
 * misses all of them, because a borrowed branch always carries board files —
 * which is why `hasNoSubstantiveChange` exists as a second question.
 */
describe("a claimed branch that did none of its item's work", () => {
  const PR31 = [
    ".agent/inbox-archive/2026-07-29-1330-cpheinrich.md",
    "hq/inbox/cpheinrich.md",
    "hq/product/roadmap/MO-010.md",
    "hq/product/roadmap/MO-037.md",
    "hq/product/roadmap/README.md",
  ];
  const PR2 = [".agent/learned.md", "hq/product/roadmap/MO-015.md"];

  it("sees what isRecordsOnly cannot, on the PR that shipped MO-010", () => {
    expect(isRecordsOnly(PR31)).toBe(false);
    expect(hasNoSubstantiveChange(PR31)).toBe(true);
  });

  it("blocks PR #31's shape", async () => {
    await seedRoadmap("EV-014", "in-progress");
    const findings = await checkPr(goodPr({ changedFiles: PR31 }));
    expect(findings.find((f) => f.rule === "no-work-for-claimed-item")?.level).toBe("error");
  });

  it("blocks PR #2's shape, a learned.md entry on a claimed branch", async () => {
    const findings = await checkPr(goodPr({ changedFiles: PR2 }));
    expect(findings.find((f) => f.rule === "no-work-for-claimed-item")?.level).toBe("error");
  });

  it("lets a decision item through when the body says the record is the deliverable", async () => {
    const findings = await checkPr(
      goodPr({
        changedFiles: PR2,
        body: "records-only: the decision is the deliverable\n\n## Test plan\n\nRead it.\n\n## Open questions\n\nNone.\n",
      }),
    );
    const rule = findings.find((f) => f.rule === "no-work-for-claimed-item");
    expect(rule?.level).toBe("waived");
    expect(findings.filter((f) => f.level === "error")).toHaveLength(0);
  });

  it("does not fire on a branch that stakes no id", async () => {
    const findings = await checkPr(goodPr({ branch: "inbox-2026-07-29", changedFiles: PR31 }));
    expect(findings.find((f) => f.rule === "no-work-for-claimed-item")).toBeUndefined();
  });

  it("does not fire on an ordinary PR that changes source", async () => {
    const findings = await checkPr(goodPr());
    expect(findings.find((f) => f.rule === "no-work-for-claimed-item")).toBeUndefined();
  });

  it("is false for no changed files, the same vacuous-every trap", () => {
    expect(hasNoSubstantiveChange([])).toBe(false);
  });

  it("ignores generated README files when looking for doc changes", async () => {
    const findings = await checkPr(
      goodPr({ changedFiles: ["src/pm/index.ts", "tests/pm.test.ts", "hq/product/roadmap/README.md"] }),
    );
    expect(findings.find((f) => f.rule === "docs-with-api")?.level).toBe("warning");
  });
});

/**
 * A verifier answers *is this correct?* without trusting the doer's own say-so
 * (architecture §9). `skip-tests:` and `records-only:` are written by the author
 * of the PR being checked, and they used to pass in silence — so a PR that
 * excused itself from its tests printed exactly what a PR with tests printed.
 * They stay allowed; they stop being invisible.
 */
describe("waivers are surfaced, not swallowed", () => {
  const withBody = (body: string): PrContext =>
    goodPr({ changedFiles: ["src/pm/parse.ts"], body: `${body}\n\n## Test plan\n\nx.\n` });

  it("does not report a clean run when something was waived", () => {
    const out = formatFindings([
      { level: "waived", rule: "tests-with-source", message: 'tests waived — "pure rename"' },
    ]);
    expect(out).toContain("1 waived");
    expect(out).toContain("pure rename");
  });

  it("still reports a genuinely clean run plainly", () => {
    expect(formatFindings([])).toBe("✓ PR conventions satisfied.");
  });

  it("marks a waiver distinctly from an error and a warning", () => {
    const out = formatFindings([
      { level: "error", rule: "a", message: "m" },
      { level: "warning", rule: "b", message: "m" },
      { level: "waived", rule: "c", message: "m" },
    ]);
    expect(out).toContain("✗ [a]");
    expect(out).toContain("! [b]");
    expect(out).toContain("~ [c]");
  });

  it("lists both waivers when a PR uses both", async () => {
    const findings = await checkPr(
      goodPr({
        changedFiles: ["hq/inbox/cpheinrich.md", "hq/product/roadmap/EV-014.md"],
        body:
          "skip-tests: nothing executable changed\n" +
          "records-only: the decision is the deliverable\n\n" +
          "## Test plan\n\nRead it.\n",
      }),
    );
    expect(findings.filter((f) => f.level === "waived")).toHaveLength(1);
    expect(findings.filter((f) => f.level === "error")).toHaveLength(0);
  });

  // The old pattern was `\S+`, which accepted this. An opt-out with extra steps
  // is not a reason.
  it("refuses `skip-tests: yes` as a non-reason", async () => {
    const findings = await checkPr(withBody("skip-tests: yes"));
    const rule = findings.find((f) => f.rule === "tests-with-source");
    expect(rule?.level).toBe("error");
    expect(rule?.message).toContain("is not a reason");
  });

  it("refuses an empty reason", async () => {
    const findings = await checkPr(withBody("skip-tests:"));
    expect(findings.find((f) => f.rule === "tests-with-source")?.level).toBe("error");
  });

  it("refuses a whitespace-only reason", async () => {
    const findings = await checkPr(withBody("skip-tests:    "));
    expect(findings.find((f) => f.rule === "tests-with-source")?.level).toBe("error");
  });

  it("accepts a reason that says something", async () => {
    const findings = await checkPr(withBody("skip-tests: generated output, asserted downstream"));
    expect(findings.find((f) => f.rule === "tests-with-source")?.level).toBe("waived");
  });

  it("does not raise a waiver when the rule was satisfied outright", async () => {
    const findings = await checkPr(goodPr({ body: "skip-tests: not needed here\n\n## Test plan\n\nx.\n" }));
    expect(findings.find((f) => f.rule === "tests-with-source")).toBeUndefined();
  });
});

describe("waiverReason", () => {
  it("returns null when the key is absent", () => {
    expect(waiverReason("## Test plan\n\nx.", "skip-tests")).toBeNull();
  });

  it("returns an empty string for a present key with no reason", () => {
    expect(waiverReason("skip-tests:", "skip-tests")).toBe("");
  });

  it("reads the reason, trimmed", () => {
    expect(waiverReason("skip-tests:   pure rename  ", "skip-tests")).toBe("pure rename");
  });

  it("is case-insensitive on the key, as the original was", () => {
    expect(waiverReason("Skip-Tests: pure rename", "skip-tests")).toBe("pure rename");
  });

  it("does not read a key that is part of a longer word", () => {
    expect(waiverReason("noskip-tests: x", "skip-tests")).toBeNull();
  });
});
