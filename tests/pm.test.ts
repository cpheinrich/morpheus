import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { findDuplicateIds, parseArtifact, parseDir } from "../src/pm/parse.js";
import {
  BEGIN,
  END,
  renderRoadmap,
  spliceIndex,
  writeIndex,
} from "../src/pm/index-gen.js";
import { createItem, nextId } from "../src/pm/new-item.js";
import { Goal, RoadmapItem } from "../src/pm/schema.js";

let product: string;

async function seed(kind: string, id: string, frontmatter: string, body = "Body.") {
  const dir = join(product, kind);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}.md`), `---\n${frontmatter}\n---\n\n${body}\n`);
}

const VALID_RM = `id: MO-001
title: Ship the parser
status: in-progress
priority: P1
owner: agent
prs: [12]
created: 2026-07-01
updated: 2026-07-28`;

beforeEach(async () => {
  product = await mkdtemp(join(tmpdir(), "morpheus-pm-"));
});

describe("schema", () => {
  it("applies defaults for optional fields", () => {
    const parsed = RoadmapItem.parse({
      id: "MO-002",
      title: "Something",
      status: "backlog",
      created: "2026-07-01",
      updated: "2026-07-01",
    });
    expect(parsed.priority).toBe("P2");
    expect(parsed.owner).toBe("agent");
    expect(parsed.prs).toEqual([]);
  });

  it("rejects a malformed id", () => {
    const r = RoadmapItem.safeParse({
      id: "M-1",
      title: "Too short an id",
      status: "backlog",
      created: "2026-07-01",
      updated: "2026-07-01",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown status", () => {
    const r = RoadmapItem.safeParse({
      id: "MO-003",
      title: "Bad status",
      status: "wip",
      created: "2026-07-01",
      updated: "2026-07-01",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-ISO date", () => {
    const r = RoadmapItem.safeParse({
      id: "MO-004",
      title: "Bad date",
      status: "backlog",
      created: "July 1st",
      updated: "2026-07-01",
    });
    expect(r.success).toBe(false);
  });

  it("validates a goal id shape", () => {
    expect(Goal.safeParse({
      id: "MO-G-2026-Q3-01",
      title: "Ship Morpheus v1",
      horizon: "quarterly",
      period: "2026-Q3",
      metric: "projects scaffolded",
      target: "2",
      status: "on-track",
    }).success).toBe(true);

    expect(Goal.safeParse({
      id: "MO-G-2026-Q5-01",
      title: "Impossible quarter",
      horizon: "quarterly",
      period: "2026-Q5",
      metric: "x",
      target: "1",
      status: "on-track",
    }).success).toBe(false);
  });
});

describe("parse", () => {
  it("parses a valid item and strips frontmatter from the body", async () => {
    await seed("roadmap", "MO-001", VALID_RM, "## Context\n\nWhy it matters.");
    const { items, issues } = await parseArtifact(product, "roadmap");

    expect(issues).toHaveLength(0);
    expect(items).toHaveLength(1);
    expect(items[0]!.data.title).toBe("Ship the parser");
    expect(items[0]!.data.prs).toEqual([12]);
    expect(items[0]!.body).toContain("Why it matters.");
    expect(items[0]!.body).not.toContain("id: MO-001");
  });

  it("returns an issue instead of throwing on invalid frontmatter", async () => {
    await seed("roadmap", "MO-002", "id: MO-002\ntitle: x\nstatus: nope");
    const { items, issues } = await parseArtifact(product, "roadmap");

    expect(items).toHaveLength(0);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("reports every invalid file rather than stopping at the first", async () => {
    await seed("roadmap", "MO-002", "id: MO-002\ntitle: x\nstatus: nope");
    await seed("roadmap", "MO-003", "id: MO-003\ntitle: y\nstatus: also-nope");
    const { issues } = await parseArtifact(product, "roadmap");

    const paths = new Set(issues.map((i) => i.path));
    expect(paths.size).toBe(2);
  });

  it("flags a filename that does not match its id", async () => {
    const dir = join(product, "roadmap");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "wrong-name.md"), `---\n${VALID_RM}\n---\n\nBody.\n`);

    const { items, issues } = await parseArtifact(product, "roadmap");
    expect(items).toHaveLength(0);
    expect(issues[0]!.message).toContain("filename must match id");
  });

  it("ignores the generated README", async () => {
    await seed("roadmap", "MO-001", VALID_RM);
    await writeFile(join(product, "roadmap", "README.md"), "# Roadmap\n");

    const { items, issues } = await parseArtifact(product, "roadmap");
    expect(items).toHaveLength(1);
    expect(issues).toHaveLength(0);
  });

  it("reports malformed YAML as an issue instead of throwing", async () => {
    // An unquoted colon in a title is the common real-world case.
    await seed("roadmap", "MO-005", "id: MO-005\ntitle: Package: schemas and parser\nstatus: backlog");
    const { items, issues } = await parseArtifact(product, "roadmap");

    expect(items).toHaveLength(0);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("invalid YAML frontmatter");
  });

  it("keeps parsing valid files when one has malformed YAML", async () => {
    await seed("roadmap", "MO-001", VALID_RM);
    await seed("roadmap", "MO-005", "id: MO-005\ntitle: Bad: yaml\nstatus: backlog");
    const { items, issues } = await parseArtifact(product, "roadmap");

    expect(items).toHaveLength(1);
    expect(issues).toHaveLength(1);
  });

  it("returns empty for a directory that does not exist", async () => {
    const { items, issues } = await parseArtifact(product, "requests");
    expect(items).toHaveLength(0);
    expect(issues).toHaveLength(0);
  });

  it("detects duplicate ids across files", async () => {
    const dir = join(product, "roadmap");
    await mkdir(dir, { recursive: true });
    // Same id, two files — filename check passes for one, so force both valid.
    await writeFile(join(dir, "MO-001.md"), `---\n${VALID_RM}\n---\n`);
    const { items } = await parseDir(dir, RoadmapItem);
    const doubled = [...items, { ...items[0]!, path: join(dir, "copy.md") }];

    expect(findDuplicateIds(doubled)).toHaveLength(1);
  });
});

describe("index generation", () => {
  it("orders in-progress before backlog before shipped", async () => {
    await seed("roadmap", "MO-001", VALID_RM.replace("status: in-progress", "status: shipped"));
    await seed("roadmap", "MO-002", VALID_RM.replace("MO-001", "MO-002"));
    await seed(
      "roadmap",
      "MO-003",
      VALID_RM.replace("MO-001", "MO-003").replace("status: in-progress", "status: backlog"),
    );

    const { items } = await parseArtifact(product, "roadmap");
    const rows = renderRoadmap(items).split("\n").slice(2);

    expect(rows[0]).toContain("MO-002"); // in-progress
    expect(rows[1]).toContain("MO-003"); // backlog
    expect(rows[2]).toContain("MO-001"); // shipped
  });

  it("renders a placeholder when there are no items", () => {
    expect(renderRoadmap([])).toContain("Nothing here yet");
  });

  it("escapes pipes so a title cannot break the table", async () => {
    await seed("roadmap", "MO-001", VALID_RM.replace("Ship the parser", "A | B"));
    const { items } = await parseArtifact(product, "roadmap");
    expect(renderRoadmap(items)).toContain("A \\| B");
  });

  it("links each id to its own file", async () => {
    await seed("roadmap", "MO-001", VALID_RM);
    const { items } = await parseArtifact(product, "roadmap");
    expect(renderRoadmap(items)).toContain("[MO-001](./MO-001.md)");
  });

  it("replaces only the marked block, preserving surrounding prose", () => {
    const existing = `# Roadmap\n\nIntro prose.\n\n${BEGIN}\nOLD\n${END}\n\nTrailing note.\n`;
    const next = spliceIndex(existing, "NEW");

    expect(next).toContain("Intro prose.");
    expect(next).toContain("Trailing note.");
    expect(next).toContain("NEW");
    expect(next).not.toContain("OLD");
  });

  it("appends rather than clobbering a README with no markers", () => {
    const next = spliceIndex("# Roadmap\n\nHand-written.\n", "TABLE");
    expect(next).toContain("Hand-written.");
    expect(next).toContain("TABLE");
  });

  it("reports no change on a second identical write", async () => {
    await seed("roadmap", "MO-001", VALID_RM);
    const { items } = await parseArtifact(product, "roadmap");
    const dir = join(product, "roadmap");
    const rendered = renderRoadmap(items);

    expect(await writeIndex(dir, rendered)).toBe(true);
    expect(await writeIndex(dir, rendered)).toBe(false);
  });
});

describe("new item", () => {
  it("allocates MO-001 in an empty directory", async () => {
    expect(await nextId(product, "roadmap", "MO")).toBe("MO-001");
  });

  it("allocates the next id after the highest existing one", async () => {
    await seed("roadmap", "MO-001", VALID_RM);
    await seed("roadmap", "MO-009", VALID_RM.replace("MO-001", "MO-009"));
    expect(await nextId(product, "roadmap", "MO")).toBe("MO-010");
  });

  it("creates a file that passes its own validation", async () => {
    const path = await createItem({
      productDir: product,
      kind: "roadmap",
      prefix: "MO",
      title: "Wire up analytics",
      priority: "P1",
    });
    expect(path).toContain("MO-001.md");

    const { items, issues } = await parseArtifact(product, "roadmap");
    expect(issues).toHaveLength(0);
    expect(items[0]!.data.title).toBe("Wire up analytics");
    expect(items[0]!.data.priority).toBe("P1");
  });

  it("quotes a title containing a colon so the YAML stays valid", async () => {
    await createItem({
      productDir: product,
      kind: "roadmap",
      prefix: "MO",
      title: "PM package: schemas, parser, CLI",
    });

    const { items, issues } = await parseArtifact(product, "roadmap");
    expect(issues).toHaveLength(0);
    expect(items[0]!.data.title).toBe("PM package: schemas, parser, CLI");
  });

  it("omits optional fields it was not given", async () => {
    await createItem({ productDir: product, kind: "roadmap", prefix: "MO", title: "No goal" });
    const raw = await readFile(join(product, "roadmap", "MO-001.md"), "utf8");
    expect(raw).not.toContain("goal:");
  });
});
