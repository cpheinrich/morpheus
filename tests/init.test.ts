import { lstat, mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scaffold } from "../src/init/index.js";
import { rules } from "../src/cli/hq.js";
import { BEGIN, renderFirestoreRules } from "../src/hq/rules.js";
import { parseInboxFile } from "../src/inbox/parse.js";
import { parseArtifact } from "../src/pm/parse.js";
import type { Seed } from "../src/init/templates.js";

const SEED: Seed = { name: "Acme Health", prefix: "ACH", kind: "company", owner: "cpheinrich" };

describe("morpheus init", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "init-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const read = (rel: string) => readFile(join(dir, rel), "utf8");

  it("produces a project that passes the checks Morpheus itself enforces", async () => {
    await scaffold(dir, SEED);

    // The inbox it writes must satisfy the inbox validator, or the first thing
    // a new project does is fail its own CI.
    const inbox = await parseInboxFile(join(dir, "hq/team/cpheinrich.md"));
    expect(inbox.issues).toEqual([]);

    // The product directories must parse, empty though they are.
    for (const kind of ["roadmap", "goals", "requests"] as const) {
      const { issues } = await parseArtifact(join(dir, "hq/product"), kind);
      expect(issues).toEqual([]);
    }
  });

  it("symlinks CLAUDE.md rather than copying AGENTS.md", async () => {
    await scaffold(dir, SEED);
    const stat = await lstat(join(dir, "CLAUDE.md"));

    // A copy would drift, and the drift would be invisible until an agent
    // acted on the stale one.
    expect(stat.isSymbolicLink()).toBe(true);
  });

  describe("pointing back at Morpheus", () => {
    // MO-054. The readers who most need this are the ones nobody can brief: a
    // code review agent starts with no memory by design, and an agent working
    // for a collaborator has never seen Morpheus at all.
    it("writes a README a human can read", async () => {
      await scaffold(dir, SEED);
      const readme = await read("README.md");

      expect(readme).toContain("# Acme Health");
      expect(readme).toContain("Built and managed with Morpheus");
    });

    it("links to the public repo from both README.md and AGENTS.md", async () => {
      await scaffold(dir, SEED);

      // Bare repo link, plus the two documents an arriving agent is sent to.
      for (const file of ["README.md", "AGENTS.md"]) {
        const text = await read(file);
        expect(text).toContain("https://github.com/cpheinrich/morpheus");
        expect(text).toContain("/blob/main/architecture.md");
        expect(text).toContain("/blob/main/AGENTS.md");
      }
    });

    it("tells an agent to send Morpheus gaps upstream rather than patch locally", async () => {
      await scaffold(dir, SEED);

      // The whole point: a local workaround fixes one project and hides the
      // defect from every other one.
      for (const file of ["README.md", "AGENTS.md"]) {
        expect(await read(file)).toContain("https://github.com/cpheinrich/morpheus/issues");
      }
    });

    it("puts the callout before the project's own conventions in AGENTS.md", async () => {
      await scaffold(dir, SEED);
      const agents = await read("AGENTS.md");

      // Read-Morpheus-first is only true if it comes first. Below the layout
      // and the claim instructions, an agent has already acted.
      expect(agents.indexOf("managed by Morpheus")).toBeLessThan(agents.indexOf("## Layout"));
    });

    it("tells a contributor to create the roadmap item themselves", async () => {
      await scaffold(dir, SEED);

      // `created` and `baseSha` only mean anything recorded at the moment the
      // problem was hit. A maintainer writing the item afterwards records the
      // wrong repository state and a date days late.
      const agents = await read("AGENTS.md");
      expect(agents).toContain("Create the roadmap item in your pull request");
      expect(agents).toContain("morpheus pm new roadmap");

      // And the two pieces of GitHub behaviour a contributor would hit blind.
      expect(agents).toContain("needs a fork");
      expect(agents).toContain("without secrets");
    });

    it("keeps a README the project already wrote", async () => {
      const mine = "# The real readme\n";
      await writeFile(join(dir, "README.md"), mine);

      const { written, skipped } = await scaffold(dir, SEED);

      expect(skipped).toContain("README.md");
      expect(written).not.toContain("README.md");
      expect(await read("README.md")).toBe(mine);
    });
  });

  describe("folder documentation", () => {
    // A folder gets a README when an agent could plausibly do the wrong thing
    // without it. The previous scaffold wrote "Nothing here yet." into every
    // directory, which looks documented and says less than the folder name.
    it("writes a README that says something, for folders that earn one", async () => {
      await scaffold(dir, SEED);

      for (const [d, must] of [
        ["hq/team", "GitHub handle"],
        ["hq/marketing", "hq/brand"],
        ["qa", "verifier rung 3"],
        ["qa/acceptance", "before"],
        ["infra", "morpheus hq rules"],
      ] as const) {
        const text = await read(`${d}/README.md`);
        expect(text, d).toContain(must);
        expect(text, d).not.toContain("Nothing here yet");
      }
    });

    it("points at the specification instead of restating it", async () => {
      await scaffold(dir, SEED);

      // Depth lives in one place; the README buys locality, not a second copy.
      for (const d of ["qa", "infra", "hq/team"]) {
        expect(await read(`${d}/README.md`), d).toContain("architecture.md");
      }
    });

    it("scaffolds qa/ and infra/, which the spec described and no project had", async () => {
      await scaffold(dir, SEED);

      expect(await read("qa/acceptance/README.md")).toContain("acceptance");
      expect(await read("infra/README.md")).toContain("firestore.rules");
    });

    it("starts company projects with the deployed rules file already current", async () => {
      await scaffold(dir, SEED);

      const path = "infra/firebase/firestore.rules";
      expect(await read(path)).toContain("morpheus:begin roles");
      expect(await rules(dir, true, path)).toBe(0);
      expect(JSON.parse(await read("firebase.json"))).toEqual({ firestore: { rules: path } });
      const notes = (await scaffold(dir, SEED)).notes.join("\n");
      expect(notes).not.toContain("Created the deployed rules file");

      const ci = load(await read(".github/workflows/ci.yml")) as {
        jobs?: Record<string, { with?: Record<string, unknown> }>;
      };
      expect(ci.jobs?.pm?.with?.["hq-rules-path"]).toBe(path);
    });

    it("warns that a fresh canonical gate and deploy config become active together", async () => {
      const result = await scaffold(dir, SEED);

      const notes = result.notes.join("\n");
      expect(notes).toContain("deny-by-default starter policy");
      expect(notes).toContain("also created firebase.json");
      expect(notes).toContain("next Firebase deploy will use this file");
    });

    it("does not add a second rules file to an established root-layout project", async () => {
      await writeFile(join(dir, "firestore.rules"), "the deployed legacy gate\n", "utf8");

      const result = await scaffold(dir, SEED);

      await expect(read("infra/firebase/firestore.rules")).rejects.toMatchObject({ code: "ENOENT" });
      expect(result.skipped).toContain(
        "infra/firebase/firestore.rules (root firestore.rules already exists)",
      );
      expect(result.notes.join("\n")).toContain("did not create a second rules file");
      const infraReadme = await read("infra/README.md");
      expect(infraReadme).toContain("the rules file firebase.json deploys");
      expect(infraReadme).not.toContain("--rules-path infra/firebase/firestore.rules");
      const ci = load(await read(".github/workflows/ci.yml")) as {
        jobs?: Record<string, { with?: Record<string, unknown> }>;
      };
      expect(ci.jobs?.pm?.with?.["hq-rules-path"]).toBeUndefined();
    });

    it("explains how to wire a newly added gate when existing CI is preserved", async () => {
      const existingCi = "name: Mine\n";
      await mkdir(join(dir, ".github/workflows"), { recursive: true });
      await writeFile(join(dir, ".github/workflows/ci.yml"), existingCi, "utf8");

      const result = await scaffold(dir, SEED);

      expect(await read(".github/workflows/ci.yml")).toBe(existingCi);
      expect(await read("infra/firebase/firestore.rules")).toContain("morpheus:begin roles");
      const note = result.notes.join("\n");
      expect(note).toContain("existing .github/workflows/ci.yml does not check that path");
      expect(note).toContain("hq-rules-path: infra/firebase/firestore.rules");

      const second = await scaffold(dir, SEED);
      expect(second.notes.join("\n")).toContain(
        "existing .github/workflows/ci.yml does not check that path",
      );
    });

    it("uses the deployed path when firebase.json already owns it", async () => {
      await writeFile(
        join(dir, "firebase.json"),
        JSON.stringify({ firestore: { rules: "firebase/firestore.rules" } }),
        "utf8",
      );

      const result = await scaffold(dir, SEED);

      await expect(read("infra/firebase/firestore.rules")).rejects.toMatchObject({ code: "ENOENT" });
      expect(await read("firebase/firestore.rules")).toContain("morpheus:begin roles");
      const ci = load(await read(".github/workflows/ci.yml")) as {
        jobs?: Record<string, { with?: Record<string, unknown> }>;
      };
      expect(ci.jobs?.pm?.with?.["hq-rules-path"]).toBe("firebase/firestore.rules");
      expect(result.notes.join("\n")).toContain("deny-by-default starter policy");
    });

    it("leaves CI off for an existing configured rules file without markers", async () => {
      await writeFile(
        join(dir, "firebase.json"),
        JSON.stringify({ firestore: { rules: "firestore.rules" } }),
        "utf8",
      );
      await writeFile(join(dir, "firestore.rules"), "rules_version = '2';\n", "utf8");

      const result = await scaffold(dir, SEED);

      const ci = load(await read(".github/workflows/ci.yml")) as {
        jobs?: Record<string, { with?: Record<string, unknown> }>;
      };
      expect(ci.jobs?.pm?.with?.["hq-rules-path"]).toBeUndefined();
      expect(await read("firestore.rules")).toBe("rules_version = '2';\n");
      expect(result.notes.join("\n")).toContain("morpheus hq rules --print");
    });

    it("treats a begin-only marker as incomplete and leaves CI off", async () => {
      await writeFile(
        join(dir, "firebase.json"),
        JSON.stringify({ firestore: { rules: "firestore.rules" } }),
        "utf8",
      );
      await writeFile(join(dir, "firestore.rules"), `${BEGIN}\ntruncated\n`, "utf8");

      const result = await scaffold(dir, SEED);
      const ci = load(await read(".github/workflows/ci.yml")) as {
        jobs?: Record<string, { with?: Record<string, unknown> }>;
      };

      expect(ci.jobs?.pm?.with?.["hq-rules-path"]).toBeUndefined();
      expect(result.notes.join("\n")).toContain("no complete generated role marker block");
    });

    it("wires a complete stale block and reports the refresh before the first PR", async () => {
      await writeFile(
        join(dir, "firebase.json"),
        JSON.stringify({ firestore: { rules: "firestore.rules" } }),
        "utf8",
      );
      const stale = renderFirestoreRules().replace("role() == 'admin';", "role() == 'owner';");
      await writeFile(join(dir, "firestore.rules"), stale, "utf8");

      const result = await scaffold(dir, SEED);
      const ci = load(await read(".github/workflows/ci.yml")) as {
        jobs?: Record<string, { with?: Record<string, unknown> }>;
      };

      expect(ci.jobs?.pm?.with?.["hq-rules-path"]).toBe("firestore.rules");
      expect(result.notes.join("\n")).toContain(
        "morpheus hq rules --rules-path firestore.rules",
      );
      expect(await read("firestore.rules")).toBe(stale);
    });

    it("leaves a pre-existing unmarked canonical gate unwired", async () => {
      await mkdir(join(dir, "infra/firebase"), { recursive: true });
      await writeFile(
        join(dir, "infra/firebase/firestore.rules"),
        "rules_version = '2';\n",
        "utf8",
      );

      const result = await scaffold(dir, SEED);
      const ci = load(await read(".github/workflows/ci.yml")) as {
        jobs?: Record<string, { with?: Record<string, unknown> }>;
      };

      expect(ci.jobs?.pm?.with?.["hq-rules-path"]).toBeUndefined();
      expect(result.notes.join("\n")).toContain("morpheus hq rules --print");
    });

    it("wires a pre-existing stale canonical gate and reports its refresh", async () => {
      await mkdir(join(dir, "infra/firebase"), { recursive: true });
      const stale = renderFirestoreRules().replace("role() == 'admin';", "role() == 'owner';");
      await writeFile(join(dir, "infra/firebase/firestore.rules"), stale, "utf8");

      const result = await scaffold(dir, SEED);
      const ci = load(await read(".github/workflows/ci.yml")) as {
        jobs?: Record<string, { with?: Record<string, unknown> }>;
      };

      expect(ci.jobs?.pm?.with?.["hq-rules-path"]).toBe("infra/firebase/firestore.rules");
      expect(result.notes.join("\n")).toContain(
        "morpheus hq rules --rules-path infra/firebase/firestore.rules",
      );
      expect(await read("infra/firebase/firestore.rules")).toBe(stale);
    });

    it("distinguishes malformed Firebase config from an ambiguous rules shape", async () => {
      for (const [name, config, message] of [
        ["malformed", "{\"firestore\":", "could not be parsed"],
        ["ambiguous", JSON.stringify({ firestore: [{ rules: "a.rules" }] }), "does not name one"],
      ] as const) {
        const root = join(dir, name);
        await mkdir(root, { recursive: true });
        await writeFile(join(root, "firebase.json"), config, "utf8");

        const result = await scaffold(root, SEED);
        expect(result.notes.join("\n")).toContain(message);
        await expect(readFile(join(root, "infra/firebase/firestore.rules"), "utf8")).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    });

    it("does not treat an unreadable Firebase config as absent", async () => {
      await mkdir(join(dir, "firebase.json"));

      const result = await scaffold(dir, SEED);

      const notes = result.notes.join("\n");
      expect(notes).toContain("firebase.json could not be read");
      expect(notes).toContain("Left the Firestore gate alone");
      expect(notes).toContain("fix or confirm the configuration");
      await expect(read("infra/firebase/firestore.rules")).rejects.toMatchObject({ code: "ENOENT" });
      const ci = load(await read(".github/workflows/ci.yml")) as {
        jobs?: Record<string, { with?: Record<string, unknown> }>;
      };
      expect(ci.jobs?.pm?.with?.["hq-rules-path"]).toBeUndefined();
    });

    it("reports an unreadable preserved CI file instead of dropping wiring guidance", async () => {
      await mkdir(join(dir, ".github/workflows/ci.yml"), { recursive: true });

      const result = await scaffold(dir, SEED);

      const notes = result.notes.join("\n");
      expect(notes).toContain("Could not read the existing .github/workflows/ci.yml");
      expect(notes).toContain("wire hq-rules-path to infra/firebase/firestore.rules");
    });

    /**
     * The directory exists from the start rather than on first use, because
     * the gate lives in it: `redacted: true` is a claim, `team validate`
     * refuses a note without it, and a gate you only meet after hand-creating
     * the folder is one you meet *after* the first transcript is committed.
     *
     * Migrated repos had this and scaffolded ones did not, which was the wrong
     * way round — a fresh project got less than a retrofitted one.
     */
    it("scaffolds meeting-notes with its redaction gate stated up front", async () => {
      await scaffold(dir, SEED);
      const text = await read("hq/team/meeting-notes/README.md");

      expect(text).toContain("never a transcript");
      expect(text).toContain("redacted: true");
      // A pointer, not a copy — one document about what may be published, so
      // there is nothing to drift.
      expect(text).toContain("blob/main/hq/team/meeting-notes/README.md");
    });

    it("writes no README for a directory it has nothing to say about", async () => {
      await scaffold(dir, SEED);
      const files = await readdir(join(dir, "hq/brand"));

      // The brand wizard owns that filename and never overwrites, so a
      // placeholder here would block the real one permanently.
      expect(files).not.toContain("README.md");
    });
  });

  it("leaves hq/brand/README.md to the brand wizard", async () => {
    await scaffold(dir, SEED);
    const files = await readdir(join(dir, "hq/brand"));

    // The wizard never overwrites, so a placeholder README here would block
    // the real one permanently.
    expect(files).not.toContain("README.md");
    expect(files).toContain(".gitkeep");
  });

  it("gives every directory a tracked file, since git drops empty ones", async () => {
    await scaffold(dir, SEED);

    for (const d of ["hq/product/roadmap", "hq/product/goals", ".agent/worklog", ".agent/inbox-archive"]) {
      expect((await readdir(join(dir, d))).length).toBeGreaterThan(0);
    }
  });

  it("writes indexes that are already current, not bare markers", async () => {
    await scaffold(dir, SEED);
    const readme = await read("hq/product/roadmap/README.md");

    expect(readme).toContain("<!-- morpheus:begin -->");
    expect(readme).toContain("<!-- morpheus:end -->");

    // The generator writes a placeholder between the markers even for an
    // empty artifact, so bare markers are already stale and `pm index --check`
    // fails on a project nobody has touched.
    expect(readme).toContain("_Nothing here yet._");
  });

  it("passes pm index --check immediately after scaffolding", async () => {
    await scaffold(dir, SEED);
    const productDir = join(dir, "hq/product");
    const gen = await import("../src/pm/index-gen.js");
    const { parseArtifact } = await import("../src/pm/parse.js");

    for (const kind of ["roadmap", "goals", "requests"] as const) {
      const { items } = await parseArtifact(productDir, kind);
      const render = { roadmap: gen.renderRoadmap, goals: gen.renderGoals, requests: gen.renderRequests }[kind];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const changed = await gen.writeIndex(join(productDir, kind), (render as (i: any) => string)(items));
      // False means regenerating would not change the file — which is exactly
      // what `pm index --check` asserts in CI.
      expect(changed).toBe(false);
    }
  });

  it("carries the project's own prefix into the instructions", async () => {
    await scaffold(dir, SEED);

    expect(await read("AGENTS.md")).toContain("morpheus pm claim ACH-001");
    expect(await read(".agent/decisions.md")).toContain("ACH-");
  });

  it("writes no TODO placeholders", async () => {
    await scaffold(dir, SEED);
    const walk = async (d: string): Promise<string[]> => {
      const out: string[] = [];
      for (const e of await readdir(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) out.push(...(await walk(p)));
        else if (e.isFile() && e.name.endsWith(".md")) out.push(await readFile(p, "utf8"));
      }
      return out;
    };

    // A file full of placeholders looks answered and is not.
    for (const text of await walk(dir)) expect(text).not.toMatch(/\bTODO\b/);
  });

  describe("run against a repository that already exists", () => {
    it("never overwrites, and reports what it left alone", async () => {
      const mine = "# My own instructions\n";
      await writeFile(join(dir, "AGENTS.md"), mine);

      const { written, skipped } = await scaffold(dir, SEED);

      expect(skipped).toContain("AGENTS.md");
      expect(written).not.toContain("AGENTS.md");
      expect(await read("AGENTS.md")).toBe(mine);
    });

    it("is idempotent — a second run writes nothing", async () => {
      await scaffold(dir, SEED);
      const { written } = await scaffold(dir, SEED);

      expect(written).toEqual([]);
    });

    it("appends to an existing .gitignore instead of replacing it", async () => {
      await writeFile(join(dir, ".gitignore"), "node_modules\ndist\n");
      await scaffold(dir, SEED);
      const ignore = await read(".gitignore");

      expect(ignore).toContain("node_modules");
      expect(ignore).toContain("# Morpheus");
    });

    it("does not ignore design assets a brand session will produce", async () => {
      await scaffold(dir, SEED);
      const ignore = await read(".gitignore");

      // A blanket *.png would hide moodboards, mockups and logo exports —
      // exactly the output the brand session is asked to commit.
      expect(ignore).not.toMatch(/^\*\.png$/m);
      expect(ignore).toContain("/*.png");
    });

    it("does not append to .gitignore twice", async () => {
      await scaffold(dir, SEED);
      await scaffold(dir, SEED);
      const ignore = await read(".gitignore");

      expect(ignore.match(/# Morpheus/g)).toHaveLength(1);
    });

    it("keeps a hand-written inbox for someone else", async () => {
      await mkdir(join(dir, "hq/team"), { recursive: true });
      await writeFile(join(dir, "hq/team/someone-else.md"), "theirs\n");
      await scaffold(dir, SEED);

      expect(await read("hq/team/someone-else.md")).toBe("theirs\n");
      expect(await read("hq/team/cpheinrich.md")).toContain("owner: cpheinrich");
    });
  });

  describe("CI is matched to what the project is", () => {
    it("omits the Node job when there is no pnpm lockfile", async () => {
      await scaffold(dir, SEED);
      const ci = await read(".github/workflows/ci.yml");

      // node-ci runs `pnpm install --frozen-lockfile`. Wiring it into a static
      // site or a Python repo puts CI in the red on the first push.
      expect(ci).not.toContain("node-ci.yml");
      expect(ci).toContain("pm-check.yml");
      expect(ci).toContain("pr-check.yml");
    });

    it("includes the Node job for a pnpm project", async () => {
      await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
      await scaffold(dir, SEED);

      expect(await read(".github/workflows/ci.yml")).toContain("node-ci.yml");
    });

    it("says why the Node job is absent rather than leaving it a mystery", async () => {
      const { notes } = await scaffold(dir, SEED);

      expect(notes.join(" ")).toMatch(/No pnpm lockfile/);
    });
  });

  describe("kind", () => {
    it("does not give an internal tool a brand or a finance directory", async () => {
      await scaffold(dir, { ...SEED, kind: "internal" });
      const hq = await readdir(join(dir, "hq"));

      expect(hq).not.toContain("brand");
      expect(hq).not.toContain("finance");
      expect(hq).toContain("product");
    });

    it("gives a company the full set", async () => {
      await scaffold(dir, SEED);
      const hq = await readdir(join(dir, "hq"));

      for (const d of ["product", "team", "brand", "marketing", "finance", "ops"]) {
        expect(hq).toContain(d);
      }
    });
  });
});
