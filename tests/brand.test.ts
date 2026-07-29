import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { generateBrand } from "../src/brand/generate.js";
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
    expect(files.length).toBe(7);
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

  it("records answers so refresh can prefill them", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const saved = JSON.parse(await readFile(join(dir, "answers.json"), "utf8"));
    expect(saved.never).toEqual(ANSWERS.never);
    expect(saved.primaryAudience).toBe(ANSWERS.primaryAudience);
  });

  it("reads answers back for refresh, and returns null when absent", async () => {
    const { readAnswers } = await import("../src/brand/answers.js");
    expect(await readAnswers(dir)).toBeNull();
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    expect((await readAnswers(dir))?.mission).toBe(ANSWERS.mission);
  });

  it("returns null rather than throwing on a corrupt answers file", async () => {
    const { writeFile } = await import("node:fs/promises");
    const { readAnswers } = await import("../src/brand/answers.js");
    await writeFile(join(dir, "answers.json"), "{ not json");
    expect(await readAnswers(dir)).toBeNull();
  });
});
