import { lstat, mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scaffold } from "../src/init/index.js";
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
    const inbox = await parseInboxFile(join(dir, "hq/inbox/cpheinrich.md"));
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

  it("writes index markers so pm index has somewhere to splice", async () => {
    await scaffold(dir, SEED);
    const readme = await read("hq/product/roadmap/README.md");

    expect(readme).toContain("<!-- morpheus:begin -->");
    expect(readme).toContain("<!-- morpheus:end -->");
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

    it("does not append to .gitignore twice", async () => {
      await scaffold(dir, SEED);
      await scaffold(dir, SEED);
      const ignore = await read(".gitignore");

      expect(ignore.match(/# Morpheus/g)).toHaveLength(1);
    });

    it("keeps a hand-written inbox for someone else", async () => {
      await mkdir(join(dir, "hq/inbox"), { recursive: true });
      await writeFile(join(dir, "hq/inbox/someone-else.md"), "theirs\n");
      await scaffold(dir, SEED);

      expect(await read("hq/inbox/someone-else.md")).toBe("theirs\n");
      expect(await read("hq/inbox/cpheinrich.md")).toContain("owner: cpheinrich");
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

      for (const d of ["product", "inbox", "brand", "marketing", "finance", "ops"]) {
        expect(hq).toContain(d);
      }
    });
  });
});
