import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ageInDays, branchPrefix, slugify } from "../src/pm/claim.js";
import { parseArtifact } from "../src/pm/parse.js";

describe("branchPrefix", () => {
  it("lowercases the id and adds a trailing dash", () => {
    expect(branchPrefix("EV-014")).toBe("ev-014-");
  });

  it("is a prefix, so it cannot match a longer id", () => {
    // rm-14- must not match rm-140-something
    expect("ev-140-thing".startsWith(branchPrefix("EV-14"))).toBe(false);
  });
});

describe("slugify", () => {
  // The same function filenames use (MO-057), so a branch and its item file
  // can never disagree — they did, before: 40 characters cut mid-word here
  // against 64 at a word boundary there.
  it("abbreviates, drops stop words, and keeps it short", () => {
    expect(slugify("External contributors open an issue")).toBe("ext-contributors-open-issue");
    expect(slugify("/hq auth: Firebase custom claims")).toBe("hq-auth-firebase-custom");
  });

  it("keeps at most four words and 32 characters", () => {
    expect(slugify("one two three four five six seven").split("-")).toHaveLength(4);
    expect(slugify("alpha bravo charlie delta echo foxtrot").length).toBeLessThanOrEqual(32);
  });

  it("never ends on a stop word or a dangling negation", () => {
    expect(slugify("A study of the effects of and")).toBe("study-effects");
    expect(slugify("Roadmap ids become timestamps not")).not.toMatch(/-not$/);
  });

  it("preserves a negation that still has something to negate", () => {
    expect(slugify("Blocked is not an outcome without needs")).toContain("not");
  });

  it("produces a valid git branch component", () => {
    expect(slugify("PM package: schemas, parser & CLI!")).toMatch(/^[a-z0-9-]+$/);
  });

  it("handles a title that is entirely punctuation", () => {
    expect(slugify("!!! ???")).toBe("");
  });
});

describe("ageInDays", () => {
  const now = new Date("2026-07-29T12:00:00Z");

  it("reports 0 for today", () => {
    expect(ageInDays("2026-07-29T09:00:00Z", now)).toBe(0);
  });

  it("counts whole days", () => {
    expect(ageInDays("2026-07-22T12:00:00Z", now)).toBe(7);
  });

  it("does not round a partial day up", () => {
    expect(ageInDays("2026-07-28T13:00:00Z", now)).toBe(0);
  });
});

describe("itemPath after MO-057", () => {
  // `<id>.md` stopped being the filename when items gained a slug. Claiming
  // reconstructed it to stage reconciled items and aborted with
  // "pathspec ... did not match any files" — the same mistake `index-gen` made,
  // failing loudly here rather than silently producing a broken link.
  it("stages the file that exists, not a name rebuilt from the id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "claimpath-"));
    await mkdir(join(dir, "roadmap"), { recursive: true });
    const name = "MO-26-07-31-045-forty-fifth-thing.md";
    await writeFile(
      join(dir, "roadmap", name),
      `---\nid: MO-26-07-31-045\ntitle: "Forty-fifth thing"\nstatus: shipped\npriority: P1\nowner: agent\nprs: [12]\ncreated: 2026-07-31\nupdated: 2026-07-31\n---\n\nBody.\n`,
      "utf8",
    );

    const { items } = await parseArtifact(dir, "roadmap");
    const found = items.find((i) => i.data.id === "MO-26-07-31-045");

    expect(found).toBeDefined();
    expect(basename(found!.path)).toBe(name);
    expect(basename(found!.path)).not.toBe("MO-26-07-31-045.md");

    await rm(dir, { recursive: true, force: true });
  });
});
