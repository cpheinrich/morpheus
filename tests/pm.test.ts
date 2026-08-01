import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { parseClaimedNumbers } from "../src/pm/claim.js";
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

const execFileAsync = promisify(execFile);

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
    expect(issues[0]!.message).toContain("filename must start with the id");
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

  // Blocked sits second because it is the row a reader most needs to see:
  // nothing moves it without them.
  it("sorts blocked above review, backlog and shipped", async () => {
    await seed("roadmap", "MO-001", VALID_RM.replace("status: in-progress", "status: backlog"));
    await seed(
      "roadmap",
      "MO-002",
      VALID_RM.replace("MO-001", "MO-002").replace(
        "status: in-progress",
        "status: blocked\nneeds: which model",
      ),
    );
    await seed(
      "roadmap",
      "MO-003",
      VALID_RM.replace("MO-001", "MO-003").replace("status: in-progress", "status: review"),
    );

    const { items, issues } = await parseArtifact(product, "roadmap");
    expect(issues).toEqual([]);
    const rows = renderRoadmap(items).split("\n").slice(2);

    expect(rows[0]).toContain("MO-002"); // blocked
    expect(rows[1]).toContain("MO-003"); // review
    expect(rows[2]).toContain("MO-001"); // backlog
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
  // `product` is a bare temp directory with no git repo, so the remote lookup
  // fails and allocation falls back to local files — which is also the blind
  // case asserted below.
  it("allocates a roadmap id from the clock (MO-057)", async () => {
    const at = new Date("2026-08-01T15:26:34Z");
    expect((await nextId(product, "roadmap", "MO", product, at)).id).toBe("MO-2026-08-01-152634");
  });

  it("ignores what already exists — the clock, not the highest id, decides", async () => {
    await seed("roadmap", "MO-001", VALID_RM);
    await seed("roadmap", "MO-009", VALID_RM.replace("MO-001", "MO-009"));
    const at = new Date("2026-08-01T15:26:34Z");
    expect((await nextId(product, "roadmap", "MO", product, at)).id).toBe("MO-2026-08-01-152634");
  });

  it("is never blind for a roadmap id, because it asks no remote", async () => {
    // Sequential allocation had to consult origin and could fail to. A clock
    // needs no answer, so there is no unanswered question to report.
    expect((await nextId(product, "roadmap", "MO", product)).blind).toBe(false);
  });

  it("still reports blind for goals, which remain sequential", async () => {
    expect((await nextId(product, "goals", "MO", product)).blind).toBe(true);
  });

  it("creates a file that passes its own validation", async () => {
    const { path } = await createItem({
      productDir: product,
      kind: "roadmap",
      prefix: "MO",
      title: "Wire up analytics",
      priority: "P1",
      cwd: product,
    });
    // Filename carries a slug so the directory is readable; the id does not.
    expect(path).toMatch(/MO-\d{4}-\d{2}-\d{2}-\d{6}-wire-up-analytics\.md$/);

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
      cwd: product,
    });

    const { items, issues } = await parseArtifact(product, "roadmap");
    expect(issues).toHaveLength(0);
    expect(items[0]!.data.title).toBe("PM package: schemas, parser, CLI");
  });

  it("omits optional fields it was not given", async () => {
    await createItem({
      productDir: product,
      kind: "roadmap",
      prefix: "MO",
      title: "No goal",
      cwd: product,
    });
    const [file] = (await readdir(join(product, "roadmap"))).filter((f) => f.endsWith(".md"));
    const raw = await readFile(join(product, "roadmap", file!), "utf8");
    expect(raw).not.toContain("goal:");
  });
});

/**
 * The one place this suite builds a real git repo.
 *
 * The bug being fixed is precisely that allocation never asked the remote, so a
 * test that stubs the remote would pass against the broken code too. Nothing
 * cheaper than a real `ls-remote` proves it.
 */
async function originHolding(...branches: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "morpheus-origin-"));
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  await mkdir(work, { recursive: true });

  const git = (args: string[], cwd = work) => execFileAsync("git", args, { cwd });
  await execFileAsync("git", ["init", "--bare", "--quiet", origin]);
  await git(["init", "--quiet"]);
  await git(["config", "user.email", "test@example.com"]);
  await git(["config", "user.name", "Test"]);
  await git(["config", "commit.gpgsign", "false"]);
  await git(["commit", "--allow-empty", "--quiet", "-m", "init"]);
  await git(["remote", "add", "origin", origin]);
  for (const b of ["main", ...branches]) {
    await git(["push", "--quiet", "origin", `HEAD:refs/heads/${b}`]);
  }
  return work;
}

describe("allocation consults the remote", () => {
  // Roadmap ids no longer consult the remote (MO-057): a fork contributor's
  // `origin` is their fork, so no query can tell them which ids Morpheus has
  // issued. Goals and requests stay sequential and still ask.
  it("skips a goal id another session holds on a branch but has not merged", async () => {
    const cwd = await originHolding("mo-g-038-a-goal");

    // Nothing on disk — the state a fresh clone is in while the claim is live.
    const { id, blind } = await nextId(product, "goals", "MO", cwd);
    expect(id).toBe("MO-G-039");
    expect(blind).toBe(false);
  });

  it("takes the higher of what merged and what is claimed", async () => {
    const cwd = await originHolding("mo-g-040-shipped", "mo-g-038-still-open");

    expect((await nextId(product, "goals", "MO", cwd)).id).toBe("MO-G-041");
  });

  it("does not let a request branch bump a goal id", async () => {
    const cwd = await originHolding("mo-fr-009-a-request");

    expect((await nextId(product, "goals", "MO", cwd)).id).toBe("MO-G-001");
  });

  it("allocates a roadmap id without asking origin at all", async () => {
    // The point of MO-057: an id that needs no answer cannot be given a wrong
    // one, so a branch nobody can see cannot cause a collision.
    const cwd = await originHolding("mo-2026-08-01-152634-something");
    const at = new Date("2026-08-01T15:26:34Z");

    const { id, blind } = await nextId(product, "roadmap", "MO", cwd, at);
    expect(id).toBe("MO-2026-08-01-152634");
    expect(blind).toBe(false);
  });
});

describe("parseClaimedNumbers", () => {
  const line = (branch: string) => `abc123\trefs/heads/${branch}`;

  it("reads the sequence number out of a claim branch", () => {
    expect(parseClaimedNumbers(line("mo-038-some-slug"), "MO-")).toEqual([38]);
  });

  it("ignores the goal and request branches that share the mo- prefix", () => {
    const out = [line("mo-038-a"), line("mo-g-900-b"), line("mo-fr-900-c")].join("\n");
    expect(parseClaimedNumbers(out, "MO-")).toEqual([38]);
  });

  it("matches goal branches when asked for the goal prefix", () => {
    const out = [line("mo-038-a"), line("mo-g-007-b")].join("\n");
    expect(parseClaimedNumbers(out, "MO-G-")).toEqual([7]);
  });

  it("ignores main and any branch that stakes no id", () => {
    const out = [line("main"), line("fix-the-thing"), line("mo-nope-x")].join("\n");
    expect(parseClaimedNumbers(out, "MO-")).toEqual([]);
  });

  it("is empty for empty output, which is a real answer and not a failure", () => {
    expect(parseClaimedNumbers("", "MO-")).toEqual([]);
  });
});

describe("YAML scalars that are not strings", () => {
  it("accepts a numeric goal target, because that is what people write", () => {
    const parsed = Goal.safeParse({
      id: "EV-G-2026-Q3-01",
      title: "Ship the first version",
      horizon: "quarterly",
      period: "2026-Q3",
      metric: "Paying users",
      target: 100,
      current: 0,
      status: "on-track",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.target).toBe("100");
      expect(parsed.data.current).toBe("0");
    }
  });

  it("still rejects an empty target", () => {
    const parsed = Goal.safeParse({
      id: "EV-G-2026-Q3-01",
      title: "Ship the first version",
      horizon: "quarterly",
      period: "2026-Q3",
      metric: "Paying users",
      target: "",
      status: "on-track",
    });

    expect(parsed.success).toBe(false);
  });
});
