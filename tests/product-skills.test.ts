import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import matter from "@11ty/gray-matter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/cli/run.js";
import { scaffold } from "../src/init/index.js";
import {
  chiefProductOfficerPointerSkill,
  vpDesignPointerSkill,
  type Seed,
} from "../src/init/templates.js";
import { productGuideTopics, productSkillDescription } from "../src/product/guide.js";
import {
  CHIEF_PRODUCT_OFFICER_SKILL,
  VP_DESIGN_SKILL,
  chiefProductOfficerSkillFiles,
  vpDesignSkillFiles,
} from "../src/product/skill.js";

const REPO = join(import.meta.dirname, "..");
const PROVIDER_DIRS = [".agents/skills", ".claude/skills"] as const;
const SEED: Seed = { name: "Acme", prefix: "AC", kind: "company", owner: "cpheinrich" };
const SKILLS = [
  {
    name: CHIEF_PRODUCT_OFFICER_SKILL,
    files: chiefProductOfficerSkillFiles(),
    pointer: chiefProductOfficerPointerSkill,
    topic: [] as string[],
    prefix: "",
  },
  {
    name: VP_DESIGN_SKILL,
    files: vpDesignSkillFiles(),
    pointer: vpDesignPointerSkill,
    topic: [VP_DESIGN_SKILL],
    prefix: `${VP_DESIGN_SKILL}/`,
  },
];
const ALL = Object.fromEntries(
  SKILLS.flatMap(({ name, files }) =>
    Object.entries(files).map(([file, text]) => [`${name}/${file}`, text]),
  ),
);

const referencesOf = (files: Record<string, string>) =>
  Object.keys(files)
    .filter((file) => file.startsWith("references/"))
    .map((file) => file.slice("references/".length, -".md".length))
    .sort();

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split("\\").join("/"))
    .sort();
}

const linksIn = (text: string) =>
  [...text.matchAll(/\]\(((?:\.\.\/)?(?:[\w-]+\/)*[\w-]+\.md)(?:#([\w-]+))?\)/g)].map(
    ([, target = "", anchor]) => ({ target, anchor }),
  );

async function cli(...argv: string[]) {
  const out = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const code = await run(argv);
    const joined = (spy: typeof out) => spy.mock.calls.map((call) => call.join(" ")).join("\n");
    return { code, out: joined(out), err: joined(err) };
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
}

describe.each(SKILLS)("the canonical $name skill", ({ name, files }) => {
  it("matches both provider directories and has valid routing frontmatter", async () => {
    const metadata = matter(files["SKILL.md"] ?? "").data as {
      name?: unknown;
      description?: unknown;
    };
    expect(metadata.name).toBe(name);
    expect(typeof metadata.description).toBe("string");
    expect((metadata.description as string).length).toBeLessThanOrEqual(1024);

    for (const provider of PROVIDER_DIRS) {
      const root = join(REPO, provider, name);
      expect(await filesUnder(root)).toEqual(Object.keys(files).sort());
      for (const [file, content] of Object.entries(files)) {
        expect(await readFile(join(root, file), "utf8")).toBe(content);
      }
    }
  });

  it("links every reference and only existing sibling skills", () => {
    const linked = new Set<string>();
    for (const [file, content] of Object.entries(files)) {
      const base = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
      for (const { target } of linksIn(content)) {
        const path = new URL(target, `file:///${name}/${base}`).pathname.slice(1);
        expect(ALL).toHaveProperty(path);
        for (const provider of PROVIDER_DIRS) expect(existsSync(join(REPO, provider, path))).toBe(true);
        if (file === "SKILL.md" && path.startsWith(`${name}/references/`)) linked.add(path);
      }
    }
    expect([...linked].sort()).toEqual(
      referencesOf(files).map((reference) => `${name}/references/${reference}.md`),
    );
  });
});

describe("product leadership hierarchy and guide", () => {
  it("links the CPO and VP Design in both directions", () => {
    expect(chiefProductOfficerSkillFiles()["SKILL.md"]).toContain(
      "`morpheus product guide vp-design`",
    );
    expect(vpDesignSkillFiles()["SKILL.md"]).toContain(
      `../${CHIEF_PRODUCT_OFFICER_SKILL}/SKILL.md`,
    );
  });

  it("prints each entrypoint and reference, and refuses unknown topics", async () => {
    const expectedTopics = SKILLS.flatMap((skill) => [
      ...skill.topic,
      ...referencesOf(skill.files).map((reference) => `${skill.prefix}${reference}`),
    ]);
    expect(productGuideTopics()).toEqual(expectedTopics);

    for (const skill of SKILLS) {
      const entrypoint = await cli("product", "guide", ...skill.topic);
      expect(entrypoint.code).toBe(0);
      expect(entrypoint.out).toContain(skill.files["SKILL.md"]?.trim());
      for (const reference of referencesOf(skill.files)) {
        const result = await cli("product", "guide", `${skill.prefix}${reference}`);
        expect(result.code).toBe(0);
        expect(`${result.out}\n`).toBe(skill.files[`references/${reference}.md`]);
      }
    }

    const unknown = await cli("product", "guide", "vp-design/unknown");
    expect(unknown.code).toBe(1);
    expect(unknown.out).toBe("");
    expect(unknown.err).toBe(
      `Unknown product guide topic "vp-design/unknown". Topics: ${expectedTopics.join(", ")}.`,
    );
  });

  it("uses the canonical descriptions in scaffold pointers", () => {
    expect(matter(chiefProductOfficerPointerSkill()).data.description).toBe(
      productSkillDescription(),
    );
    expect(matter(vpDesignPointerSkill()).data.description).toBe(
      productSkillDescription(VP_DESIGN_SKILL),
    );
  });
});

describe("project scaffolding", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "product-skills-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it.each(["company", "personal", "internal"] as const)(
    "writes one pointer per provider in a %s project",
    async (kind) => {
      await scaffold(dir, { ...SEED, kind });
      for (const skill of SKILLS) {
        for (const provider of PROVIDER_DIRS) {
          const root = join(dir, provider, skill.name);
          expect(await filesUnder(root)).toEqual(["SKILL.md"]);
          expect(await readFile(join(root, "SKILL.md"), "utf8")).toBe(skill.pointer());
        }
      }
    },
  );
});
