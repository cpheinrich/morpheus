import { describe, expect, it } from "vitest";
import { ageInDays, branchPrefix, slugify } from "../src/pm/claim.js";

describe("branchPrefix", () => {
  it("lowercases the id and adds a trailing dash", () => {
    expect(branchPrefix("RM-014")).toBe("rm-014-");
  });

  it("is a prefix, so it cannot match a longer id", () => {
    // rm-14- must not match rm-140-something
    expect("rm-140-thing".startsWith(branchPrefix("RM-14"))).toBe(false);
  });
});

describe("slugify", () => {
  it("lowercases and dashes a title", () => {
    expect(slugify("Ship the calorie pipeline")).toBe("ship-the-calorie-pipeline");
  });

  it("strips punctuation that is illegal in a branch name", () => {
    expect(slugify("PM package: schemas, parser & CLI")).toBe(
      "pm-package-schemas-parser-cli",
    );
  });

  it("truncates without leaving a trailing dash", () => {
    const s = slugify("a".repeat(30) + " " + "b".repeat(30));
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
  });

  it("handles a title that is entirely punctuation", () => {
    expect(slugify("!!!")).toBe("");
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
