import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import matter from "@11ty/gray-matter";
import { describe, expect, it, vi } from "vitest";
import { run } from "../src/cli/run.js";
import { VISUAL_DESIGN_SKILL } from "../src/design/visual-design.js";
import { scaffold } from "../src/init/index.js";
import { visualDesignPointerSkill } from "../src/init/templates.js";
import { projectSkillCatalog, syncProjectSkills } from "../src/project-skills.js";
import { missingInstructions } from "../src/doctor/instructions.js";

const REPO = join(import.meta.dirname, "..");
const PATHS = [".agents/skills/visual-design/SKILL.md", ".claude/skills/visual-design/SKILL.md"];

describe("visual planning distribution (not an agent behavior evaluation)", () => {
  it("ships exact canonical bytes through both providers and the CLI, with one routing description", async () => {
    for (const path of PATHS) expect(await readFile(join(REPO, path), "utf8")).toBe(VISUAL_DESIGN_SKILL);
    const canonical = matter(VISUAL_DESIGN_SKILL).data;
    expect(canonical.name).toBe("visual-design");
    expect(matter(visualDesignPointerSkill()).data).toEqual(canonical);
    expect(projectSkillCatalog().find((skill) => skill.name === "visual-design")).toEqual({
      name: "visual-design",
      description: canonical.description,
      providers: ["agents", "claude"],
      projectKinds: ["company", "personal", "internal"],
      distribution: "pointer",
      guide: "morpheus skills guide visual-design",
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await run(["skills", "guide", "visual-design"])).toBe(0);
      expect(log.mock.calls).toEqual([[VISUAL_DESIGN_SKILL.replace(/\n$/, "")]]);
      for (const topic of [[], ["unknown"]]) {
        log.mockClear();
        error.mockClear();
        expect(await run(["skills", "guide", ...topic])).toBe(1);
        expect(log).not.toHaveBeenCalled();
        expect(error.mock.calls).toEqual([[`Unknown project skill guide "${topic[0] ?? ""}". Guides: visual-design.`]]);
      }
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  it.each(["company", "personal", "internal"] as const)(
    "gives %s projects pointers and early instructions; detects the instruction gap after pointer installation",
    async (kind) => {
      const root = await mkdtemp(join(tmpdir(), "visual-planning-scaffold-"));
      try {
        await scaffold(root, { name: "Acme", prefix: "AC", kind, owner: "example" });
        for (const path of PATHS) expect(await readFile(join(root, path), "utf8")).toBe(visualDesignPointerSkill());
        const instructions = await readFile(join(root, "AGENTS.md"), "utf8");
        expect(missingInstructions(instructions)).toEqual([]);
        const withoutEarlyRule = instructions.replace(/\*\*Plan visually early\.\*\*[\s\S]*?\n\n/, "");
        expect(missingInstructions(withoutEarlyRule).map((anchor) => anchor.name)).toEqual(["early visual planning"]);
        // Installing the skill is deliberately insufficient to adopt planning instructions.
        await writeFile(join(root, "AGENTS.md"), withoutEarlyRule);
        expect((await syncProjectSkills(root, kind, false)).created).toEqual([]);
        expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(withoutEarlyRule);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("adds the missing provider pointer while preserving an existing project's visual skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "visual-planning-sync-"));
    try {
      const authored = "---\nname: visual-design\ndescription: Local design conventions.\n---\nKeep these project notes.\n";
      await mkdir(dirname(join(root, PATHS[0]!)), { recursive: true });
      await writeFile(join(root, PATHS[0]!), authored);
      const result = await syncProjectSkills(root, "internal", false);
      expect(result.issues).toEqual([]);
      expect(result.created.filter((path) => path.includes("visual-design"))).toEqual([PATHS[1]]);
      expect(await readFile(join(root, PATHS[0]!), "utf8")).toBe(authored);
      expect(await readFile(join(root, PATHS[1]!), "utf8")).toBe(visualDesignPointerSkill());
      expect((await syncProjectSkills(root, "internal", false)).created).toEqual([]);
      expect((await syncProjectSkills(root, "internal", true)).issues).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
