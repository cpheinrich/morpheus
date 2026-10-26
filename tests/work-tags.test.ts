import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "@11ty/gray-matter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkTags, RoadmapItem, JournalEntry } from "../src/pm/schema.js";
import { parseArtifact } from "../src/pm/parse.js";
import { createItem } from "../src/pm/new-item.js";
import { taggedWork } from "../src/pm/tags.js";
import { block } from "../src/pm/block.js";
import { tagged, create } from "../src/cli/pm.js";
import { parseArgs } from "../src/cli/args.js";

let root: string;
let product: string;
const base = { id: "MO-123", title: "Recover delivery", status: "in-progress", created: "2026-10-25", updated: "2026-10-25" };
const entry = { date: "2026-10-25", agent: "codex", roadmap: "MO-123", outcome: "research", summary: "Artifact admission failed." };
const record = (data: unknown) => `---\n${Object.entries(data as object).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n\nActual body.\n`;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "morpheus-tags-"));
  product = join(root, "hq/product");
  await mkdir(join(product, "roadmap"), { recursive: true });
  await mkdir(join(root, ".agent/worklog"), { recursive: true });
});
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });

describe("subject tag shape", () => {
  it("preserves multiple open-vocabulary tags through both real frontmatter schemas", () => {
    const tags = ["engineering", "devops", "new-project-subject"];
    expect(RoadmapItem.parse(matter(record({ ...base, tags })).data).tags).toEqual(tags);
    expect(JournalEntry.parse(matter(record({ ...entry, tags })).data).tags).toEqual(tags);
  });
  it("keeps old records unclassified instead of inferring a subject", () => {
    expect(RoadmapItem.parse(base).tags).toBeUndefined();
    expect(JournalEntry.parse(entry).tags).toBeUndefined();
  });
  it.each(["devops", [""], ["DevOps"], [" devops"], ["devops "], ["a--b"], ["a/b"], ["-devops"], ["devops", "devops"], [17], [null], ["a".repeat(49)], Array.from({ length: 17 }, (_, n) => `tag-${n}`)].map((tags) => ({ tags })))("rejects malformed tags $tags", ({ tags }) => {
    expect(RoadmapItem.safeParse({ ...base, tags }).success).toBe(false);
    expect(JournalEntry.safeParse({ ...entry, tags }).success).toBe(false);
  });
  it("accepts exact limits and an explicitly empty classification", () => {
    const tags = ["a".repeat(48), ...Array.from({ length: 15 }, (_, n) => `tag-${n}`)];
    expect(WorkTags.parse(tags)).toEqual(tags);
    expect(WorkTags.parse([])).toEqual([]);
  });
});

it("writes repeated CLI intake tags as valid roadmap metadata", async () => {
  const flags = parseArgs(["pm", "new", "roadmap", "Recover release", "--tag", "engineering", "--tag", "devops"]);
  expect(flags.tags).toEqual(["engineering", "devops"]);
  expect(flags.positional).toEqual(["pm", "new", "roadmap", "Recover release"]);
  const created = await createItem({ productDir: product, cwd: root, prefix: "MO", kind: "roadmap", title: "Recover release", tags: flags.tags });
  const parsed = await parseArtifact(product, "roadmap");
  expect(parsed.issues).toEqual([]);
  expect(parsed.items.map((item) => ({ path: item.path, tags: item.data.tags }))).toEqual([{ path: created.path, tags: flags.tags }]);
});

it("refuses invalid intake before writing files, including missing flag values", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const flags = parseArgs(["pm", "new", "roadmap", "Release", "--tag"]);
  expect(flags.tags).toEqual([""]);
  expect(await create(product, "roadmap", "Release", { tags: flags.tags }, root)).toBe(1);
  await expect(createItem({ productDir: product, cwd: root, prefix: "MO", kind: "roadmap", title: "Release", tags: ["bad tag"] })).rejects.toThrow();
  expect(await parseArtifact(product, "roadmap")).toEqual({ items: [], issues: [] });
});

it("does not silently discard requested tags on unsupported record kinds", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await create(product, "requests", "Release", { tags: ["devops"] }, root)).toBe(1);
  await expect(createItem({ productDir: product, cwd: root, prefix: "MO", kind: "goals", title: "Release", tags: ["devops"] })).rejects.toThrow("Tags are supported on roadmap items and worklogs.");
});

it("retrieves all matching explicit roadmap and worklog subjects without rewriting untagged history", async () => {
  const taggedItem = join(product, "roadmap/MO-123.md");
  const taggedLog = join(root, ".agent/worklog/artifact.md");
  const untaggedLog = join(root, ".agent/worklog/old.md");
  const original = record(entry);
  await writeFile(taggedItem, record({ ...base, tags: ["engineering", "devops"] }));
  await writeFile(taggedLog, record({ ...entry, tags: ["engineering", "devops", "ios"] }));
  await writeFile(untaggedLog, original);
  await writeFile(join(product, "roadmap/MO-124.md"), record({ ...base, id: "MO-124", tags: ["engineering"] }));
  const result = await taggedWork(root, product, ["engineering", "devops"]);
  expect(result).toEqual({ items: [
    { kind: "worklog", path: taggedLog, roadmap: "MO-123", tags: ["engineering", "devops", "ios"], summary: entry.summary },
    { kind: "roadmap", path: taggedItem, roadmap: "MO-123", tags: ["engineering", "devops"], summary: base.title },
  ], issues: [], unclassifiedWorklogs: 1 });
  expect(await readFile(untaggedLog, "utf8")).toBe(original);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await tagged(product, root, ["devops"], true)).toBe(0);
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual(result);
});

it("keeps real legacy prose-only and partial-frontmatter worklogs unclassified", async () => {
  await writeFile(join(root, ".agent/worklog/prose.md"), "# Earlier incident\n\nBefore the journal schema.\n");
  await writeFile(join(root, ".agent/worklog/partial.md"), "---\nroadmap: MO-123\n---\n\nEarly checkpoint.\n");
  expect(await taggedWork(root, product, ["devops"])).toEqual({ items: [], issues: [], unclassifiedWorklogs: 2 });
});

it("reports malformed context as issues and nonzero, not a healthy empty result", async () => {
  const bad = join(root, ".agent/worklog/bad.md");
  await writeFile(bad, record({ ...entry, tags: "devops" }));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await tagged(product, root, ["devops"], true)).toBe(1);
  const output = JSON.parse(log.mock.calls[0]![0] as string);
  expect(output.items).toEqual([]);
  expect(output.issues).toHaveLength(1);
  expect(output.issues[0]).toEqual({ path: bad, message: expect.stringMatching(/^tags:/) });
});

it("requires a nonempty valid query and copies ticket tags into generated blocked worklogs", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await tagged(product, root, [], true)).toBe(1);
  expect(await tagged(product, root, ["DevOps"], true)).toBe(1);
  await writeFile(join(product, "roadmap/MO-123.md"), record({ ...base, tags: ["engineering", "devops"] }));
  const result = await block({ root, productDir: product, id: base.id, needs: "Verified new source funding", owner: "cpheinrich", agent: "codex" });
  const logPath = result.written.find((path) => path.includes("/.agent/worklog/"))!;
  expect(JournalEntry.parse(matter(await readFile(logPath, "utf8")).data).tags).toEqual(["engineering", "devops"]);
});
