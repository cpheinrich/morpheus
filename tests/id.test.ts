import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  datePart,
  isLegacyId,
  cleanSlug,
  itemFilename,
  migratedId,
  parseRoadmapId,
  ROADMAP_ID,
  slugForFilename,
  timePart,
  timestampId,
} from "../src/pm/id.js";
import { migrate, planMigration, verifyOrder } from "../src/pm/migrate-ids.js";
import { headSha } from "../src/pm/git-sha.js";

// Ids render in a fixed Pacific zone, so fixtures are given as the UTC instant
// and expectations are written in Pacific. A timezone-less string would be
// parsed as *local* by JS and drift with the machine running the suite.
const AT = (iso: string) => new Date(`${iso}Z`);

describe("timestamp ids", () => {
  it("reads as the date and time it was written", () => {
    const id = timestampId("MO", [], AT("2026-08-01T15:26:34"));
    expect(id).toBe("MO-26-08-01-08.26.34");
    expect(ROADMAP_ID.test(id)).toBe(true);
  });

  it("steps forward a second at a time when the clock repeats", () => {
    // The case that motivated the whole scheme: MO-049..052 were all created
    // in the same second by one decomposition fan-out.
    const taken: string[] = [];
    const now = AT("2026-08-01T15:26:34");
    for (let i = 0; i < 4; i++) taken.push(timestampId("MO", taken, now));

    expect(taken).toEqual([
      "MO-26-08-01-08.26.34",
      "MO-26-08-01-08.26.35",
      "MO-26-08-01-08.26.36",
      "MO-26-08-01-08.26.37",
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
    expect(timestampId("EV", [], at)).toBe("EV-26-08-01-02.00.00");
    expect(timestampId("MO", [], at)).toBe("MO-26-08-01-02.00.00");
  });

  it("pads single-digit date and time parts", () => {
    // 03:04:05Z on 2 Jan is 19:04:05 Pacific on 1 Jan — PST, UTC-8.
    const d = AT("2026-01-02T03:04:05");
    expect(datePart(d)).toBe("26-01-01");
    expect(timePart(d)).toBe("19.04.05");
  });

  describe("timezone", () => {
    // Pacific is applied on *every* machine, not the author's local zone. That
    // is the whole point: ordering is meaningless if two authors measure from
    // different origins. These flip process.env.TZ to prove the output does
    // not move with it — on a UTC runner a local-time implementation would
    // otherwise look correct.
    const original = process.env.TZ;
    afterEach(() => {
      process.env.TZ = original;
    });

    it("renders in Pacific regardless of the machine's zone", () => {
      const d = new Date("2026-08-02T00:30:00Z"); // 17:30 Pacific on 1 Aug
      for (const tz of ["UTC", "Asia/Tokyo", "America/New_York"]) {
        process.env.TZ = tz;
        expect(timestampId("MO", [], d)).toBe("MO-26-08-01-17.30.00");
      }
    });

    it("keeps ordering correct across authors in different zones", () => {
      // One fixed origin means two instants always compare the same way.
      const earlier = timestampId("MO", [], new Date("2026-08-02T00:00:00Z"));
      const later = timestampId("MO", [], new Date("2026-08-02T01:00:00Z"));
      expect([later, earlier].sort()).toEqual([earlier, later]);
    });

    it("handles a UTC instant that falls on the previous Pacific day", () => {
      // The case that made local time and `created:` disagree.
      expect(datePart(new Date("2026-08-02T05:00:00Z"))).toBe("26-08-01");
    });
  });
});

describe("legacy ids", () => {
  it("keeps the old number so git history still greps", () => {
    // Merged PR bodies and commit messages say MO-045 and cannot be rewritten.
    const id = migratedId("MO", "2026-07-29", 45);
    expect(id).toBe("MO-26-07-29-045");
    expect(id).toContain("045");
    expect(ROADMAP_ID.test(id)).toBe(true);
  });

  it("uses the item's own creation date, not the migration date", () => {
    expect(migratedId("MO", "2026-07-28", 3)).toBe("MO-26-07-28-003");
    expect(migratedId("MO", "2026-07-31", 46)).toBe("MO-26-07-31-046");
  });

  it("is distinguishable from a timestamp id", () => {
    expect(isLegacyId("MO-26-07-29-045")).toBe(true);
    expect(isLegacyId("MO-26-08-01-15.26.34")).toBe(false);
  });

  it("sorts before same-day timestamp ids without ambiguity", () => {
    const ids = ["MO-26-08-01-15.26.34", "MO-26-08-01-045"].sort();
    expect(ids[0]).toBe("MO-26-08-01-045");
  });
});

describe("ROADMAP_ID", () => {
  it("accepts all three shapes during the migration", () => {
    for (const id of ["MO-26-08-01-15.26.34", "MO-26-07-29-045", "MO-045"]) {
      expect(ROADMAP_ID.test(id)).toBe(true);
    }
  });

  it("rejects malformed ids", () => {
    for (const id of ["MO-26-8-01-15.26.34", "mo-26-08-01-15.26.34", "MO-26-08-01-15.26.3", "MO-"]) {
      expect(ROADMAP_ID.test(id)).toBe(false);
    }
  });

  it("parses each shape into its parts", () => {
    expect(parseRoadmapId("MO-26-08-01-15.26.34")).toEqual({
      prefix: "MO",
      date: "26-08-01",
      tail: "15.26.34",
      legacy: false,
    });
    expect(parseRoadmapId("MO-045")).toBeNull();
  });
});

describe("slugForFilename", () => {
  it("abbreviates and drops stop words, keeping four words at most", () => {
    // A slug is a handle, not a summary — 32 characters, verb-noun shaped.
    const s = slugForFilename("Project management package: schemas, parser, index generator");
    expect(s).toBe("project-mgmt-pkg-schemas");
    expect(s.endsWith("-")).toBe(false);
    expect(s.length).toBeLessThanOrEqual(32);
  });

  it("takes a hand-chosen slug verbatim, only sanitising its shape", () => {
    // No sentence reliably reduces to verb-noun, so the caller's wording wins.
    expect(cleanSlug("update-roadmap-ids")).toBe("update-roadmap-ids");
    expect(cleanSlug("Fix Photo Picker!")).toBe("fix-photo-picker");
  });

  it("never ends on a stop word or a dangling negation", () => {
    expect(slugForFilename("A study of the effects of and")).toBe("study-effects");
    expect(slugForFilename("Roadmap ids become timestamps not")).not.toMatch(/-not$/);
  });

  it("keeps a negation that still has something to negate", () => {
    expect(slugForFilename("Blocked is not an outcome without needs")).toContain("not");
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
    expect(slugForFilename("/hq auth: Firebase custom claims")).toBe("hq-auth-firebase-custom");
  });

  it("builds a filename with the id first, so the directory sorts by date", () => {
    expect(itemFilename("MO-26-08-01-15.26.34", "Blocked is a first-class outcome")).toBe(
      "MO-26-08-01-15.26.34-blocked-first-class-outcome.md",
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
      "MO-26-07-28-001",
      "MO-26-07-29-010",
      "MO-26-07-31-045",
    ]);
  });

  it("refuses outright if the rewrite would reorder the board", () => {
    // A later item with an earlier creation date inverts the sequence.
    const renames = [
      { oldId: "MO-001", newId: "MO-26-07-31-001", oldFile: "a", newFile: "a" },
      { oldId: "MO-002", newId: "MO-26-07-28-002", oldFile: "b", newFile: "b" },
    ];
    expect(verifyOrder(renames)).not.toEqual([]);
  });

  it("loses nothing — body, status, prs and title survive", async () => {
    await item("MO-045", "Forty-fifth thing", "2026-07-31");
    await migrate(join(dir, "roadmap"));

    const files = await readdir(join(dir, "roadmap"));
    expect(files).toEqual(["MO-26-07-31-045-forty-fifth-thing.md"]);

    const text = await readFile(join(dir, "roadmap", files[0]!), "utf8");
    expect(text).toContain("id: MO-26-07-31-045");
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
    expect(text).toContain("Migrated from `MO-045` to `MO-26-07-31-045`");
  });

  it("is idempotent — a second run finds nothing to do", async () => {
    await item("MO-045", "Forty-fifth thing", "2026-07-31");
    await migrate(join(dir, "roadmap"));
    const again = await migrate(join(dir, "roadmap"));

    expect(again.renames).toEqual([]);
    expect(again.skipped).toEqual(["MO-26-07-31-045"]);
  });

  it("writes nothing on --check", async () => {
    await item("MO-045", "Forty-fifth thing", "2026-07-31");
    const plan = await migrate(join(dir, "roadmap"), true);

    expect(plan.renames).toHaveLength(1);
    expect(plan.applied).toEqual([]);
    expect(await readdir(join(dir, "roadmap"))).toEqual(["MO-045.md"]);
  });

  it("repoints a worklog's roadmap reference so it does not dangle", async () => {
    const wl = join(dir, ".agent", "worklog");
    await mkdir(wl, { recursive: true });
    await writeFile(
      join(wl, "note.md"),
      `---\ndate: 2026-07-31\nagent: claude\nroadmap: MO-045\noutcome: shipped\nsummary: x\n---\n\nProse mentioning MO-045 stays as written.\n`,
      "utf8",
    );
    await item("MO-045", "Forty-fifth thing", "2026-07-31");
    const r = await migrate(join(dir, "roadmap"), false, wl);

    const text = await readFile(join(wl, "note.md"), "utf8");
    expect(text).toContain("roadmap: MO-26-07-31-045");
    expect(r.referencesUpdated).toEqual(["note.md"]);

    // Prose is deliberately untouched: the old number is still the last field
    // of the new id, so grep finds it, and rewriting narrative in a historical
    // record would be editing the past rather than repairing a link.
    expect(text).toContain("Prose mentioning MO-045 stays as written.");
  });

  it("repairs relative markdown links that point at a renamed item", async () => {
    // Missed on the first pass: worklog frontmatter was repaired but markdown
    // links were not, and Morpheus shipped a migration with 28 dangling links
    // because it has no test asserting they resolve. Darwin does.
    const hq = join(dir, "hq");
    await mkdir(hq, { recursive: true });
    await writeFile(
      join(hq, "goals.md"),
      "See [MO-045](../roadmap/MO-045.md) and [MO-099](../roadmap/MO-099.md).\n",
      "utf8",
    );
    await item("MO-045", "Forty-fifth thing", "2026-07-31");
    const r = await migrate(join(dir, "roadmap"), false, undefined, [hq]);

    const text = await readFile(join(hq, "goals.md"), "utf8");
    expect(text).toContain("(../roadmap/MO-26-07-31-045-forty-fifth-thing.md)");
    expect(r.linksUpdated).toHaveLength(1);

    // Link *text* is prose and stays — the old number still reads correctly.
    expect(text).toContain("[MO-045]");
    // A link to an item that was not renamed is left exactly as it was.
    expect(text).toContain("(../roadmap/MO-099.md)");
  });

  it("repairs sibling links between items in the same directory", async () => {
    // Items reference each other as `](./MO-045.md)`, with no `roadmap/`
    // segment. Requiring one missed every sibling link and took darwin from
    // zero broken links to three.
    await item("MO-045", "Forty-fifth thing", "2026-07-31");
    await item("MO-046", "Forty-sixth thing", "2026-07-31");
    const sib = join(dir, "roadmap", "MO-046.md");
    await writeFile(sib, (await readFile(sib, "utf8")) + "\nSee [MO-045](./MO-045.md).\n", "utf8");

    await migrate(join(dir, "roadmap"), false, undefined, [join(dir, "roadmap")]);

    const files = await readdir(join(dir, "roadmap"));
    const moved = files.find((f) => f.includes("046"))!;
    expect(await readFile(join(dir, "roadmap", moved), "utf8")).toContain(
      "(./MO-26-07-31-045-forty-fifth-thing.md)",
    );
  });

  it("never rewrites an absolute URL, even to a renamed item", async () => {
    // An archived link pinned to a branch records what the file was called on
    // that branch. Rewriting it breaks a working link to tidy a local one.
    const hq = join(dir, "hq");
    await mkdir(hq, { recursive: true });
    const url = "https://github.com/o/r/blob/some-branch/hq/product/roadmap/MO-045.md";
    await writeFile(join(hq, "archive.md"), `See [MO-045](${url}).\n`, "utf8");
    await item("MO-045", "Forty-fifth thing", "2026-07-31");
    await migrate(join(dir, "roadmap"), false, undefined, [hq]);

    expect(await readFile(join(hq, "archive.md"), "utf8")).toContain(url);
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

describe("baseSha", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "sha-"));
  });
  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  const git = async (...args: string[]) => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    return promisify(execFile)("git", args, { cwd: repo });
  };

  it("records the commit the author is actually on, not origin/main", async () => {
    // The external-contributor case: a fork whose `origin/main` is behind what
    // the contributor is working from. Recording upstream's tip would assert
    // they were on code they never ran.
    // `-b main` explicitly: the runner's init.defaultBranch is `master`, so
    // assuming the name is what this test failed on in CI.
    await git("init", "-q", "-b", "main", ".");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "T");
    await git("commit", "-q", "--allow-empty", "-m", "first");
    await git("checkout", "-qb", "their-branch");
    await git("commit", "-q", "--allow-empty", "-m", "their work");

    const head = (await git("rev-parse", "--short=12", "HEAD")).stdout.trim();
    const main = (await git("rev-parse", "--short=12", "main")).stdout.trim();

    expect(await headSha(repo)).toBe(head);
    expect(await headSha(repo)).not.toBe(main);
  });

  it("returns null rather than throwing outside a repository", async () => {
    // An item is still worth writing without it.
    expect(await headSha(await mkdtemp(join(tmpdir(), "norepo-")))).toBeNull();
  });
});
