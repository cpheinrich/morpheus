import { describe, expect, it } from "vitest";
import { parseAnswersMd, renderAnswersMd } from "../src/brand/answers-md.js";
import type { BrandAnswers } from "../src/brand/questions.js";

const ANSWERS: BrandAnswers = {
  what: "A calorie tracker that works from a photo.",
  mission: "Make logging a meal take five seconds instead of two minutes.",
  primaryAudience: "People who have abandoned three tracking apps already",
  feels: ["calm", "precise", "unfussy"],
  never: ["preachy", "gamified"],
  references: [],
};

/** Write an answer into the block a question owns. */
function fill(md: string, key: string, body: string): string {
  const anchor = `<!-- morpheus:q ${key} -->`;
  const start = md.indexOf(anchor);
  const rest = md.indexOf("<!-- morpheus:q", start + anchor.length);
  const end = rest === -1 ? md.length : rest;
  const block = md.slice(start, end).replace(/^- *$/gm, "").trimEnd();
  return `${md.slice(0, start)}${block}\n\n${body}\n\n${md.slice(end)}`;
}

function filled(overrides: Record<string, string> = {}): string {
  let md = renderAnswersMd("Evo");
  const base: Record<string, string> = {
    what: ANSWERS.what,
    mission: ANSWERS.mission,
    primaryAudience: ANSWERS.primaryAudience,
    feels: ANSWERS.feels.map((f) => `- ${f}`).join("\n"),
    never: ANSWERS.never.map((n) => `- ${n}`).join("\n"),
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) md = fill(md, k, v);
  return md;
}

describe("the editable answers file", () => {
  it("round-trips answers through render and parse", () => {
    const { answers, issues } = parseAnswersMd(renderAnswersMd("Evo", ANSWERS));

    expect(issues).toEqual([]);
    expect(answers).toEqual({ ...ANSWERS, references: [] });
  });

  it("parses a file someone filled in by hand", () => {
    const { answers, issues } = parseAnswersMd(filled());

    expect(issues).toEqual([]);
    expect(answers?.what).toBe(ANSWERS.what);
    expect(answers?.feels).toEqual(ANSWERS.feels);
  });

  it("survives the heading being reworded, because anchors carry the key", () => {
    const md = filled().replace(
      "## In one sentence, what is this?",
      "## So what actually is this thing",
    );
    const { answers, issues } = parseAnswersMd(md);

    expect(issues).toEqual([]);
    expect(answers?.what).toBe(ANSWERS.what);
  });

  it("ignores the guidance quotes rather than reading them as answers", () => {
    const { answers } = parseAnswersMd(filled());

    expect(answers?.what).not.toContain("Everything else is derived");
    expect(answers?.mission).not.toContain("e.g.");
  });

  it("treats the empty placeholder bullets as unanswered", () => {
    const md = filled({ feels: "" });
    const { answers, issues } = parseAnswersMd(md);

    expect(answers).toBeNull();
    expect(issues.some((i) => /how it should feel/.test(i))).toBe(true);
  });

  it("reports every unanswered question at once, and each only once", () => {
    const { answers, issues } = parseAnswersMd(renderAnswersMd("Evo"));

    expect(answers).toBeNull();
    expect(issues).toHaveLength(5); // the five required questions
    // Saying "not answered" and "expected string, received undefined" about the
    // same blank is noise dressed as thoroughness.
    expect(issues.every((i) => !i.includes("received undefined"))).toBe(true);
  });

  it("accepts a blank optional question without complaint", () => {
    const { answers, issues } = parseAnswersMd(filled());

    expect(issues).toEqual([]);
    expect(answers?.secondaryAudience).toBeUndefined();
  });

  it("keeps a multi-line prose answer intact", () => {
    const md = filled({ mission: "First line of the mission.\nSecond line, still the mission." });
    const { answers } = parseAnswersMd(md);

    expect(answers?.mission).toBe(
      "First line of the mission.\nSecond line, still the mission.",
    );
  });

  it("says what to do when the anchors have been deleted", () => {
    const { answers, issues } = parseAnswersMd("# Evo\n\nJust prose, no anchors.\n");

    expect(answers).toBeNull();
    expect(issues[0]).toMatch(/morpheus brand init/);
  });

  it("reports a validation failure against the question, not the field name", () => {
    const { answers, issues } = parseAnswersMd(filled({ what: "Too short" }));

    expect(answers).toBeNull();
    expect(issues.some((i) => i.startsWith("In one sentence, what is this?"))).toBe(true);
  });

  it("drops '(enter to skip)' from a heading — a file has no enter key", () => {
    const md = renderAnswersMd("Evo");

    expect(md).not.toContain("(enter to skip)");
    expect(md).toContain("## Anyone else?");
  });
});
