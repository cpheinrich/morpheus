import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ageInDays,
  branchPrefix,
  FETCH_PRUNE,
  parseClaimRefs,
  slugify,
} from "../src/pm/claim.js";
import { roadmapIdFromBranch } from "../src/pm/id.js";
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

/**
 * The parsing `listClaims` does, which drifted after MO-057.
 *
 * `listClaims` carried a private copy of the id pattern — `/^([a-z]{2,4}-\d{3,})-/`
 * — and it failed two different ways at once against the ids in use:
 * a four-digit-year branch truncated to `CPH-2026`, and a two-digit-year one,
 * which is what `pm new` produces today, did not match at all.
 *
 * The second is the dangerous one, because it is silent. An unparsed branch is
 * not reported — it is absent from the result, and every caller reads absence
 * as "nothing claims this".
 */
describe("parseClaimRefs", () => {
  const ref = (branch: string) => `origin/${branch}\t2026-08-01T00:00:00-07:00\tChris`;

  it("reads a timestamp id, the form pm new produces today", () => {
    const claims = parseClaimRefs(ref("mo-26-08-01-17.28.41-voice-session-handoff"));
    expect(claims).toHaveLength(1);
    expect(claims[0]!.id).toBe("MO-26-08-01-17.28.41");
  });

  // The exact branch from issue #60, which reported as `CPH-2026`.
  it("does not truncate a four-digit-year id at the year", () => {
    const claims = parseClaimRefs(ref("cph-2026-08-01-22.49.21-keep-hq-brand"));
    expect(claims[0]!.id).toBe("CPH-2026-08-01-22.49.21");
  });

  it("reads a migrated id", () => {
    expect(parseClaimRefs(ref("mo-26-07-29-045-something"))[0]!.id).toBe("MO-26-07-29-045");
  });

  it("still reads a legacy integer id", () => {
    expect(parseClaimRefs(ref("mo-045-legacy"))[0]!.id).toBe("MO-045");
  });

  it("carries the branch, author and date through", () => {
    const c = parseClaimRefs(ref("mo-26-08-01-17.28.41-x"))[0]!;
    expect(c.branch).toBe("mo-26-08-01-17.28.41-x");
    expect(c.by).toBe("Chris");
    expect(c.at).toBe("2026-08-01T00:00:00-07:00");
  });

  it("skips branches that stake no id, and keeps the ones that do", () => {
    const out = [ref("main"), ref("inbox-2026-08-01"), ref("mo-26-08-01-17.28.41-x")].join("\n");
    expect(parseClaimRefs(out).map((c) => c.id)).toEqual(["MO-26-08-01-17.28.41"]);
  });

  it("is empty for empty input rather than throwing", () => {
    expect(parseClaimRefs("")).toEqual([]);
  });

  /**
   * The drift guard. Two parsers agreeing today is what stopped being true;
   * asserting they agree is cheaper than hoping nobody copies the pattern again.
   */
  it("agrees with roadmapIdFromBranch on every shape", () => {
    for (const branch of [
      "mo-26-08-01-17.28.41-slug",
      "cph-2026-08-01-22.49.21-slug",
      "mo-26-07-29-045-slug",
      "mo-045-slug",
      "ev-014",
    ]) {
      expect(parseClaimRefs(ref(branch))[0]?.id, branch).toBe(roadmapIdFromBranch(branch));
    }
  });
});

/**
 * Merging deletes the branch on origin, but a plain `git fetch` leaves the
 * local remote-tracking ref behind — so a shipped item keeps reading as
 * claimed on every machine that ever fetched it.
 *
 * This was live for one commit: `reconcile` pruned, `listClaims` did not, and
 * they disagreed about what was claimed while appearing to ask git the same
 * question. Surfaced immediately after the branch-id fix, because until then
 * `listClaims` returned nothing and there was no phantom to see.
 */
describe("FETCH_PRUNE", () => {
  it("prunes, or a merged branch reads as a live claim forever", () => {
    expect(FETCH_PRUNE).toContain("--prune");
  });

  it("is quiet, so it does not pollute command output", () => {
    expect(FETCH_PRUNE).toContain("--quiet");
  });

  // The point of the constant. Two call sites writing the array by hand is how
  // they diverged; one definition is what stops it recurring.
  it("is the single definition both readers use", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const read = (f: string) => readFile(join(import.meta.dirname, "..", f), "utf8");
    const occurrences = (s: string) => (s.match(/"fetch",\s*"origin"/g) ?? []).length;

    // One in claim.ts: the definition itself. None anywhere else.
    expect(occurrences(await read("src/pm/claim.ts"))).toBe(1);
    expect(occurrences(await read("src/pm/ship.ts"))).toBe(0);

    for (const f of ["src/pm/claim.ts", "src/pm/ship.ts"]) {
      expect(await read(f), `${f} should use FETCH_PRUNE`).toContain("FETCH_PRUNE");
    }
  });
});
