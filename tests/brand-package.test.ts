import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateBrand } from "../src/brand/generate.js";
import { OPTIONAL, REQUIRED, packageStatus } from "../src/brand/package.js";
import type { BrandAnswers } from "../src/brand/questions.js";

const ANSWERS: BrandAnswers = {
  what: "A calorie tracker that works from a photo.",
  mission: "Make logging food take five seconds.",
  primaryAudience: "People who have abandoned three tracking apps already",
  feels: ["calm", "precise"],
  never: ["preachy", "gamified"],
  references: [],
};

/** Populate the files a design session is responsible for. */
async function completeSession(dir: string): Promise<void> {
  await writeFile(
    join(dir, "tokens.json"),
    JSON.stringify({
      color: { ink: "#101010", paper: "#fdfdfb" },
      font: { display: "Söhne" },
      space: { md: "16px" },
    }),
  );
  await writeFile(
    join(dir, "visual-system.md"),
    "# Visual system\n\nInk on warm paper. Söhne at three sizes. Nothing else.\n",
  );
  await writeFile(join(dir, "assets/logo.svg"), "<svg/>");
}

describe("brand package", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "brand-pkg-"));
    await mkdir(join(dir, "assets"), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports the wizard's own outputs as satisfied but the session's as outstanding", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const s = await packageStatus(dir);

    expect(s.complete).toBe(false);
    const byPath = new Map(s.required.map((r) => [r.path, r]));
    for (const e of REQUIRED.filter((e) => e.source === "wizard")) {
      expect(byPath.get(e.path)?.state).toBe("ok");
    }
    expect(byPath.get("assets/logo.svg")?.state).toBe("missing");
  });

  it("treats the empty token scaffold as incomplete rather than present", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const s = await packageStatus(dir);
    const tokens = s.required.find((r) => r.path === "tokens.json");

    // The file exists — that is exactly why existence is not the check.
    expect(tokens?.state).toBe("incomplete");
    expect(tokens?.detail).toMatch(/empty scaffold/);
    expect(tokens?.detail).toContain("color");
  });

  it("names which sections of visual-system.md are still scaffold text", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const s = await packageStatus(dir);
    const vs = s.required.find((r) => r.path === "visual-system.md");

    expect(vs?.state).toBe("incomplete");
    expect(vs?.detail).toContain("typography");
  });

  it("goes complete once the session has written its share", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    await completeSession(dir);
    const s = await packageStatus(dir);

    expect(s.complete).toBe(true);
    expect(s.required.every((r) => r.state === "ok")).toBe(true);
  });

  it("never lets an absent optional file affect completeness", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    await completeSession(dir);
    const s = await packageStatus(dir);

    expect(s.optional.every((o) => !o.present)).toBe(true);
    expect(s.complete).toBe(true);
  });

  it("detects an optional file once it is added", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    await writeFile(join(dir, "motion.md"), "# Motion\n");
    const s = await packageStatus(dir);

    expect(s.optional.find((o) => o.path === "motion.md")?.present).toBe(true);
  });

  it("reports a malformed tokens.json as incomplete instead of throwing", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    await writeFile(join(dir, "tokens.json"), "{ not json");
    const s = await packageStatus(dir);

    expect(s.required.find((r) => r.path === "tokens.json")?.detail).toMatch(/unreadable/);
  });

  describe("single source of truth", () => {
    it("asks the design session for exactly the required set it will be checked on", async () => {
      await generateBrand(dir, "Evo", "ev", ANSWERS);
      const prompt = await readFile(join(dir, "explore-prompt.md"), "utf8");

      for (const e of REQUIRED.filter((e) => e.source === "session")) {
        expect(prompt).toContain(`hq/brand/${e.path}`);
      }
      // The wizard's own outputs already exist; asking for them would be noise.
      expect(prompt).not.toContain("hq/brand/messaging.json");
    });

    it("tells the session to stop at the required set", async () => {
      await generateBrand(dir, "Evo", "ev", ANSWERS);
      const prompt = (await readFile(join(dir, "explore-prompt.md"), "utf8")).replace(/\s+/g, " ");

      expect(prompt).toContain("Do not produce anything beyond that list");
      expect(prompt).toContain("complete beats a broad one that is thin");
    });

    it("documents every optional entry with the trigger that earns it", async () => {
      await generateBrand(dir, "Evo", "ev", ANSWERS);
      const readme = await readFile(join(dir, "README.md"), "utf8");

      for (const o of OPTIONAL) {
        expect(readme).toContain(o.path);
        expect(readme).toContain(o.when);
      }
    });
  });
});
