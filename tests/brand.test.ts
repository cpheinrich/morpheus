import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { generateBrand } from "../src/brand/generate.js";
import { packageStatus } from "../src/brand/package.js";
import { BrandAnswers, QUESTIONS } from "../src/brand/questions.js";

let dir: string;

const ANSWERS: BrandAnswers = {
  what: "Free consumer health tools for people taking GLP-1 medication.",
  mission: "Earn trust through genuine utility before there is anything to sell.",
  primaryAudience: "People three months into a GLP-1 prescription, worried about muscle loss.",
  feels: ["calm", "evidence-led", "unfussy"],
  never: ["wellness-influencer", "clinical-cold"],
  references: ["Ro", "Oura"],
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "morpheus-brand-"));
});

describe("questions", () => {
  it("every question maps to a schema field", () => {
    const fields = Object.keys(BrandAnswers.shape);
    for (const q of QUESTIONS) expect(fields).toContain(q.key);
  });

  it("every question explains why it earns its place", () => {
    for (const q of QUESTIONS) expect(q.why.length).toBeGreaterThan(20);
  });

  it("requires the boundary question — it is the one that stops drift", () => {
    const never = QUESTIONS.find((q) => q.key === "never");
    expect(never?.optional).toBeFalsy();
  });
});

describe("schema", () => {
  it("rejects a single adjective", () => {
    expect(BrandAnswers.safeParse({ ...ANSWERS, feels: ["calm"] }).success).toBe(false);
  });

  it("rejects an empty boundary list", () => {
    expect(BrandAnswers.safeParse({ ...ANSWERS, never: [] }).success).toBe(false);
  });

  it("accepts an omitted secondary audience", () => {
    expect(BrandAnswers.safeParse(ANSWERS).success).toBe(true);
  });
});

describe("generateBrand", () => {
  it("writes the full package", async () => {
    const { files } = await generateBrand(dir, "Evo", "ev", ANSWERS);
    const names = (await readdir(dir)).sort();
    expect(names).toContain("README.md");
    expect(names).toContain("strategy.md");
    expect(names).toContain("voice.md");
    expect(names).toContain("visual-system.md");
    expect(names).toContain("tokens.json");
    expect(names).toContain("messaging.json");
    expect(names).toContain("explore-prompt.md");
    // Assert on names, not a count — a count breaks every time the package
    // gains a file, which says nothing about whether it is correct.
    expect(files.length).toBe(names.filter((n) => n !== "answers.md" && n !== "assets").length + 1);
  });

  it("writes no TODO placeholders anywhere", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    for (const f of await readdir(dir)) {
      if (!f.endsWith(".md") && !f.endsWith(".json")) continue;
      const body = await readFile(join(dir, f), "utf8");
      expect(body).not.toMatch(/TODO|TBD|FIXME|\{\{/);
    }
  });

  it("puts the boundaries into strategy as hard rules", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const s = await readFile(join(dir, "strategy.md"), "utf8");
    expect(s).toContain("wellness-influencer");
    expect(s).toContain("must never be");
  });

  it("emits machine-readable messaging for the web app to import", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const m = JSON.parse(await readFile(join(dir, "messaging.json"), "utf8"));
    expect(m.mission).toBe(ANSWERS.mission);
    expect(m.never).toEqual(ANSWERS.never);
  });

  it("uses the token prefix in the visual system", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const v = await readFile(join(dir, "visual-system.md"), "utf8");
    expect(v).toContain("--ev-");
  });

  it("defers to an existing visual source when one is given", async () => {
    await generateBrand(dir, "Evo", "ev", { ...ANSWERS, visualSource: "apps/web/app/brand" });
    // Collapse whitespace — generated prose is wrapped, and where a line breaks
    // is not something a test should depend on.
    const v = (await readFile(join(dir, "visual-system.md"), "utf8")).replace(/\s+/g, " ");
    expect(v).toContain("apps/web/app/brand");
    expect(v).toContain("the live surface wins");
  });

  it("omits the secondary audience section rather than leaving it blank", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const s = await readFile(join(dir, "strategy.md"), "utf8");
    expect(s).toContain("no secondary audience");
  });
});


describe("non-destructive generation", () => {
  it("never overwrites an existing file", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(dir, "strategy.md"), "MINE — do not clobber\n");

    const { files, skipped } = await generateBrand(dir, "Evo", "ev", ANSWERS);

    expect(await readFile(join(dir, "strategy.md"), "utf8")).toBe("MINE — do not clobber\n");
    expect(skipped.some((f) => f.endsWith("strategy.md"))).toBe(true);
    expect(files.some((f) => f.endsWith("strategy.md"))).toBe(false);
  });

  it("writes no tokens.json when a visual source already exists", async () => {
    const { files } = await generateBrand(dir, "Evo", "ev", {
      ...ANSWERS,
      visualSource: "apps/web/app/brand",
    });
    expect(files.some((f) => f.endsWith("tokens.json"))).toBe(false);
    expect(await readdir(dir)).not.toContain("tokens.json");
  });

  it("does write tokens.json for a greenfield project", async () => {
    const { files } = await generateBrand(dir, "Evo", "ev", ANSWERS);
    expect(files.some((f) => f.endsWith("tokens.json"))).toBe(true);
  });

  it("records answers in the editable file so they can be revised", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const saved = await readFile(join(dir, "answers.md"), "utf8");
    for (const n of ANSWERS.never) expect(saved).toContain(`- ${n}`);
    expect(saved).toContain(ANSWERS.primaryAudience);
  });

  it("reads answers back for refresh, and returns null when absent", async () => {
    const { readAnswers } = await import("../src/brand/answers.js");
    expect(await readAnswers(dir)).toBeNull();
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    expect((await readAnswers(dir))?.mission).toBe(ANSWERS.mission);
  });

  it("returns null rather than throwing when the anchors have been deleted", async () => {
    const { writeFile } = await import("node:fs/promises");
    const { readAnswers } = await import("../src/brand/answers.js");
    await writeFile(join(dir, "answers.md"), "# Just some prose\n\nNo anchors here.\n");
    expect(await readAnswers(dir)).toBeNull();
  });
});

describe("exploration handoff", () => {
  it("writes a prompt to paste into an interactive session", async () => {
    const { files } = await generateBrand(dir, "Evo", "ev", ANSWERS);
    expect(files.some((f) => f.endsWith("explore-prompt.md"))).toBe(true);
  });

  it("carries the constraints into the prompt so they are not restated by hand", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const p = await readFile(join(dir, "explore-prompt.md"), "utf8");
    expect(p).toContain(ANSWERS.mission);
    expect(p).toContain(ANSWERS.primaryAudience);
    for (const n of ANSWERS.never) expect(p).toContain(n);
  });

  it("casts the agent as designer and the document as a brief", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const p = (await readFile(join(dir, "explore-prompt.md"), "utf8")).replace(/\s+/g, " ");
    expect(p).toContain("acting as the **brand designer**");
    expect(p).toContain("your brief, not your output");
  });

  it("demands mockups rather than descriptions", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const p = (await readFile(join(dir, "explore-prompt.md"), "utf8")).replace(/\s+/g, " ");
    expect(p).toContain("Show, do not describe");
    expect(p).toContain("Never ask me to imagine");
  });

  it("describes iterative rounds rather than a single batch", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const p = await readFile(join(dir, "explore-prompt.md"), "utf8");
    for (const stage of ["Diverge", "Ask what landed", "Narrow", "Converge"]) {
      expect(p).toContain(stage);
    }
  });

  it("ends by consolidating into the brand package", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const p = await readFile(join(dir, "explore-prompt.md"), "utf8");
    expect(p).toContain("hq/brand/tokens.json");
    expect(p).toContain("hq/brand/visual-system.md");
    expect(p).toContain("First working version, not final");
  });

  it("tells the agent to push back when a preference breaks a constraint", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const p = (await readFile(join(dir, "explore-prompt.md"), "utf8")).replace(/\s+/g, " ");
    expect(p).toContain("violates a constraint I set");
  });

  it("tells the agent the existing surface is canonical when there is one", async () => {
    await generateBrand(dir, "Evo", "ev", { ...ANSWERS, visualSource: "apps/web/app/brand" });
    const p = (await readFile(join(dir, "explore-prompt.md"), "utf8")).replace(/\s+/g, " ");
    expect(p).toContain("apps/web/app/brand");
    expect(p).toContain("explore *within* it");
  });

  it("omits the existing-surface instruction for a greenfield brand", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const p = await readFile(join(dir, "explore-prompt.md"), "utf8");
    expect(p).not.toContain("already exists");
  });

  it("uses the token prefix in the write-back instruction", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    expect(await readFile(join(dir, "explore-prompt.md"), "utf8")).toContain("--ev-");
  });
});

/**
 * The answers above are the short examples from `questions.ts`. Every bug in
 * this block survived the suite because the fixture was shaped like the
 * examples rather than like the answers the prompts ask for: `primaryAudience`
 * is prompted with "a description beats a demographic", and a considered
 * `never` entry is a clause with its own commas.
 */
const REAL_ANSWERS: BrandAnswers = {
  what: "Evo is an independent consumer health intelligence platform offering free tools.",
  mission: "Earn trust through genuine utility by turning evidence into clear next actions.",
  primaryAudience:
    "Self-directed adults early in a GLP-1 journey — often first-time health optimizers — who are losing weight and want trustworthy guidance without making health their full-time identity.",
  secondaryAudience: "Data-literate health optimizers who expect transparent methodology.",
  feels: ["bright", "intelligent", "kinetic"],
  never: [
    "corporate, institutional, or dry",
    "cold, clinical, hospital-coded, or disease-first",
    "like a transactional pharmacy, an affiliate content farm, or a sales funnel",
  ],
  references: ["Oura", "Stripe"],
};

describe("prose survives answers that are not two-word examples", () => {
  it("does not case-fold the audience into a sentence", async () => {
    await generateBrand(dir, "Evo", "ev", REAL_ANSWERS);
    const voice = await readFile(join(dir, "voice.md"), "utf8");
    // Lower-casing a description destroys the proper nouns inside it.
    expect(voice).toContain("GLP-1");
    expect(voice).not.toContain("glp-1");
  });

  it("does not collide the audience's own full stop with template punctuation", async () => {
    await generateBrand(dir, "Evo", "ev", REAL_ANSWERS);
    expect(await readFile(join(dir, "voice.md"), "utf8")).not.toContain(".,");
  });

  it("keeps every boundary separable when entries contain commas", async () => {
    await generateBrand(dir, "Evo", "ev", REAL_ANSWERS);
    const readme = await readFile(join(dir, "README.md"), "utf8");
    // Joined with ", " the three clauses read as one unparseable sentence.
    for (const n of REAL_ANSWERS.never) expect(readme).toContain(`- ${n}`);
  });

  it("applies every adjective in the strategy test, not just the first two", async () => {
    await generateBrand(dir, "Evo", "ev", REAL_ANSWERS);
    const strategy = await readFile(join(dir, "strategy.md"), "utf8");
    expect(strategy).toContain("bright, intelligent and kinetic");
  });
});

describe("visual system agrees with what was actually written", () => {
  it("never points at a tokens.json it deliberately did not write", async () => {
    const answers = { ...REAL_ANSWERS, visualSource: "packages/shared/tokens/" };
    const { files } = await generateBrand(dir, "Evo", "ev", answers);
    expect(files.some((f) => f.endsWith("tokens.json"))).toBe(false);

    const visual = await readFile(join(dir, "visual-system.md"), "utf8");
    expect(visual).not.toContain("tokens.json`](./tokens.json)");
    expect(visual).toContain("packages/shared/tokens/");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("packages/shared/tokens/");
    expect(readme).not.toContain("[`tokens.json`](./tokens.json)");
  });

  it("still points at tokens.json for a greenfield project", async () => {
    await generateBrand(dir, "Evo", "ev", REAL_ANSWERS);
    const visual = await readFile(join(dir, "visual-system.md"), "utf8");
    expect(visual).toContain("[`tokens.json`](./tokens.json)");
  });

  it("stays detectable as scaffold text either way", async () => {
    // `checkVisualSystem` matches exact generated sentences. Rewording the
    // token pointer must not make an unwritten section look finished.
    const answers = { ...REAL_ANSWERS, visualSource: "packages/shared/tokens/" };
    await generateBrand(dir, "Evo", "ev", answers);
    const status = await packageStatus(dir);
    const visual = status.required.find((r) => r.path === "visual-system.md");
    expect(visual?.state).toBe("incomplete");
    expect(visual?.detail).toContain("scaffold text");
  });
});
