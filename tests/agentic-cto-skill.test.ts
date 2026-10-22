import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import matter from "gray-matter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/cli/run.js";
import { ctoGuideTopics } from "../src/cto/guide.js";
import { AGENTIC_CTO_SKILL, agenticCtoSkillFiles } from "../src/cto/skill.js";
import { scaffold } from "../src/init/index.js";
import { agenticCtoPointerSkill } from "../src/init/templates.js";
import type { Seed } from "../src/init/templates.js";

const REPO = join(import.meta.dirname, "..");
const PROVIDER_DIRS = [".agents/skills", ".claude/skills"] as const;
const SEED: Seed = { name: "Acme Health", prefix: "ACH", kind: "company", owner: "cpheinrich" };
const files = agenticCtoSkillFiles();

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

describe("the canonical agentic-cto skill", () => {
  it("is what Morpheus's own skill directories hold, byte for byte, for both providers", async () => {
    // The CLI prints the module; agents in this repository read the files. A reference added to one
    // and not the other, or a stale Claude mirror, would give readers different rules.
    for (const providerDir of PROVIDER_DIRS) {
      const root = join(REPO, providerDir, AGENTIC_CTO_SKILL);
      expect(await filesUnder(root)).toEqual(Object.keys(files).sort());
      for (const [file, content] of Object.entries(files)) {
        expect(await readFile(join(root, file), "utf8"), `${providerDir}/${file}`).toBe(content);
      }
    }
  });

  it("names itself after its directory, with a description the skill loaders accept", () => {
    const { name, description } = frontmatter(files["SKILL.md"] ?? "");
    expect(name).toBe(AGENTIC_CTO_SKILL);
    expect(typeof description).toBe("string");
    expect((description as string).length).toBeLessThanOrEqual(1024);
    expect(description).not.toMatch(/[<>]/);
  });

  it("routes to every reference from the entrypoint, and every link and anchor resolves", () => {
    const linked = new Set<string>();
    for (const [file, content] of Object.entries(files)) {
      const base = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
      for (const [, target = "", anchor] of content.matchAll(/\]\(((?:\.\.\/)?(?:references\/)?[\w-]+\.md)(?:#([\w-]+))?\)/g)) {
        const path = new URL(target, `file:///${base}`).pathname.slice(1);
        expect(files, `${file} links ${target}`).toHaveProperty([path]);
        if (file === "SKILL.md") linked.add(path);
        if (anchor) {
          const headings = [...(files[path] ?? "").matchAll(/^#{1,6} (.+)$/gm)].map(([, h = ""]) => anchorOf(h));
          expect(headings, `${file} links ${target}#${anchor}`).toContain(anchor);
        }
      }
    }
    // An unlinked reference is never read: progressive disclosure reaches only what the
    // entrypoint routes to.
    const references = Object.keys(files).filter((f) => f.startsWith("references/"));
    expect(references.length).toBeGreaterThan(0);
    expect([...linked].sort()).toEqual(references.sort());
  });
});

describe("morpheus cto guide", () => {
  it("prints the entrypoint, then how to print each reference it links", async () => {
    const { code, out } = await cli("cto", "guide");
    expect(code).toBe(0);
    expect(out.startsWith(files["SKILL.md"] ?? "\0")).toBe(true);
    const references = Object.keys(files).filter((f) => f.startsWith("references/"));
    for (const reference of references) {
      const topic = reference.slice("references/".length, -".md".length);
      expect(out).toContain(`${reference}  →  morpheus cto guide ${topic}`);
    }
  });

  it("prints each reference verbatim by its topic", async () => {
    expect(ctoGuideTopics().length).toBe(Object.keys(files).length - 1);
    for (const topic of ctoGuideTopics()) {
      const { code, out } = await cli("cto", "guide", topic);
      expect(code).toBe(0);
      expect(`${out}\n`).toBe(files[`references/${topic}.md`]);
    }
  });

  it("refuses an unknown topic or command rather than printing something else", async () => {
    const topic = await cli("cto", "guide", "budget");
    expect(topic.code).toBe(1);
    expect(topic.out).toBe("");
    expect(topic.err).toBe(`Unknown cto guide topic "budget". Topics: ${ctoGuideTopics().join(", ")}.`);

    const command = await cli("cto", "show");
    expect(command.code).toBe(1);
    expect(command.err).toMatch(/^Unknown cto command "show"\./);
  });

  it("names only topics that exist, wherever it is pointed to", () => {
    // A pointer naming a topic the CLI does not have strands the agent at the first step.
    const named = [agenticCtoPointerSkill(), ...Object.values(files)].flatMap((text) =>
      [...text.matchAll(/morpheus cto guide <?([\w-]+)>?/g)].map(([, t = ""]) => t),
    );
    expect(named.length).toBeGreaterThan(0);
    for (const topic of named.filter((t) => t !== "topic")) expect(ctoGuideTopics()).toContain(topic);
  });
});

describe("the agentic-cto pointer other projects carry", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "init-cto-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("routes the same requests as the canonical skill", () => {
    const pointer = frontmatter(agenticCtoPointerSkill());
    const canonical = frontmatter(files["SKILL.md"] ?? "");
    expect(pointer.name).toBe(AGENTIC_CTO_SKILL);
    expect(pointer.description).toBe(canonical.description);
  });

  it.each(["company", "personal", "internal"] as const)(
    "is written for both providers in a %s project, without copying the guide",
    async (kind) => {
      await scaffold(dir, { ...SEED, kind });
      for (const providerDir of PROVIDER_DIRS) {
        const root = join(dir, providerDir, AGENTIC_CTO_SKILL);
        // One file: the references reach a project through the CLI, so there is nothing to drift.
        expect(await filesUnder(root)).toEqual(["SKILL.md"]);
        expect(await readFile(join(root, "SKILL.md"), "utf8")).toBe(agenticCtoPointerSkill());
      }
    },
  );

  it("reaches an existing project when init is re-run, keeping its local edits", async () => {
    await scaffold(dir, SEED);
    const edited = `.agents/skills/${AGENTIC_CTO_SKILL}/SKILL.md`;
    const removed = `.claude/skills/${AGENTIC_CTO_SKILL}/SKILL.md`;
    await writeFile(join(dir, edited), "local wording\n");
    await unlink(join(dir, removed));

    const { written, skipped } = await scaffold(dir, SEED);

    expect(await readFile(join(dir, edited), "utf8")).toBe("local wording\n");
    expect(skipped).toContain(edited);
    expect(written).toEqual([removed]);
    expect(await readFile(join(dir, removed), "utf8")).toBe(agenticCtoPointerSkill());
  });
});
