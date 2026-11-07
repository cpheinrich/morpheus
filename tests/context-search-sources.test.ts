import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifySources, contextCoverage, readContextSources } from "../src/context-search/sources.js";

describe("context search source coverage", () => {
  it("adds project sources and surfaces missing coverage outside the manifest", () => {
    expect(classifySources([
      "AGENTS.md", ".agent/decisions/new.md", ".agent/inbox-archive/history.md",
      "hq/team/cpheinrich.md", "hq/team/meeting-notes/planning.md",
      "hq/research/experiments/current.md", "operations/new-guide.md",
      "docs/internal.md", "../outside.md", "src/code.ts", "hq/product/roadmap/README.md",
    ], { include: ["hq/research/**/*.md", "archive/**/*.md"], exclude: ["docs/internal.md"] })).toEqual({
      included: [".agent/decisions/new.md", "AGENTS.md", "hq/research/experiments/current.md", "hq/team/meeting-notes/planning.md"],
      excluded: [".agent/inbox-archive/history.md", "docs/internal.md", "hq/product/roadmap/README.md", "hq/team/cpheinrich.md"],
      uncovered: ["operations/new-guide.md"],
      emptyPatterns: ["archive/**/*.md"],
    });
  });
  it("reports removed and symlinked tracked sources instead of claiming they can be indexed", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "morpheus-coverage-")));
    try {
      execFileSync("git", ["init", "-q"], { cwd: root });
      await mkdir(join(root, "docs"));
      await writeFile(join(root, "docs/active.md"), "# Active");
      await writeFile(join(root, "docs/deleted.md"), "# Deleted");
      await symlink("active.md", join(root, "docs/link.md"));
      execFileSync("git", ["add", "docs"], { cwd: root });
      await rm(join(root, "docs/deleted.md"));

      const report = await contextCoverage(root, { include: ["docs/deleted.md"], exclude: [] });
      expect(report.included).toEqual(["docs/active.md"]);
      expect(report.unavailable).toEqual(["docs/deleted.md", "docs/link.md"]);
      expect(report.emptyPatterns).toEqual(["docs/deleted.md"]);
      expect(await readContextSources(root, [...report.included, ...report.unavailable])).toEqual([
        { path: "docs/active.md", text: "# Active" },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
