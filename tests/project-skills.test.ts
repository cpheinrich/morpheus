import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import matter from "@11ty/gray-matter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/cli/run.js";
import { syncProjectSkillEntrypoints } from "../src/cli/skills.js";
import { scaffold } from "../src/init/index.js";
import type { Seed } from "../src/init/templates.js";
import {
  MORPHEUS_ONLY_SKILLS,
  PROJECT_SKILLS,
  applicableProjectSkills,
  projectSkillCatalog,
  projectSkillPath,
  syncProjectSkills,
  type ProjectKind,
  type SkillProvider,
} from "../src/project-skills.js";

const REPO = join(import.meta.dirname, "..");
const PROVIDER_ROOTS: Record<SkillProvider, string> = {
  agents: ".agents/skills",
  claude: ".claude/skills",
};
const SEED: Omit<Seed, "kind"> = {
  name: "Acme Health",
  prefix: "ACH",
  owner: "cpheinrich",
};

async function skillDirectories(provider: SkillProvider): Promise<string[]> {
  const entries = await readdir(join(REPO, PROVIDER_ROOTS[provider]), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function skillFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const provider of Object.keys(PROVIDER_ROOTS) as SkillProvider[]) {
    const providerRoot = join(root, PROVIDER_ROOTS[provider]);
    const entries = await readdir(providerRoot, { recursive: true, withFileTypes: true }).catch(
      () => [],
    );
    files.push(
      ...entries
        .filter((entry) => entry.isFile() && entry.name === "SKILL.md")
        .map((entry) => relative(root, join(entry.parentPath, entry.name)).split("\\").join("/")),
    );
  }
  return files.sort();
}

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

describe("the reusable project-skill registry", () => {
  it("classifies every canonical Morpheus skill and records its actual provider entrypoints", async () => {
    const byProvider = {
      agents: await skillDirectories("agents"),
      claude: await skillDirectories("claude"),
    };
    const actual = new Set([...byProvider.agents, ...byProvider.claude]);
    const classified = new Set([
      ...PROJECT_SKILLS.filter((skill) => skill.canonical).map((skill) => skill.name),
      ...MORPHEUS_ONLY_SKILLS,
    ]);
    expect([...classified].sort()).toEqual([...actual].sort());

    for (const skill of PROJECT_SKILLS.filter((definition) => definition.canonical)) {
      const actualProviders = (Object.keys(PROVIDER_ROOTS) as SkillProvider[]).filter((provider) =>
        byProvider[provider].includes(skill.name),
      );
      expect(actualProviders, skill.name).toEqual(skill.providers);
    }
  });

  it("derives a complete machine-readable catalog from rendered SKILL.md frontmatter", () => {
    const catalog = projectSkillCatalog();
    expect(catalog.map((skill) => skill.name)).toEqual([
      "motion-design-exploration",
      "comment-qa",
      "meeting-intake",
      "agentic-cto",
      "research-engineer",
      "devops-engineer",
      "chief-product-officer",
      "vp-design",
      "brand-review",
      "website-init",
    ]);
    expect(new Set(catalog.map((skill) => skill.name)).size).toBe(catalog.length);
    for (const [index, skill] of catalog.entries()) {
      const definition = PROJECT_SKILLS[index]!;
      const data = matter(definition.render()).data as { name?: unknown; description?: unknown };
      expect(skill).toEqual({
        name: definition.name,
        description: data.description,
        providers: definition.providers,
        projectKinds: definition.kinds,
        distribution: definition.distribution,
        ...(definition.guide ? { guide: definition.guide } : {}),
      });
      expect(data.name).toBe(definition.name);
      expect(typeof skill.description).toBe("string");
      expect(skill.description.length).toBeGreaterThan(0);
      expect(skill.description.length).toBeLessThanOrEqual(1024);
    }
  });

  it.each(["company", "personal", "internal"] as const)(
    "drives every loader-native entrypoint in a %s scaffold",
    async (kind) => {
      const root = await mkdtemp(join(tmpdir(), "morpheus-skills-scaffold-"));
      try {
        await scaffold(root, { ...SEED, kind });
        const definitions = applicableProjectSkills(kind);
        const expected = definitions
          .flatMap((skill) => skill.providers.map((provider) => projectSkillPath(provider, skill.name)))
          .sort();
        expect(await skillFiles(root)).toEqual(expected);
        for (const skill of definitions) {
          for (const provider of skill.providers) {
            expect(await readFile(join(root, projectSkillPath(provider, skill.name)), "utf8")).toBe(
              skill.render(),
            );
          }
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});

describe("project-skill synchronization", () => {
  let root: string;
  const kind: ProjectKind = "company";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "morpheus-skills-sync-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("checks without writing, creates only missing entrypoints, and is idempotent", async () => {
    const expected = applicableProjectSkills(kind)
      .flatMap((skill) => skill.providers.map((provider) => projectSkillPath(provider, skill.name)));
    const sortedExpected = [...expected].sort();
    const check = await syncProjectSkills(root, kind, true);
    expect(check.expected.sort()).toEqual(sortedExpected);
    expect(check.created).toEqual([]);
    expect(check.issues.sort()).toEqual(sortedExpected.map((path) => `${path}: missing`));
    expect(await skillFiles(root)).toEqual([]);

    const local = projectSkillPath("agents", "comment-qa");
    const localContent = `---\nname: comment-qa\ndescription: Project-specific routing.\n---\n\nKeep me.\n`;
    await mkdir(dirname(join(root, local)), { recursive: true });
    await writeFile(join(root, local), localContent);

    const first = await syncProjectSkills(root, kind, false);
    expect(first.issues).toEqual([]);
    expect(first.created.sort()).toEqual(sortedExpected.filter((path) => path !== local));
    expect(first.present).toEqual([local]);
    expect(await readFile(join(root, local), "utf8")).toBe(localContent);

    const second = await syncProjectSkills(root, kind, false);
    expect(second).toEqual({ expected, created: [], present: expected, issues: [] });
    expect(await syncProjectSkills(root, kind, true)).toEqual({
      expected,
      created: [],
      present: expected,
      issues: [],
    });
  });

  it("reports an invalid project-owned entrypoint without overwriting it", async () => {
    const path = projectSkillPath("agents", "comment-qa");
    const invalid = `---\nname: another-skill\ndescription: Still non-empty.\n---\n`;
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), invalid);

    const result = await syncProjectSkills(root, kind, false);

    expect(result.issues).toEqual([
      `${path}: frontmatter name must be "comment-qa", got "another-skill"`,
    ]);
    expect(await readFile(join(root, path), "utf8")).toBe(invalid);
  });

  it("publishes complete entrypoints when two syncs start concurrently", async () => {
    const expected = applicableProjectSkills("internal")
      .flatMap((skill) => skill.providers.map((provider) => projectSkillPath(provider, skill.name)))
      .sort();

    const results = await Promise.all([
      syncProjectSkills(root, "internal", false),
      syncProjectSkills(root, "internal", false),
    ]);

    for (const result of results) {
      expect(result.issues).toEqual([]);
      expect([...result.created, ...result.present].sort()).toEqual(expected);
    }
    expect(await skillFiles(root)).toEqual(expected);
  });

  it("reads project kind from the manifest and refuses a missing or invalid manifest honestly", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await syncProjectSkillEntrypoints(root, true)).toBe(1);
      expect(error.mock.calls.flat().join(" ")).toContain("Could not read morpheus.json");

      error.mockClear();
      await writeFile(join(root, "morpheus.json"), '{"kind":"laboratory"}\n');
      expect(await syncProjectSkillEntrypoints(root, true)).toBe(1);
      expect(error.mock.calls.flat().join(" ")).toContain(
        'morpheus.json kind must be "company", "personal", or "internal"',
      );

      error.mockClear();
      await writeFile(join(root, "morpheus.json"), '{"kind":"internal"}\n');
      expect(await syncProjectSkillEntrypoints(root, false)).toBe(0);
      expect(error).not.toHaveBeenCalled();
      expect(log.mock.calls.flat().join(" ")).toContain("Created 15 Morpheus project skill");
    } finally {
      error.mockRestore();
      log.mockRestore();
    }
  });
});

describe("morpheus skills list", () => {
  it("prints the stable machine-readable catalog and accepts list as the default command", async () => {
    const command = await cli("skills", "list", "--json");
    expect(command.code).toBe(0);
    expect(command.err).toBe("");
    expect(JSON.parse(command.out)).toEqual({
      schemaVersion: "morpheus-project-skills-1",
      skills: projectSkillCatalog(),
    });

    const defaultCommand = await cli("skills");
    expect(defaultCommand.code).toBe(0);
    expect(defaultCommand.out).toContain("Morpheus project skills (10)");
    expect(defaultCommand.out).toContain("morpheus skills sync");
  });

  it("refuses an unknown command", async () => {
    const command = await cli("skills", "publish");
    expect(command.code).toBe(1);
    expect(command.err).toMatch(/^Unknown skills command "publish"\./);
  });
});
