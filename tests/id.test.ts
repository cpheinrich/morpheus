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

// Fixtures are explicitly UTC. A timezone-less string is parsed as *local* by
// JS, so these would drift with the machine running them — and a test that
// passes for the wrong reason is the one that hides a timezone bug.
const AT = (iso: string) => new Date(`${iso}Z`);

describe("timestamp ids", () => {
  it("reads as the date and time it was written", () => {
    const id = timestampId("MO", [], AT("2026-08-01T15:26:34"));
    expect(id).toBe("MO-2026-08-01-15.26.34");
    expect(ROADMAP_ID.test(id)).toBe(true);
  });

  it("steps forward a second at a time when the clock repeats", () => {
    // The case that motivated the whole scheme: MO-049..052 were all created
    // in the same second by one decomposition fan-out.
    const taken: string[] = [];
    const now = AT("2026-08-01T15:26:34");
    for (let i = 0; i < 4; i++) taken.push(timestampId("MO", taken, now));

    expect(taken).toEqual([
      "MO-2026-08-01-15.26.34",
      "MO-2026-08-01-15.26.35",
      "MO-2026-08-01-15.26.36",
      "MO-2026-08-01-15.26.37",
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
    expect(timestampId("EV", [], at)).toBe("EV-2026-08-01-09.00.00");
    expect(timestampId("MO", [], at)).toBe("MO-2026-08-01-09.00.00");
  });

  it("pads single-digit date and time parts", () => {
    const d = AT("2026-01-02T03:04:05");
    expect(datePart(d)).toBe("2026-01-02");
    expect(timePart(d)).toBe("03.04.05");
  });

  describe("timezone", () => {
    // CI runs in UTC, where local time and UTC are identical — so a fixture
    // alone cannot tell them apart, and a regression to local time would pass
    // CI silently. These force a non-UTC zone so the distinction is real
    // wherever the suite runs.
    const original = process.env.TZ;
    beforeEach(() => {
      process.env.TZ = "America/Los_Angeles";
    });
    afterEach(() => {
      process.env.TZ = original;
    });

    it("uses UTC, not the machine's local time", () => {
      // 00:30 UTC on the 2nd is 17:30 local on the 1st — a different day.
      const id = timestampId("MO", [], new Date("2026-08-02T00:30:00Z"));
      expect(id).toBe("MO-2026-08-02-00.30.00");
    });

    it("agrees with the `created:` field written beside it", () => {
      // `created:` is toISOString().slice(0,10) — already UTC. An id on a
      // different day from the date in its own frontmatter is the bug this
      // catches, and it is what the first draft did.
      const d = new Date("2026-08-02T00:30:00Z");
      const created = d.toISOString().slice(0, 10); // 2026-08-02

      // The id embeds the same ISO date verbatim, so this compares the two
      // fields against one source rather than against a restated constant.
      expect(timestampId("MO", [], d)).toContain(created);
    });

    it("keeps ordering correct across timezones", () => {
      // Tokyo 09:00 (00:00 UTC) is written *before* Los Angeles 18:00 the
      // "previous" day (01:00 UTC). Under local time the ids invert.
      const tokyo = timestampId("MO", [], new Date("2026-08-02T00:00:00Z"));
      const la = timestampId("MO", [], new Date("2026-08-02T01:00:00Z"));

      expect([la, tokyo].sort()).toEqual([tokyo, la]);
    });
  });
});

describe("legacy ids", () => {
  it("keeps the old number so git history still greps", () => {
    // Merged PR bodies and commit messages say MO-045 and cannot be rewritten.
    const id = migratedId("MO", "2026-07-29", 45);
    expect(id).toBe("MO-2026-07-29-045");
    expect(id).toContain("045");
    expect(ROADMAP_ID.test(id)).toBe(true);
  });

  it("uses the item's own creation date, not the migration date", () => {
    expect(migratedId("MO", "2026-07-28", 3)).toBe("MO-2026-07-28-003");
    expect(migratedId("MO", "2026-07-31", 46)).toBe("MO-2026-07-31-046");
  });

  it("is distinguishable from a timestamp id", () => {
    expect(isLegacyId("MO-2026-07-29-045")).toBe(true);
    expect(isLegacyId("MO-2026-08-01-15.26.34")).toBe(false);
  });

  it("sorts before same-day timestamp ids without ambiguity", () => {
    const ids = ["MO-2026-08-01-15.26.34", "MO-2026-08-01-045"].sort();
    expect(ids[0]).toBe("MO-2026-08-01-045");
  });
});

describe("ROADMAP_ID", () => {
  it("accepts all three shapes during the migration", () => {
    for (const id of ["MO-2026-08-01-15.26.34", "MO-2026-07-29-045", "MO-045"]) {
      expect(ROADMAP_ID.test(id)).toBe(true);
    }
  });

  it("rejects malformed ids", () => {
    for (const id of ["MO-2026-8-01-152634", "mo-2026-08-01-152634", "MO-2026-08-01-15.26.3", "MO-"]) {
      expect(ROADMAP_ID.test(id)).toBe(false);
    }
  });

  it("parses each shape into its parts", () => {
    expect(parseRoadmapId("MO-2026-08-01-15.26.34")).toEqual({
      prefix: "MO",
      date: "2026-08-01",
      tail: "15.26.34",
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
    expect(itemFilename("MO-2026-08-01-15.26.34", "Blocked is a first-class outcome")).toBe(
      "MO-2026-08-01-15.26.34-blocked-is-a-first-class-outcome.md",
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
      "MO-2026-07-28-001",
      "MO-2026-07-29-010",
      "MO-2026-07-31-045",
    ]);
  });

  it("refuses outright if the rewrite would reorder the board", () => {
    // A later item with an earlier creation date inverts the sequence.
    const renames = [
      { oldId: "MO-001", newId: "MO-2026-07-31-001", oldFile: "a", newFile: "a" },
      { oldId: "MO-002", newId: "MO-2026-07-28-002", oldFile: "b", newFile: "b" },
    ];
    expect(verifyOrder(renames)).not.toEqual([]);
  });

  it("loses nothing — body, status, prs and title survive", async () => {
    await item("MO-045", "Forty-fifth thing", "2026-07-31");
    await migrate(join(dir, "roadmap"));

    const files = await readdir(join(dir, "roadmap"));
    expect(files).toEqual(["MO-2026-07-31-045-forty-fifth-thing.md"]);

    const text = await readFile(join(dir, "roadmap", files[0]!), "utf8");
    expect(text).toContain("id: MO-2026-07-31-045");
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
    expect(text).toContain("Migrated from `MO-045` to `MO-2026-07-31-045`");
  });

  it("is idempotent — a second run finds nothing to do", async () => {
    await item("MO-045", "Forty-fifth thing", "2026-07-31");
    await migrate(join(dir, "roadmap"));
    const again = await migrate(join(dir, "roadmap"));

    expect(again.renames).toEqual([]);
    expect(again.skipped).toEqual(["MO-2026-07-31-045"]);
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
