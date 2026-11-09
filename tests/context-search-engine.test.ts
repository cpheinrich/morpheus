import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { searchContext } from "../src/context-search/engine.js";

const sources = [
  { path: "docs/near.md", text: "See EV-26-11-01-01.02.04 for a different deploy rule.\n" },
  { path: "docs/target.md", text: "# Deployment policy\r\nEV-26-11-01-01.02.03 protects the release handoff.\r\n" },
];
const python = process.env.MORPHEUS_TANTIVY_PYTHON ?? "python3";
const hasTantivy = spawnSync(python, ["-c", "import importlib.metadata, tantivy; assert importlib.metadata.version('tantivy') == '0.27.0'"]).status === 0;
let cacheDir: string;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "morpheus-context-search-"));
});

afterEach(() => {
  rmSync(cacheDir, { force: true, recursive: true });
});

test("ripgrep preserves ID punctuation and maps the citation to the correct file", async () => {
  const options = { engine: "ripgrep", cacheDir } as const;
  const result = await searchContext(sources, "Find EV-26-11-01-01.02.03", 1000, options);
  expect(result.output).toBe("docs/target.md:1-2\n# Deployment policy\nEV-26-11-01-01.02.03 protects the release handoff.\n\n");
  expect(result.resultCount).toBe(1);
  expect(result.buildMs).toBe(0);
  expect(result.cacheHit).toBe(false);
});

test("the exact cap fits and one token below omits an indivisible excerpt", async () => {
  const options = { engine: "ripgrep", cacheDir } as const;
  const query = "EV-26-11-01-01.02.03";
  const full = await searchContext(sources, query, 1000, options);
  expect(await searchContext(sources, query, full.returnedTokens, options)).toMatchObject({
    output: full.output, returnedTokens: full.returnedTokens, resultCount: 1,
  });
  expect(await searchContext(sources, query, full.returnedTokens - 1, options)).toMatchObject({
    output: "", returnedTokens: 0, resultCount: 0,
  });
});

describe.skipIf(!hasTantivy)("with the pinned Tantivy binding", () => {
  test("reuses the immutable index, then rebuilds after a source edit", async () => {
    const options = { engine: "tantivy", cacheDir } as const;
    const query = "EV-26-11-01-01.02.03";
    const initial = await searchContext(sources, query, 1000, options);
    expect(initial.output).toContain("docs/target.md:1-2");
    expect(initial.output).not.toContain("near.md");
    expect(initial.cacheHit).toBe(false);
    expect(await searchContext(sources, query, 1000, options)).toMatchObject({
      output: initial.output, cacheHit: true, buildMs: 0,
    });
    const edited = sources.map((source) => ({ ...source, text: source.text.replace("handoff", "checkpoint") }));
    const updated = await searchContext(edited, query, 1000, options);
    expect(updated.output).toContain("release checkpoint");
    expect(updated.cacheHit).toBe(false);
  });

  test("rejects a cache hit that points to a file", async () => {
    const options = { engine: "tantivy", cacheDir } as const;
    await searchContext(sources, "deployment", 1000, options);
    const [key] = readdirSync(cacheDir);
    expect(key).toMatch(/^index-[a-f0-9]+$/);
    const path = join(cacheDir, key!);
    rmSync(path, { force: true, recursive: true });
    writeFileSync(path, "not an index");
    await expect(searchContext(sources, "deployment", 1000, options)).rejects.toThrow("not a directory");
  });
});
