import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import matter from "@11ty/gray-matter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/cli/run.js";
import { ctoGuideTopics, ctoSkillDescription } from "../src/cto/guide.js";
import {
  AGENTIC_CTO_SKILL,
  RESEARCH_ENGINEER_SKILL,
  agenticCtoSkillFiles,
  researchEngineerSkillFiles,
} from "../src/cto/skill.js";
import { scaffold } from "../src/init/index.js";
import { agenticCtoPointerSkill, researchEngineerPointerSkill } from "../src/init/templates.js";
import type { Seed } from "../src/init/templates.js";

const REPO = join(import.meta.dirname, "..");
const PROVIDER_DIRS = [".agents/skills", ".claude/skills"] as const;
const SEED: Seed = { name: "Acme Health", prefix: "ACH", kind: "company", owner: "cpheinrich" };

/**
 * The agentic CTO and the individual-contributor skills under it. `topic` is what
 * `morpheus cto guide` takes to print the entrypoint (nothing, for the CTO), and `prefix` is what
 * precedes a reference's name in its topic.
 */
const SKILLS = [
  {
    name: AGENTIC_CTO_SKILL,
    files: agenticCtoSkillFiles(),
    pointer: agenticCtoPointerSkill,
    topic: [] as string[],
    prefix: "",
  },
  {
    name: RESEARCH_ENGINEER_SKILL,
    files: researchEngineerSkillFiles(),
    pointer: researchEngineerPointerSkill,
    topic: [RESEARCH_ENGINEER_SKILL],
    prefix: `${RESEARCH_ENGINEER_SKILL}/`,
  },
];

/** Every skill file by its path under a skill directory, which is what a cross-skill link names. */
const ALL: Record<string, string> = Object.fromEntries(
  SKILLS.flatMap(({ name, files }) => Object.entries(files).map(([file, text]) => [`${name}/${file}`, text])),
);

/** A skill's reference names, from its file paths. */
const referencesOf = (files: Record<string, string>) =>
  Object.keys(files)
    .filter((f) => f.startsWith("references/"))
    .map((f) => f.slice("references/".length, -".md".length))
    .sort();

/** Every file under `dir`, as forward-slash paths relative to it. */
async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split("\\").join("/"))
    .sort();
}

/** GitHub's heading anchor: lower case, punctuation dropped, spaces to hyphens. */
const anchorOf = (heading: string) =>
  heading.trim().toLowerCase().replace(/[^\p{L}\p{N} -]/gu, "").replace(/ /g, "-");

/** The frontmatter as a skill loader's YAML parser sees it; a stray colon throws here. */
const frontmatter = (skill: string) => matter(skill).data as { name?: unknown; description?: unknown };

/** Each relative Markdown link in `text`: its target and anchor. */
const linksIn = (text: string) =>
  [...text.matchAll(/\]\(((?:\.\.\/)?(?:[\w-]+\/)*[\w-]+\.md)(?:#([\w-]+))?\)/g)].map(([, target = "", anchor]) => ({
    target,
    anchor,
  }));

/** What `morpheus <argv>` prints and returns. */
async function cli(...argv: string[]) {
  const out = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const code = await run(argv);
    const joined = (spy: typeof out) => spy.mock.calls.map((c) => c.join(" ")).join("\n");
    return { code, out: joined(out), err: joined(err) };
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
}

describe.each(SKILLS)("the canonical $name skill", ({ name, files }) => {
  it("is what Morpheus's own skill directories hold, byte for byte, for both providers", async () => {
    // The CLI prints the module; agents in this repository read the files. A reference added to one
    // and not the other, or a stale Claude mirror, would give readers different rules.
    for (const providerDir of PROVIDER_DIRS) {
      const root = join(REPO, providerDir, name);
      expect(await filesUnder(root)).toEqual(Object.keys(files).sort());
      for (const [file, content] of Object.entries(files)) {
        expect(await readFile(join(root, file), "utf8"), `${providerDir}/${name}/${file}`).toBe(content);
      }
    }
  });

  it("names itself after its directory, with a description the skill loaders accept", () => {
    const { name: named, description } = frontmatter(files["SKILL.md"] ?? "");
    expect(named).toBe(name);
    expect(typeof description).toBe("string");
    expect((description as string).length).toBeLessThanOrEqual(1024);
    expect(description).not.toMatch(/[<>]/);
  });

  it("routes to every reference from the entrypoint, and every link and anchor resolves", () => {
    const linked = new Set<string>();
    for (const [file, content] of Object.entries(files)) {
      const base = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
      for (const { target, anchor } of linksIn(content)) {
        // Resolved from the skill's own directory, so `../agentic-cto/SKILL.md` names a sibling skill.
        const path = new URL(target, `file:///${name}/${base}`).pathname.slice(1);
        expect(ALL, `${name}/${file} links ${target}`).toHaveProperty([path]);
        for (const providerDir of PROVIDER_DIRS) {
          expect(existsSync(join(REPO, providerDir, path)), `${providerDir}/${path}`).toBe(true);
        }
        if (file === "SKILL.md" && path.startsWith(`${name}/references/`)) linked.add(path);
        if (anchor) {
          const headings = [...(ALL[path] ?? "").matchAll(/^#{1,6} (.+)$/gm)].map(([, h = ""]) => anchorOf(h));
          expect(headings, `${name}/${file} links ${target}#${anchor}`).toContain(anchor);
        }
      }
    }
    // An unlinked reference is never read: progressive disclosure reaches only what the
    // entrypoint routes to.
    const references = referencesOf(files).map((r) => `${name}/references/${r}.md`);
    expect(references.length).toBeGreaterThan(0);
    expect([...linked].sort()).toEqual(references);
  });
});

describe("the research-engineer skill under the CTO", () => {
  it("links the CTO it works under, and the CTO names it, so each reaches the other", () => {
    const research = researchEngineerSkillFiles()["SKILL.md"] ?? "";
    const toCto = linksIn(research).filter(({ target }) => target === `../${AGENTIC_CTO_SKILL}/SKILL.md`);
    expect(toCto).toHaveLength(1);
    expect(agenticCtoSkillFiles()["SKILL.md"]).toContain(`\`morpheus cto guide ${RESEARCH_ENGINEER_SKILL}\``);
  });
});

describe("morpheus cto guide", () => {
  it.each(SKILLS)("prints the $name entrypoint, then how to print each reference it links", async (skill) => {
    const { code, out } = await cli("cto", "guide", ...skill.topic);
    expect(code).toBe(0);
    const routes = referencesOf(skill.files).map(
      (t) => `  references/${t}.md  →  morpheus cto guide ${skill.prefix}${t}`,
    );
    expect(out).toBe(
      `${skill.files["SKILL.md"]}\n---\n` +
        `Printed by the installed Morpheus CLI. Read a reference this guide links with:\n${routes.join("\n")}`,
    );
  });

  it("prints each reference verbatim by its topic", async () => {
    expect(ctoGuideTopics()).toEqual(
      SKILLS.flatMap((s) => [...s.topic, ...referencesOf(s.files).map((t) => `${s.prefix}${t}`)]),
    );
    for (const { files, prefix } of SKILLS) {
      for (const reference of referencesOf(files)) {
        const { code, out } = await cli("cto", "guide", `${prefix}${reference}`);
        expect(code).toBe(0);
        expect(`${out}\n`).toBe(files[`references/${reference}.md`]);
      }
    }
  });

  it.each([
    "budget",
    "record",
    "research-engineer/budget",
    "research-engineer/",
    "research-engineer/record/extra",
    `${AGENTIC_CTO_SKILL}/mandate`,
    "constructor",
    "research-engineer/constructor",
  ])("refuses the unknown topic %j rather than printing something else", async (topic) => {
    const { code, out, err } = await cli("cto", "guide", topic);
    expect(code).toBe(1);
    expect(out).toBe("");
    expect(err).toBe(`Unknown cto guide topic "${topic}". Topics: ${ctoGuideTopics().join(", ")}.`);
  });

  it("refuses an unknown command", async () => {
    const command = await cli("cto", "show");
    expect(command.code).toBe(1);
    expect(command.err).toMatch(/^Unknown cto command "show"\./);
  });

  it("names only topics that exist, wherever it is pointed to", () => {
    // A pointer naming a topic the CLI does not have strands the agent at the first step.
    const texts = SKILLS.flatMap((s) => [s.pointer(), ...Object.values(s.files)]);
    const named = texts.flatMap((text) =>
      [...text.matchAll(/morpheus cto guide ([\w<>/-]+)/g)].map(([, t = ""]) => t.replace(/\/<topic>$/, "")),
    );
    expect(named).toContain(RESEARCH_ENGINEER_SKILL);
    expect(named).toContain(`${RESEARCH_ENGINEER_SKILL}/record`);
    for (const topic of named.filter((t) => t !== "<topic>")) expect(ctoGuideTopics()).toContain(topic);
  });

  it("has no description for a skill it does not carry, rather than borrowing another's", () => {
    expect(() => ctoSkillDescription("budget")).toThrow('The budget SKILL.md has no description line.');
    expect(ctoSkillDescription()).toBe(ctoSkillDescription(AGENTIC_CTO_SKILL));
    expect(ctoSkillDescription(RESEARCH_ENGINEER_SKILL)).not.toBe(ctoSkillDescription(AGENTIC_CTO_SKILL));
  });
});

describe.each(SKILLS)("the $name pointer other projects carry", ({ name, files, pointer }) => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "init-cto-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("routes the same requests as the canonical skill", () => {
    const pointed = frontmatter(pointer());
    const canonical = frontmatter(files["SKILL.md"] ?? "");
    expect(pointed.name).toBe(name);
    expect(pointed.description).toBe(canonical.description);
  });

  it.each(["company", "personal", "internal"] as const)(
    "is written for both providers in a %s project, without copying the guide",
    async (kind) => {
      await scaffold(dir, { ...SEED, kind });
      for (const providerDir of PROVIDER_DIRS) {
        const root = join(dir, providerDir, name);
        // One file: the references reach a project through the CLI, so there is nothing to drift.
        expect(await filesUnder(root)).toEqual(["SKILL.md"]);
        expect(await readFile(join(root, "SKILL.md"), "utf8")).toBe(pointer());
      }
    },
  );

  it("reaches an existing project when init is re-run, keeping its local edits", async () => {
    await scaffold(dir, SEED);
    const edited = `.agents/skills/${name}/SKILL.md`;
    const removed = `.claude/skills/${name}/SKILL.md`;
    await writeFile(join(dir, edited), "local wording\n");
    await unlink(join(dir, removed));

    const { written, skipped } = await scaffold(dir, SEED);

    expect(await readFile(join(dir, edited), "utf8")).toBe("local wording\n");
    expect(skipped).toContain(edited);
    expect(written).toEqual([removed]);
    expect(await readFile(join(dir, removed), "utf8")).toBe(pointer());
  });
});
