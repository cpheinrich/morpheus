import { rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changedFiles, parseHunkRanges, parseNameStatus } from "../src/complexity/diff.js";
import { isTouched, type FunctionRow } from "../src/complexity/evaluate.js";
import { commit, git, put, repo } from "./complexity-helpers.js";

const fn = (start: number, end: number, name = "f"): FunctionRow => ({ name, longName: name, start, end, ccn: 1, cognitive: 0, nloc: 1 });
const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n") + "\n";

describe("parseHunkRanges", () => {
  it("reads modified, added and single-line hunks as inclusive new-side ranges", () => {
    expect(parseHunkRanges("@@ -3,2 +3,4 @@\n@@ -9 +11 @@\n@@ -20,0 +23,2 @@")).toEqual([[3, 6], [11, 11], [23, 24]]);
  });

  it("maps a pure deletion to the two new lines either side of the gap", () => {
    expect(parseHunkRanges("@@ -10,3 +9,0 @@")).toEqual([[9, 10]]);
  });
});

describe("parseNameStatus", () => {
  it("reads -z output with renames and paths containing spaces, tabs and non-ASCII", () => {
    const out = ["M", "a b.ts", "R087", "old\tname.ts", "neü.ts", "D", "gone.ts", ""].join("\0");
    expect(parseNameStatus(out)).toEqual([
      { status: "M", path: "a b.ts" },
      { status: "R", from: "old\tname.ts", path: "neü.ts" },
      { status: "D", path: "gone.ts" },
    ]);
  });
});

describe("isTouched", () => {
  const target = (ranges: [number, number][]) => ({ path: "x", whole: false, ranges });

  it("touches a function at its first and last line, and not one line outside", () => {
    expect(isTouched(fn(5, 9), target([[5, 5]]), [])).toBe(true);
    expect(isTouched(fn(5, 9), target([[9, 9]]), [])).toBe(true);
    expect(isTouched(fn(5, 9), target([[4, 4]]), [])).toBe(false);
    expect(isTouched(fn(5, 9), target([[10, 10]]), [])).toBe(false);
  });

  it("touches a function from a deletion gap on either boundary", () => {
    // Deleted after new line 9: lines 9 and 10 border the gap.
    expect(isTouched(fn(10, 20), target([[9, 10]]), [])).toBe(true);
    expect(isTouched(fn(1, 9), target([[9, 10]]), [])).toBe(true);
    expect(isTouched(fn(11, 20), target([[9, 10]]), [])).toBe(false);
  });

  it("touches top-level code only when a changed line lies outside every function", () => {
    const global = fn(0, 30, "*global*");
    const inner = [fn(5, 9), fn(12, 20)];
    expect(isTouched(global, target([[6, 8]]), [global, ...inner])).toBe(false);
    expect(isTouched(global, target([[10, 11]]), [global, ...inner])).toBe(true);
    expect(isTouched(global, target([[8, 13]]), [global, ...inner])).toBe(true);
  });
});

describe("changedFiles", () => {
  it("includes untracked files whole, and committed, staged and unstaged edits by range", async () => {
    const root = await repo({ "a.js": lines(10), "b.js": lines(10), "c.js": lines(10) });
    await put(root, { "a.js": lines(10).replace("line 2\n", "two\n") });
    commit(root, "edit a");
    await put(root, { "b.js": lines(10).replace("line 4\n", "four\n") });
    git(root, "add", "b.js");
    await put(root, { "c.js": lines(10).replace("line 6\n", "six\n"), "new file.js": "x\n" });
    const changes = await changedFiles(root, "main");
    if (!changes.ok) throw new Error(changes.reason);
    const byPath = Object.fromEntries(changes.files.map((f) => [f.path, f]));
    expect(byPath["a.js"]).toEqual({ path: "a.js", whole: false, ranges: [[2, 2]] });
    expect(byPath["b.js"]).toEqual({ path: "b.js", whole: false, ranges: [[4, 4]] });
    expect(byPath["c.js"]).toEqual({ path: "c.js", whole: false, ranges: [[6, 6]] });
    expect(byPath["new file.js"]).toEqual({ path: "new file.js", whole: true, ranges: [] });
  });

  it("records a pure deletion as the gap it leaves, and a deleted file as deleted", async () => {
    const root = await repo({ "a.js": lines(20), "gone.js": "x\n" });
    await put(root, { "a.js": lines(20).replace("line 10\nline 11\nline 12\n", "") });
    await rm(join(root, "gone.js"));
    const changes = await changedFiles(root, "main");
    if (!changes.ok) throw new Error(changes.reason);
    expect(changes.files).toEqual([{ path: "a.js", whole: false, ranges: [[9, 10]] }]);
    expect(changes.deleted).toEqual(["gone.js"]);
  });

  it("maps a rename with edits to its new path and only the edited lines", async () => {
    const root = await repo({ "old.js": lines(30) });
    git(root, "mv", "old.js", "renamed.js");
    await put(root, { "renamed.js": lines(30).replace("line 15\n", "fifteen\n") });
    git(root, "add", "-A");
    const changes = await changedFiles(root, "main");
    if (!changes.ok) throw new Error(changes.reason);
    expect(changes.files).toEqual([{ path: "renamed.js", whole: false, ranges: [[15, 15]] }]);
  });

  it("handles paths with a space, a tab and non-ASCII literally", async () => {
    const names = ["dir one/a b.js", "tab\there.js", "neü.js", "glob*.js"];
    const root = await repo(Object.fromEntries(names.map((n) => [n, lines(5)])));
    await put(root, Object.fromEntries(names.map((n) => [n, lines(5).replace("line 3\n", "three\n")])));
    const changes = await changedFiles(root, "main");
    if (!changes.ok) throw new Error(changes.reason);
    expect(changes.files.map((f) => [f.path, f.ranges])).toEqual(
      [...names].sort().map((n) => [n, [[3, 3]]]).sort(),
    );
  });

  it("ignores a configured external diff tool and textconv filter", async () => {
    const root = await repo({ "a.js": lines(10) });
    git(root, "config", "diff.external", "/bin/false");
    git(root, "config", "diff.upper.textconv", "tr a-z A-Z");
    await writeFile(join(root, ".gitattributes"), "*.js diff=upper\n");
    commit(root, "attributes");
    await put(root, { "a.js": lines(10).replace("line 7\n", "seven\n") });
    const changes = await changedFiles(root, "main");
    if (!changes.ok) throw new Error(changes.reason);
    expect(changes.files.find((f) => f.path === "a.js")).toEqual({ path: "a.js", whole: false, ranges: [[7, 7]] });
  });

  it("keeps line numbers for a CRLF file", async () => {
    const crlf = lines(8).replace(/\n/g, "\r\n");
    const root = await repo({ "w.js": crlf });
    await put(root, { "w.js": crlf.replace("line 5\r\n", "five\r\n") });
    const changes = await changedFiles(root, "main");
    if (!changes.ok) throw new Error(changes.reason);
    expect(changes.files).toEqual([{ path: "w.js", whole: false, ranges: [[5, 5]] }]);
  });

  it("refuses rather than reporting nothing when the base does not exist", async () => {
    const root = await repo();
    const changes = await changedFiles(root, "no-such-ref");
    expect(changes.ok).toBe(false);
  });

  it("reports nothing changed as an empty list, not a failure", async () => {
    const root = await repo({ "a.js": lines(3) });
    await rename(join(root, "a.js"), join(root, "a.js"));
    expect(await changedFiles(root, "main")).toMatchObject({ ok: true, files: [], deleted: [] });
  });
});
