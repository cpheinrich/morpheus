import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { accessible, readIfExists, readJson, scaffoldWriter } from "../src/file-io.js";
import { markdownTable } from "../src/markdown.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() { const root = await mkdtemp(join(tmpdir(), "morpheus-helper-")); roots.push(root); return root; }

describe("shared file contracts", () => {
  it("distinguishes missing content from a read failure", async () => {
    const root = await fixture();
    expect(await readIfExists(join(root, "missing"))).toBeNull();
    await writeFile(join(root, "empty"), "");
    expect(await readIfExists(join(root, "empty"))).toBe("");
    await writeFile(join(root, "content"), "authored\n");
    expect(await readIfExists(join(root, "content"))).toBe("authored\n");
    await expect(readIfExists(root)).rejects.toMatchObject({ code: "EISDIR" });
  });
  it("keeps best-effort discovery distinct from strict content reads", async () => {
    const root = await fixture();
    expect(await accessible(root)).toBe(true);
    expect(await accessible(join(root, "missing"))).toBe(false);
    expect(await readJson(root)).toBeNull();
    expect(await readJson(join(root, "missing"))).toBeNull();
    await writeFile(join(root, "invalid"), "{");
    expect(await readJson(join(root, "invalid"))).toBeNull();
    await writeFile(join(root, "valid"), '{"name":"authored"}');
    expect(await readJson(join(root, "valid"))).toEqual({ name: "authored" });
  });
  it("shares scaffold bookkeeping while preserving existing files and order", async () => {
    const root = await fixture(); const written: string[] = []; const skipped: string[] = [];
    const put = scaffoldWriter(root, written, skipped);
    await put("nested/new.md", "first");
    await put("nested/new.md", "replacement");
    await mkdir(join(root, "directory"));
    await put("directory", "replacement");
    expect(await readFile(join(root, "nested/new.md"), "utf8")).toBe("first");
    expect(written).toEqual(["nested/new.md"]);
    expect(skipped).toEqual(["nested/new.md", "directory"]);
    await expect(put("nested/new.md/child", "impossible")).rejects.toBeDefined();
    expect(written).toEqual(["nested/new.md"]);
  });
});
it("preserves each consumer's empty-table and escaping policy", () => {
  expect(markdownTable(["A", "B"], [["x\\|y", "z"]])).toBe("| A | B |\n|---|---|\n| x\\|y | z |");
  expect(markdownTable(["A"], [])).toBe("| A |\n|---|");
  expect(markdownTable(["A"], [], "_Nothing here yet._")).toBe("_Nothing here yet._");
});
