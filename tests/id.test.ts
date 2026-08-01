import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  datePart,
  isLegacyId,
  itemFilename,
  migratedId,
  parseRoadmapId,
  ROADMAP_ID,
  slugForFilename,
  timePart,
  timestampId,
} from "../src/pm/id.js";
import { migrate, planMigration, verifyOrder } from "../src/pm/migrate-ids.js";

const AT = (iso: string) => new Date(iso);

describe("timestamp ids", () => {
  it("reads as the date and time it was written", () => {
    const id = timestampId("MO", [], AT("2026-08-01T15:26:34"));
    expect(id).toBe("MO-260801-152634");
    expect(ROADMAP_ID.test(id)).toBe(true);
  });

  it("steps forward a second at a time when the clock repeats", () => {
    // The case that motivated the whole scheme: MO-049..052 were all created
    // in the same second by one decomposition fan-out.
    const taken: string[] = [];
    const now = AT("2026-08-01T15:26:34");
    for (let i = 0; i < 4; i++) taken.push(timestampId("MO", taken, now));

    expect(taken).toEqual([
      "MO-260801-152634",
      "MO-260801-152635",
      "MO-260801-152636",
      "MO-260801-152637",
    ]);
  });

  it("keeps allocation order sortable", () => {
    const taken: string[] = [];
    const now = AT("2026-08-01T15:26:34");
    for (let i = 0; i < 5; i++) taken.push(timestampId("MO", taken, now));

    expect([...taken].sort()).toEqual(taken);
  });

  it("needs no remote — two prefixes never interfere", () => {
    const at = AT("2026-08-01T09:00:00");
    expect(timestampId("EV", [], at)).toBe("EV-260801-090000");
    expect(timestampId("MO", [], at)).toBe("MO-260801-090000");
  });

  it("pads single-digit date and time parts", () => {
    const d = AT("2026-01-02T03:04:05");
    expect(datePart(d)).toBe("260102");
    expect(timePart(d)).toBe("030405");
  });
});

describe("legacy ids", () => {
  it("keeps the old number so git history still greps", () => {
    // Merged PR bodies and commit messages say MO-045 and cannot be rewritten.
    const id = migratedId("MO", "2026-07-29", 45);
    expect(id).toBe("MO-260729-045");
    expect(id).toContain("045");
    expect(ROADMAP_ID.test(id)).toBe(true);
  });

  it("uses the item's own creation date, not the migration date", () => {
    expect(migratedId("MO", "2026-07-28", 3)).toBe("MO-260728-003");
    expect(migratedId("MO", "2026-07-31", 46)).toBe("MO-260731-046");
  });

  it("is distinguishable from a timestamp id", () => {
    expect(isLegacyId("MO-260729-045")).toBe(true);
    expect(isLegacyId("MO-260801-152634")).toBe(false);
  });

  it("sorts before same-day timestamp ids without ambiguity", () => {
    const ids = ["MO-260801-152634", "MO-260801-045"].sort();
    expect(ids[0]).toBe("MO-260801-045");
  });
});

describe("ROADMAP_ID", () => {
  it("accepts all three shapes during the migration", () => {
    for (const id of ["MO-260801-152634", "MO-260729-045", "MO-045"]) {
      expect(ROADMAP_ID.test(id)).toBe(true);
    }
  });

  it("rejects malformed ids", () => {
    for (const id of ["MO-26080-152634", "mo-260801-152634", "MO-260801-15263", "MO-"]) {
      expect(ROADMAP_ID.test(id)).toBe(false);
    }
  });

  it("parses each shape into its parts", () => {
    expect(parseRoadmapId("MO-260801-152634")).toEqual({
      prefix: "MO",
      date: "260801",
      tail: "152634",
      legacy: false,
    });
    expect(parseRoadmapId("MO-045")).toBeNull();
  });
});

describe("slugForFilename", () => {
  it("cuts at a word boundary rather than mid-word", () => {
    // Measured: median real title slugifies to 47 characters, so most are cut.
    // `project-manageme` is what mid-word truncation produces.
    const s = slugForFilename("Project management package: schemas, parser, index generator", 24);
    expect(s).toBe("project-management");
    expect(s.endsWith("-")).toBe(false);
  });

  it("never exceeds the cap", () => {
    const s = slugForFilename("a".repeat(20) + " " + "b".repeat(80));
    expect(s.length).toBeLessThanOrEqual(64);
  });

  it("leaves a short title whole", () => {
    expect(slugForFilename("Reusable GitHub workflows")).toBe("reusable-github-workflows");
  });

  it("truncates a single long word rather than returning nothing", () => {
    // Falling back to a word boundary that does not exist would empty the slug.
    expect(slugForFilename("x".repeat(100), 20)).toBe("x".repeat(20));
  });

  it("drops punctuation and collapses separators", () => {
    expect(slugForFilename("/hq auth: Firebase custom claims")).toBe(
      "hq-auth-firebase-custom-claims",
    );
  });

  it("builds a filename with the id first, so the directory sorts by date", () => {
    expect(itemFilename("MO-260801-152634", "Blocked is a first-class outcome")).toBe(
      "MO-260801-152634-blocked-is-a-first-class-outcome.md",
    );
  });
});

describe("migration", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "migrate-"));
    await mkdir(join(dir, "roadmap"), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const item = (id: string, title: string, created: string) =>
    writeFile(
      join(dir, "roadmap", `${id}.md`),
      `---\nid: ${id}\ntitle: "${title}"\nstatus: shipped\npriority: P1\nowner: agent\nprs: [12]\ncreated: ${created}\nupdated: ${created}\n---\n\n## Context\n\nBody text.\n`,
      "utf8",
    );

  it("preserves order, which is the property the whole migration rests on", async () => {
    await item("MO-001", "First thing", "2026-07-28");
    await item("MO-010", "Tenth thing", "2026-07-29");
    await item("MO-045", "Forty-fifth thing", "2026-07-31");

    const plan = await planMigration(join(dir, "roadmap"));
    expect(verifyOrder(plan.renames)).toEqual([]);
    expect(plan.renames.map((r) => r.newId)).toEqual([
      "MO-260728-001",
      "MO-260729-010",
      "MO-260731-045",
    ]);
  });

  it("refuses outright if the rewrite would reorder the board", () => {
    // A later item with an earlier creation date inverts the sequence.
    const renames = [
      { oldId: "MO-001", newId: "MO-260731-001", oldFile: "a", newFile: "a" },
      { oldId: "MO-002", newId: "MO-260728-002", oldFile: "b", newFile: "b" },
    ];
    expect(verifyOrder(renames)).not.toEqual([]);
  });

  it("loses nothing — body, status, prs and title survive", async () => {
    await item("MO-045", "Forty-fifth thing", "2026-07-31");
    await migrate(join(dir, "roadmap"));

    const files = await readdir(join(dir, "roadmap"));
    expect(files).toEqual(["MO-260731-045-forty-fifth-thing.md"]);

    const text = await readFile(join(dir, "roadmap", files[0]!), "utf8");
    expect(text).toContain("id: MO-260731-045");
    expect(text).toContain('title: "Forty-fifth thing"');
    expect(text).toContain("status: shipped");
    expect(text).toContain("prs: [12]");
    expect(text).toContain("Body text.");
  });

  it("records the rename in the file, where a reader lands", async () => {
    await item("MO-045", "Forty-fifth thing", "2026-07-31");
    await migrate(join(dir, "roadmap"));

    const files = await readdir(join(dir, "roadmap"));
    const text = await readFile(join(dir, "roadmap", files[0]!), "utf8");
    expect(text).toContain("Migrated from `MO-045` to `MO-260731-045`");
  });

  it("is idempotent — a second run finds nothing to do", async () => {
    await item("MO-045", "Forty-fifth thing", "2026-07-31");
    await migrate(join(dir, "roadmap"));
    const again = await migrate(join(dir, "roadmap"));

    expect(again.renames).toEqual([]);
    expect(again.skipped).toEqual(["MO-260731-045"]);
  });

  it("writes nothing on --check", async () => {
    await item("MO-045", "Forty-fifth thing", "2026-07-31");
    const plan = await migrate(join(dir, "roadmap"), true);

    expect(plan.renames).toHaveLength(1);
    expect(plan.applied).toEqual([]);
    expect(await readdir(join(dir, "roadmap"))).toEqual(["MO-045.md"]);
  });

  it("refuses an item with no creation date rather than inventing one", async () => {
    await writeFile(
      join(dir, "roadmap", "MO-099.md"),
      `---\nid: MO-099\ntitle: "No date"\nstatus: backlog\n---\n\nBody.\n`,
      "utf8",
    );
    const plan = await planMigration(join(dir, "roadmap"));

    // A fabricated date reads as fact, which is worse than a failed migration.
    expect(plan.renames).toEqual([]);
    expect(plan.problems[0]).toContain("no usable");
  });
});
