import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
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
  });
});
