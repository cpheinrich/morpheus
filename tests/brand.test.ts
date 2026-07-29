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
