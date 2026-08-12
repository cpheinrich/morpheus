import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { needed } from "../src/cli/review.js";
import {
  assessReviewDelivery,
  NO_PRIOR_COMMENT,
  REVIEW_DELIVERED_SENTINEL,
  REVIEW_ERROR_PREFIX,
  REVIEW_FINISHED_PREFIX,
  REVIEW_PLACEHOLDER,
  REVIEW_PROGRESS_SPINNER_ID,
  UNREADABLE_COMMENT_SNAPSHOT,
} from "../src/review/delivery.js";
import { pathsMentioned } from "../src/review/findings.js";
import { loadReviewContext, PERSONA_PATH, ReviewError } from "../src/review/context.js";
import { acceptancePath, buildReviewPrompt } from "../src/review/prompt.js";

let root: string;
let product: string;

const PERSONA = "# Reviewer\n\nYou are verifier rung 2.";

const ITEM = (extra = "") => `id: MO-051
title: Agent code review
status: review
priority: P1
owner: agent
prs: []
${extra}created: 2026-07-01
updated: 2026-07-28`;

async function seed(frontmatter: string, body = "## Context\n\nWhy this matters.") {
  await mkdir(join(product, "roadmap"), { recursive: true });
  await writeFile(join(product, "roadmap/MO-051.md"), `---\n${frontmatter}\n---\n\n${body}\n`);
}

async function seedPersona() {
  await mkdir(join(root, ".github"), { recursive: true });
  await writeFile(join(root, PERSONA_PATH), PERSONA);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "morpheus-review-"));
  product = join(root, "hq/product");
});

describe("buildReviewPrompt", () => {
  it("leads with the persona", () => {
    expect(buildReviewPrompt({ persona: PERSONA }).startsWith("# Reviewer")).toBe(true);
  });

  it("carries the item's stated intent, which is what the reviewer cannot infer", () => {
    const out = buildReviewPrompt({
      persona: PERSONA,
      id: "MO-051",
      title: "Agent code review",
      intent: "## Context\n\nThe gap between checks passing and a human reading it.",
    });
    expect(out).toContain("MO-051");
    expect(out).toContain("Agent code review");
    expect(out).toContain("The gap between checks passing");
  });

  it("includes acceptance criteria when the item declares them", () => {
    const out = buildReviewPrompt({
      persona: PERSONA,
      id: "MO-051",
      title: "t",
      acceptance: "- The reviewer posts one comment\n- It never blocks the merge",
    });
    expect(out).toContain("## Acceptance criteria");
    expect(out).toContain("never blocks the merge");
  });

  // An empty heading reads as "there are no criteria to meet", which is a much
  // weaker claim than "no criteria were stated" — and a reviewer told the
  // former stops looking.
  it("omits the conformance section entirely rather than rendering it empty", () => {
    const out = buildReviewPrompt({ persona: PERSONA, id: "MO-051", title: "t" });
    expect(out).not.toContain("Acceptance criteria");
  });

  // A dangling reference is a defect, not an absence. Reporting it as "no
  // criteria" is how the `acceptance` field stayed dead for two months.
  it("reports a dangling acceptance path instead of silently skipping it", () => {
    const out = buildReviewPrompt({
      persona: PERSONA,
      id: "MO-051",
      title: "t",
      missingAcceptance: "qa/acceptance/MO-051.md",
    });
    expect(out).toContain("Acceptance criteria — missing");
    expect(out).toContain("qa/acceptance/MO-051.md");
  });

  it("tells the reviewer when a branch declares no intent at all", () => {
    const out = buildReviewPrompt({ persona: PERSONA });
    expect(out).toContain("names no roadmap item");
  });

  it("says so rather than going blank when an item has a title but no body", () => {
    const out = buildReviewPrompt({ persona: PERSONA, id: "MO-051", title: "t", intent: "  " });
    expect(out).toContain("records no detail beyond its title");
  });

  it("appends the delivery contract even when the caller's persona predates it", () => {
    const out = buildReviewPrompt({ persona: PERSONA, id: "MO-051", title: "t" });
    expect(out).toContain("## Delivery contract");
    expect(out).toContain(REVIEW_DELIVERED_SENTINEL);
    expect(out.indexOf("## Delivery contract")).toBeGreaterThan(
      out.indexOf("What this change was supposed to do"),
    );
  });
});

describe("acceptancePath", () => {
  it("resolves a bare filename under qa/acceptance/", () => {
    expect(acceptancePath("MO-051.md")).toBe("qa/acceptance/MO-051.md");
  });

  it("leaves an already-qualified path alone", () => {
    expect(acceptancePath("qa/acceptance/MO-051.md")).toBe("qa/acceptance/MO-051.md");
  });
});

describe("loadReviewContext", () => {
  const opts = (branch: string) => ({ root, productDir: product, branch });

  // Rung 2 without a persona is rung 1 with a model attached.
  it("refuses when no persona is committed", async () => {
    await seed(ITEM());
    await expect(loadReviewContext(opts("mo-051-x"))).rejects.toThrow(ReviewError);
  });

  it("loads the item named by the branch", async () => {
    await seedPersona();
    await seed(ITEM());
    const ctx = await loadReviewContext(opts("mo-051-agent-code-review"));
    expect(ctx.id).toBe("MO-051");
    expect(ctx.title).toBe("Agent code review");
    expect(ctx.intent).toContain("Why this matters");
  });

  it("returns just the persona for a branch that names no item", async () => {
    await seedPersona();
    await seed(ITEM());
    const ctx = await loadReviewContext(opts("inbox-2026-08-01"));
    expect(ctx.id).toBeUndefined();
    expect(ctx.persona).toBe(PERSONA);
  });

  it("survives a branch naming an item that does not exist", async () => {
    await seedPersona();
    await seed(ITEM());
    const ctx = await loadReviewContext(opts("mo-999-ghost"));
    expect(ctx.id).toBe("MO-999");
    expect(ctx.title).toBeUndefined();
  });

  it("reads acceptance criteria when the file is there", async () => {
    await seedPersona();
    await seed(ITEM("acceptance: MO-051.md\n"));
    await mkdir(join(root, "qa/acceptance"), { recursive: true });
    await writeFile(join(root, "qa/acceptance/MO-051.md"), "- Posts one comment\n");

    const ctx = await loadReviewContext(opts("mo-051-x"));
    expect(ctx.acceptance).toContain("Posts one comment");
    expect(ctx.missingAcceptance).toBeUndefined();
  });

  it("flags a declared acceptance file that is not there", async () => {
    await seedPersona();
    await seed(ITEM("acceptance: MO-051.md\n"));

    const ctx = await loadReviewContext(opts("mo-051-x"));
    expect(ctx.missingAcceptance).toBe("qa/acceptance/MO-051.md");
    expect(ctx.acceptance).toBeUndefined();
  });

  it("does not set either acceptance field when the item declares none", async () => {
    await seedPersona();
    await seed(ITEM());
    const ctx = await loadReviewContext(opts("mo-051-x"));
    expect(ctx.acceptance).toBeUndefined();
    expect(ctx.missingAcceptance).toBeUndefined();
  });
});

describe("the shipped persona", () => {
  it("tells the reviewer not to repeat rung 1", async () => {
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(
      join(import.meta.dirname, "..", PERSONA_PATH),
      "utf8",
    );
    expect(text).toContain("Do not repeat it");
    // The most valuable thing this rung can catch, and nothing else looks for
    // it — no test encodes a decision.
    expect(text).toContain("decisions.md");
    expect(text).toContain("do not block");
    expect(text).toContain("delivery sentinel");
  });
});

/**
 * Whether a change is worth spending a review on.
 *
 * Four of the seven review runs during this rung's rollout read pushes that
 * changed no code — three of them successive edits to one roadmap item's prose
 * — for $4.93 of $8.01. Rung 2 reads code; a records-only push has nothing for
 * it.
 */
describe("review needed", () => {
  it("reviews a source change", () => {
    expect(needed(["src/pm/claim.ts"]).review).toBe(true);
  });

  it("skips a change that is only records", () => {
    expect(needed(["hq/team/cpheinrich.md", ".agent/decisions.md"]).review).toBe(false);
  });

  // The three passes that cost the most: successive edits to one item's prose.
  it("skips a change that is only board bookkeeping", () => {
    const r = needed(["hq/product/roadmap/MO-26-08-02-02.48.16-x.md", "hq/product/roadmap/README.md"]);
    expect(r.review).toBe(false);
  });

  it("reviews when code rides alongside records", () => {
    expect(needed(["hq/product/roadmap/x.md", "tests/review.test.ts"]).review).toBe(true);
  });

  it("reviews a workflow change, which is code the tests cannot run", () => {
    expect(needed([".github/workflows/agent-review.yml"]).review).toBe(true);
  });

  it("skips an empty diff because nothing changed since anyone looked", () => {
    const r = needed([]);
    expect(r.review).toBe(false);
    expect(r.why).toContain("nothing changed");
  });

  it("reviews rather than assumes when the diff could not be read", () => {
    const r = needed(null);
    expect(r.review).toBe(true);
    expect(r.why).toContain("could not read");
  });

  it("always gives a reason, so a skip is legible in the log", () => {
    for (const files of [null, [], ["src/x.ts"], [".agent/x.md"]]) {
      expect(needed(files).why.length).toBeGreaterThan(0);
    }
  });
});

/**
 * Reading a prior review well enough to know if a push answered it.
 *
 * The code test alone is right for a first review and wrong for a second: the
 * most useful re-review this rung has done confirmed a fix to a roadmap item's
 * prose, which the code test skips.
 */
describe("pathsMentioned", () => {
  it("finds a backticked path", () => {
    expect(pathsMentioned("see `src/pm/claim.ts` for the bug")).toContain("src/pm/claim.ts");
  });

  it("finds a path with a line number, without the line number", () => {
    expect(pathsMentioned("`tests/workflows.test.ts:235` is wrong")).toContain(
      "tests/workflows.test.ts",
    );
  });

  it("finds a bare path in prose and one in parentheses", () => {
    const out = pathsMentioned("in .github/workflows/ci.yml and (qa/acceptance/MO-051.md)");
    expect(out).toContain(".github/workflows/ci.yml");
    expect(out).toContain("qa/acceptance/MO-051.md");
  });

  // A review linking to docs is not naming a file here, and treating it as one
  // would make almost any push look like it addressed something.
  it("ignores URLs", () => {
    const out = pathsMentioned("see https://docs.github.com/en/actions/foo.html");
    expect(out).toHaveLength(0);
  });

  it("extracts a repo path from a GitHub blob permalink", () => {
    const out = pathsMentioned(
      "see https://github.com/cpheinrich/morpheus/blob/abc123/src/review/findings.ts#L50",
    );
    expect(out).toEqual(["src/review/findings.ts"]);
  });

  it("extracts paths from a percent-encoded Fix-this link", () => {
    const out = pathsMentioned(
      "[Fix this →](https://claude.ai/code?q=Fix%20src%2Freview%2Ffindings.ts%20and%20tests%2Freview.test.ts&repo=cpheinrich/morpheus)",
    );
    expect(out).toContain("src/review/findings.ts");
    expect(out).toContain("tests/review.test.ts");
  });

  it("deduplicates a path cited several times", () => {
    const out = pathsMentioned("`src/a.ts` then src/a.ts again and `src/a.ts`");
    expect(out).toEqual(["src/a.ts"]);
  });

  it("is empty for a review that names no file", () => {
    expect(pathsMentioned("Looks good, nothing worth a human's time.")).toEqual([]);
  });
});

describe("re-review gating", () => {
  const PRIOR = "Finding 1: `hq/product/roadmap/MO-26-08-02-02.48.16-x.md:48` names the wrong string.";

  // The case that motivated this: a records-only push that answers a finding.
  // Without the prior review it is skipped; with it, it is confirmed.
  it("reviews a records-only push that touches a file the review named", () => {
    const files = ["hq/product/roadmap/MO-26-08-02-02.48.16-x.md"];
    expect(needed(files).review).toBe(false);
    const r = needed(files, { priorReview: PRIOR });
    expect(r.review).toBe(true);
    expect(r.why).toContain("was addressed");
  });

  it("still skips a records-only push that answers nothing", () => {
    const r = needed(["hq/team/cpheinrich.md"], { priorReview: PRIOR });
    expect(r.review).toBe(false);
    expect(r.why).toContain("none the last review named");
  });

  it("reviews a code push regardless of what the review named", () => {
    expect(needed(["src/x.ts"], { priorReview: PRIOR }).review).toBe(true);
  });

  it("behaves as before when there is no prior review", () => {
    expect(needed(["hq/team/x.md"], { priorReview: "" }).review).toBe(false);
  });

  it("does not treat an empty prior review as naming everything", () => {
    expect(needed(["hq/product/roadmap/x.md"], { priorReview: "no findings" }).review).toBe(false);
  });
});

/**
 * The forms a reviewer actually cites files in.
 *
 * The first version required a leading whitespace/backtick/quote/bracket, and
 * therefore missed **bold** — the single most common way this reviewer names a
 * file. The module promised to widen rather than narrow and did the opposite in
 * the one place that counted.
 */
describe("pathsMentioned across citation styles", () => {
  it("finds a bold path", () => {
    expect(pathsMentioned("**src/cli/review.ts** is wrong")).toContain("src/cli/review.ts");
  });

  it("finds a path after a colon with no space", () => {
    expect(pathsMentioned("File:src/cli/review.ts")).toContain("src/cli/review.ts");
  });

  it("finds both sides of a comma-separated pair", () => {
    const out = pathsMentioned("src/a.ts,src/b.ts");
    expect(out).toContain("src/a.ts");
    expect(out).toContain("src/b.ts");
  });

  it("finds a path at the very start of the body", () => {
    expect(pathsMentioned("src/a.ts is the file")).toContain("src/a.ts");
  });

  /**
   * URLs are now removed before matching rather than filtered after. The
   * previous guards were unreachable — the capture group cannot contain a
   * colon — and this test passed because the boundary class refused to start
   * there, proving neither mechanism.
   */
  it("still ignores a URL, and now for the stated reason", () => {
    expect(pathsMentioned("see https://docs.github.com/en/actions/foo.yml")).toEqual([]);
  });

  it("ignores a scheme-less web address", () => {
    expect(pathsMentioned("see docs.github.com/en/actions/foo.yml")).toEqual([]);
  });

  it("keeps a repo path that appears alongside a URL", () => {
    const out = pathsMentioned("per https://docs.github.com/x.html, fix `src/a.ts`");
    expect(out).toEqual(["src/a.ts"]);
  });
});

describe("review delivery", () => {
  const delivered = {
    beforeCommentId: NO_PRIOR_COMMENT,
    commentId: "101",
    body: `${REVIEW_FINISHED_PREFIX}cpheinrich's task in 2m 4s** —— [View job](https://github.com/cpheinrich/morpheus/actions/runs/1)\n\n---\n### Agent review\n\nNo findings worth a human's time.\n\n${REVIEW_DELIVERED_SENTINEL}\n · branch [example](https://github.com/cpheinrich/morpheus/tree/example)`,
  };

  it("accepts a new comment containing a completed review", () => {
    expect(assessReviewDelivery(delivered)).toEqual(
      expect.objectContaining({ delivered: true }),
    );
  });

  it("does not let an earlier successful comment certify this run", () => {
    const result = assessReviewDelivery({
      ...delivered,
      beforeCommentId: "100",
      commentId: "100",
    });
    expect(result.delivered).toBe(false);
    expect(result.why).toContain("earlier run");
  });

  it("does not confuse a missing snapshot with a successful no-prior-comment read", () => {
    const result = assessReviewDelivery({ ...delivered, beforeCommentId: "" });
    expect(result.delivered).toBe(false);
    expect(result.why).toContain("no pre-run");
  });

  it("fails closed when the pre-run comment snapshot was unreadable", () => {
    const result = assessReviewDelivery({
      ...delivered,
      beforeCommentId: UNREADABLE_COMMENT_SNAPSHOT,
    });
    expect(result.delivered).toBe(false);
    expect(result.why).toContain("before the run");
  });

  it("rejects a new comment that still holds the initial placeholder", () => {
    const result = assessReviewDelivery({
      ...delivered,
      body: `${REVIEW_FINISHED_PREFIX}cpheinrich's task** —— [View job](https://github.com/cpheinrich/morpheus/actions/runs/1)\n\n---\n${REVIEW_PLACEHOLDER}`,
    });
    expect(result.delivered).toBe(false);
    expect(result.why).toContain("placeholder");
  });

  it("rejects the action's final error body", () => {
    const result = assessReviewDelivery({
      ...delivered,
      body: `${REVIEW_ERROR_PREFIX}**`,
    });
    expect(result.delivered).toBe(false);
    expect(result.why).toContain("error");
  });

  it("rejects a comment that has not been finalized by the action's post step", () => {
    const result = assessReviewDelivery({
      ...delivered,
      body: "### Agent review\n\nNo findings worth a human's time.",
    });
    expect(result.delivered).toBe(false);
    expect(result.why).toContain("completed-review marker");
  });

  it("rejects a literal live progress body even after the action finalizes it", () => {
    const result = assessReviewDelivery({
      ...delivered,
      body: `${REVIEW_FINISHED_PREFIX}cpheinrich's task** —— [View job](https://github.com/cpheinrich/morpheus/actions/runs/1)\n\n---\n### Review — MO-26-08-02-02.48.16 <img src="https://github.com/user-attachments/assets/5ac382c7-e004-429b-8e35-7feb3e8f9c6f" />\n\n- [ ] Read the diff\n- [ ] Report`,
    });
    expect(result.delivered).toBe(false);
    expect(result.why).toContain("unfinished progress");
  });

  it("requires the Morpheus-owned positive delivery sentinel", () => {
    const result = assessReviewDelivery({
      ...delivered,
      body: `${REVIEW_FINISHED_PREFIX}cpheinrich's task** —— [View job](https://github.com/cpheinrich/morpheus/actions/runs/1)\n\n---\nA plausible body without positive evidence.`,
    });
    expect(result.delivered).toBe(false);
    expect(result.why).toContain("delivery sentinel");
  });

  it("does not accept a progress body that merely mentions the sentinel", () => {
    const result = assessReviewDelivery({
      ...delivered,
      body: `${REVIEW_FINISHED_PREFIX}cpheinrich's task** —— [View job](https://github.com/cpheinrich/morpheus/actions/runs/1)\n\n---\n### Reviewing\n\n<img src="https://github.com/user-attachments/assets/5ac382c7-e004-429b-8e35-7feb3e8f9c6f" />\n\nRemember to add ${REVIEW_DELIVERED_SENTINEL} after reporting.\n\n- [ ] Report`,
    });
    expect(result.delivered).toBe(false);
    expect(result.why).toContain("unfinished progress");
  });

  it("rejects an unfinished checklist without relying on spinner placement", () => {
    const result = assessReviewDelivery({
      ...delivered,
      body: `${REVIEW_FINISHED_PREFIX}cpheinrich's task** —— [View job](https://github.com/cpheinrich/morpheus/actions/runs/1)\n\n---\n### Reviewing\n\n- [ ] Report findings\n\n${REVIEW_DELIVERED_SENTINEL}`,
    });
    expect(result.delivered).toBe(false);
    expect(result.why).toContain("unfinished progress");
  });

  it("allows delivered reviews to quote progress signals as code or prose", () => {
    const result = assessReviewDelivery({
      ...delivered,
      body: `${REVIEW_FINISHED_PREFIX}cpheinrich's task** —— [View job](https://github.com/cpheinrich/morpheus/actions/runs/1)\n\n---\nThe prior body referenced the bare asset id ${REVIEW_PROGRESS_SPINNER_ID}.\n\n\`\`\`markdown\n- [ ] This quoted checklist is not live progress\n\`\`\`\n\n${REVIEW_DELIVERED_SENTINEL}`,
    });
    expect(result.delivered).toBe(true);
  });

  it("allows a delivered review to quote the actual spinner HTML inside a fence", () => {
    const result = assessReviewDelivery({
      ...delivered,
      body: `${REVIEW_FINISHED_PREFIX}cpheinrich's task** —— [View job](https://github.com/cpheinrich/morpheus/actions/runs/1)\n\n---\nThe prior progress body used:\n\n\`\`\`html\n<img src="https://github.com/user-attachments/assets/${REVIEW_PROGRESS_SPINNER_ID}" />\n\`\`\`\n\n${REVIEW_DELIVERED_SENTINEL}`,
    });
    expect(result.delivered).toBe(true);
  });

  it("fails closed when an unbalanced fence makes progress signals ambiguous", () => {
    const result = assessReviewDelivery({
      ...delivered,
      body: `${REVIEW_FINISHED_PREFIX}cpheinrich's task** —— [View job](https://github.com/cpheinrich/morpheus/actions/runs/1)\n\n---\n### Review\n\n\`\`\`text\nunfinished quote\n\n${REVIEW_DELIVERED_SENTINEL}`,
    });
    expect(result.delivered).toBe(false);
    expect(result.why).toContain("unfinished progress");
  });

  it("keeps the delivery marker after the action strips HTML comments", () => {
    const sanitizedBody = delivered.body.replace(/<!--[\s\S]*?-->/g, "");
    expect(sanitizedBody).toContain(REVIEW_DELIVERED_SENTINEL);
    expect(assessReviewDelivery({ ...delivered, body: sanitizedBody }).delivered).toBe(true);
  });

  it("allows a completed review to discuss the placeholder and error markers", () => {
    const result = assessReviewDelivery({
      ...delivered,
      body: `${REVIEW_FINISHED_PREFIX}cpheinrich's task** —— [View job](https://github.com/cpheinrich/morpheus/actions/runs/1)\n\n---\nThe old body was \`${REVIEW_PLACEHOLDER}\` and errors began \`${REVIEW_ERROR_PREFIX}\`.\n\n${REVIEW_DELIVERED_SENTINEL}`,
    });
    expect(result.delivered).toBe(true);
  });
});
