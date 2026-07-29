import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkDrift, generateBrand } from "../src/brand/generate.js";
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
  await writeFile(
    join(dir, "decisions.md"),
    "## Settled\n- Ink on warm paper.\n\n## Rejected\n- Direction B, too institutional.\n\n## Open\n- Accent scope.\n",
  );
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

  it("names which decision sections are missing", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    await completeSession(dir);
    await writeFile(join(dir, "decisions.md"), "## Settled\n- Ink on warm paper.\n");
    const s = await packageStatus(dir);
    const d = s.required.find((r) => r.path === "decisions.md");

    // A session that rejected nothing did not diverge.
    expect(d?.state).toBe("incomplete");
    expect(d?.detail).toBe("no Rejected and Open section");
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

    it("tells the session to keep the record as it goes, not at the end", async () => {
      await generateBrand(dir, "Evo", "ev", ANSWERS);
      const prompt = (await readFile(join(dir, "explore-prompt.md"), "utf8")).replace(/\s+/g, " ");

      expect(prompt).toContain("Scrollback is not a design record");
      expect(prompt).toContain("after every round — not once at the end");
      for (const h of ["## Settled", "## Rejected", "## Open"]) expect(prompt).toContain(h);
    });

    it("asks for stable direction names and a noncanonical scratch space", async () => {
      await generateBrand(dir, "Evo", "ev", ANSWERS);
      const prompt = (await readFile(join(dir, "explore-prompt.md"), "utf8")).replace(/\s+/g, " ");

      expect(prompt).toContain("stable name in round one");
      expect(prompt).toContain("local/brand/");
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

describe("refresh keeps derived files honest", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "brand-refresh-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const CHANGED: BrandAnswers = { ...ANSWERS, mission: "Make logging food take one second." };

  it("cannot leave the old mission in messaging.json after a refresh", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    await generateBrand(dir, "Evo", "ev", CHANGED, { refresh: true });

    const messaging = JSON.parse(await readFile(join(dir, "messaging.json"), "utf8"));
    expect(messaging.mission).toBe(CHANGED.mission);
    expect(messaging.mission).not.toBe(ANSWERS.mission);
  });

  it("regenerates the session brief so it cannot brief the old answers", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    await generateBrand(dir, "Evo", "ev", CHANGED, { refresh: true });

    const prompt = await readFile(join(dir, "explore-prompt.md"), "utf8");
    expect(prompt).toContain(CHANGED.mission);
    expect(prompt).not.toContain(ANSWERS.mission);
  });

  it("reports seeded prose as stale rather than reverting what a human wrote", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const mine = "# Strategy\n\nMy own words, which I prefer to the generated ones.\n";
    await writeFile(join(dir, "strategy.md"), mine);

    const { stale } = await generateBrand(dir, "Evo", "ev", CHANGED, { refresh: true });

    expect(stale.some((f) => f.endsWith("strategy.md"))).toBe(true);
    expect(await readFile(join(dir, "strategy.md"), "utf8")).toBe(mine);
  });

  it("never touches authored files on refresh", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const real = JSON.stringify({ color: { ink: "#101010" }, font: {}, space: {} });
    await writeFile(join(dir, "tokens.json"), real);

    await generateBrand(dir, "Evo", "ev", CHANGED, { refresh: true });

    expect(await readFile(join(dir, "tokens.json"), "utf8")).toBe(real);
  });

  it("leaves everything alone on init, including derived files", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    const { files, skipped } = await generateBrand(dir, "Evo", "ev", CHANGED);

    expect(files).toEqual([]);
    expect(skipped.some((f) => f.endsWith("messaging.json"))).toBe(true);
  });

  it("reports drift without writing, and goes quiet once refreshed", async () => {
    await generateBrand(dir, "Evo", "ev", ANSWERS);
    await writeFile(join(dir, "answers.json"), JSON.stringify(CHANGED, null, 2) + "\n");

    const before = await checkDrift(dir, "Evo", "ev", CHANGED);
    expect(before.derived.some((f) => f.endsWith("messaging.json"))).toBe(true);
    expect(before.seeded.some((f) => f.endsWith("strategy.md"))).toBe(true);
    // Nothing was written by the check itself.
    expect(JSON.parse(await readFile(join(dir, "messaging.json"), "utf8")).mission).toBe(
      ANSWERS.mission,
    );

    await generateBrand(dir, "Evo", "ev", CHANGED, { refresh: true });
    const after = await checkDrift(dir, "Evo", "ev", CHANGED);
    expect(after.derived).toEqual([]);
  });
});
