import { describe, expect, it } from "vitest";
import { classifySources } from "../src/context-search/sources.js";

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
});
