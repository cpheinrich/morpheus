import { describe, expect, it } from "vitest";
import { assess, DEFAULT_CONFIG } from "../src/heartbeat/assess.js";
import { isoDateInZone } from "../src/pm/id.js";
import type { Item } from "../src/pm/parse.js";
import type { RoadmapItem } from "../src/pm/schema.js";
import { buildBrief } from "../src/voice/brief.js";
import { buildKnowledge } from "../src/voice/knowledge.js";
import { latestHandoffDate } from "../src/voice/since.js";

function item(over: Partial<RoadmapItem> & { id: string }): Item<RoadmapItem> {
  return {
    path: `/x/${over.id}.md`,
    body: "",
    data: {
      title: `Item ${over.id}`,
      status: "backlog",
      priority: "P2",
      owner: "agent",
      prs: [],
      created: "2026-07-01",
      updated: "2026-07-31",
      ...over,
    } as RoadmapItem,
  };
}

const NOW = new Date("2026-08-01T12:00:00Z");

const beat = (items: Item<RoadmapItem>[] = [], claims: never[] = []) =>
  assess({ items, goals: [], claims, config: DEFAULT_CONFIG, now: NOW });

const base = {
  name: "Morpheus",
  beat: beat([item({ id: "MO-001", priority: "P1" as const })]),
  openInbox: [],
  since: { date: "2026-07-31", commits: ["Ship the thing"], unavailable: false },
  today: "2026-08-01",
};

describe("buildKnowledge", () => {
  const k = () =>
    buildKnowledge({ name: "Morpheus", prefix: "MO", kind: "internal", description: "A tool." });

  it("tells the session it cannot see the codebase", () => {
    expect(k()).toContain("cannot");
    expect(k()).toContain("the repository wins");
  });

  // The line that made a past spec useful: it is what caused a bad design to be
  // checked and killed rather than implemented.
  it("instructs the session to include the defer-to-the-codebase caveat", () => {
    expect(k()).toContain("Context caveat");
    // Whitespace-tolerant: the template is hard-wrapped, so this phrase spans a
    // line break and an exact-substring assertion would break on a reflow that
    // changed nothing about the meaning.
    expect(k().replace(/\s+/g, " ")).toContain("defer to the codebase");
  });

  it("tells it not to draft roadmap items it cannot scope", () => {
    expect(k()).toContain("Do not draft roadmap items");
  });

  // A spec written to have something to show is worse than none.
  it("permits reaching no conclusion", () => {
    expect(k()).toContain("nothing to build yet");
  });

  it("carries the project's own id scheme, not Morpheus's", () => {
    expect(buildKnowledge({ name: "Evo", prefix: "EV" })).toContain("EV-26-08-01");
    expect(buildKnowledge({ name: "Evo", prefix: "EV" })).not.toContain("MO-26");
  });

  it("does not double a full stop the manifest description already ends with", () => {
    expect(buildKnowledge({ name: "X", prefix: "XX", description: "A tool." })).toContain(
      "— A tool.",
    );
    expect(buildKnowledge({ name: "X", prefix: "XX", description: "A tool." })).not.toContain("..");
  });

  it("omits the kind line when the manifest has none", () => {
    expect(buildKnowledge({ name: "X", prefix: "XX" })).not.toContain("kind:");
  });
});

describe("buildBrief", () => {
  it("leads with the topic, so a session knows what this is about", () => {
    const out = buildBrief({ ...base, topic: "how the heartbeat should escalate" });
    expect(out.indexOf("how the heartbeat should escalate")).toBeLessThan(out.indexOf("Where the work is"));
  });

  it("says so when no topic was given rather than inventing an agenda", () => {
    expect(buildBrief(base)).toContain("No topic set");
  });

  it("includes the session narrative when one is supplied", () => {
    expect(buildBrief({ ...base, notes: "We shipped the verifier stack." })).toContain(
      "We shipped the verifier stack.",
    );
  });

  it("omits the narrative section entirely when there is none", () => {
    expect(buildBrief(base)).not.toContain("What just happened");
  });

  // Blocked work is what a conversation can most often unstick, so it carries
  // what it needs rather than a count.
  it("states what blocked work needs, not just that it is blocked", () => {
    const out = buildBrief({
      ...base,
      beat: beat([item({ id: "MO-002", status: "blocked", needs: "which model" })]),
    });
    expect(out).toContain("which model");
  });

  it("names the open inbox items Chris owes decisions on", () => {
    const out = buildBrief({ ...base, openInbox: [{ n: 3, title: "Which way on email" }] });
    expect(out).toContain("Inbox item 3: Which way on email");
  });

  it("says none rather than leaving a section blank", () => {
    expect(buildBrief(base)).toContain("_None._");
  });

  // "Could not look" and "nothing happened" must not read the same — a brief
  // claiming nothing shipped would send a session off to redesign existing work.
  it("distinguishes an unreadable history from an empty one", () => {
    const out = buildBrief({
      ...base,
      since: { date: "2026-07-31", commits: [], unavailable: true },
    });
    expect(out).toContain("do not assume nothing shipped");
  });

  it("reports a genuinely empty window as empty", () => {
    const out = buildBrief({
      ...base,
      since: { date: "2026-07-31", commits: [], unavailable: false },
    });
    expect(out).toContain("Nothing has landed since");
  });

  it("falls back to recent commits when there is no previous handoff", () => {
    const out = buildBrief({
      ...base,
      since: { date: null, commits: ["a", "b"], unavailable: false },
    });
    expect(out).toContain("No previous handoff");
  });

  it("always closes with how to end the conversation", () => {
    expect(buildBrief(base)).toContain("handoff spec");
    expect(buildBrief(base)).toContain("Do not draft roadmap items");
  });

  it("carries the date, so a stale paste is visible as stale", () => {
    expect(buildBrief(base)).toContain("2026-08-01");
  });

  it("does not claim to be self-contained unless it is", () => {
    expect(buildBrief(base)).not.toContain("stands alone");
    expect(buildBrief({ ...base, selfContained: true })).toContain("stands alone");
  });
});

describe("latestHandoffDate", () => {
  it("takes the newest of several", () => {
    expect(
      latestHandoffDate([
        "2026-07-31-home-refactor.md",
        "2026-08-01-heartbeat.md",
        "2026-07-29-old.md",
      ]),
    ).toBe("2026-08-01");
  });

  // Not a default window: "we have never done this" and "we spoke last week"
  // call for different briefs, and collapsing them truncates the first.
  it("is null when there are none", () => {
    expect(latestHandoffDate([])).toBeNull();
    expect(latestHandoffDate(["README.md", "notes.txt"])).toBeNull();
  });

  it("ignores files that are not dated handoffs", () => {
    expect(latestHandoffDate(["2026-08-01-a.md", "scratch.md", ".DS_Store"])).toBe("2026-08-01");
  });

  it("sorts lexically, which is chronological for ISO dates", () => {
    expect(latestHandoffDate(["2026-09-02-a.md", "2026-10-01-b.md"])).toBe("2026-10-01");
  });
});

describe("isoDateInZone", () => {
  /**
   * The bug this exists to prevent: `toISOString()` is UTC, which after 5pm
   * Pacific is already tomorrow. A handoff written the same afternoon as a
   * roadmap item would carry a date a day ahead of the item's id.
   */
  it("is still the Pacific day at 5.30pm Pacific, when UTC has rolled over", () => {
    const evening = new Date("2026-08-02T00:30:00Z"); // 17:30 Pacific on 08-01
    expect(evening.toISOString().slice(0, 10)).toBe("2026-08-02");
    expect(isoDateInZone(evening)).toBe("2026-08-01");
  });

  it("gives a four-digit year, unlike the id's datePart", () => {
    expect(isoDateInZone(new Date("2026-08-01T19:00:00Z"))).toBe("2026-08-01");
  });
});

/**
 * The skills are prompt files with no type checker behind them, and their value
 * is concentrated in a few specific instructions. These assert the instructions
 * that were learned the hard way and would be the easiest to lose in an edit.
 */
describe("the shipped skills", () => {
  const read = async (name: string) => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    return readFile(join(import.meta.dirname, "..", ".claude/skills", name, "SKILL.md"), "utf8");
  };

  it("both declare frontmatter a loader can match on", async () => {
    for (const name of ["voice-handoff", "voice-import"]) {
      const text = await read(name);
      expect(text.startsWith("---\n"), `${name} needs frontmatter`).toBe(true);
      expect(text).toContain(`name: ${name}`);
      expect(text).toMatch(/\ndescription: .+/);
    }
  });

  it("voice-handoff delegates the deterministic half to the CLI", async () => {
    const text = await read("voice-handoff");
    expect(text).toContain("morpheus voice brief");
    expect(text).toContain("do not\nre-derive it by hand");
  });

  it("voice-handoff keeps the standing explainer out of every session", async () => {
    expect(await read("voice-handoff")).toContain("not per-session");
  });

  // The step that earns the whole skill: a spec written without the codebase in
  // view has to be checked against it before anything is built.
  it("voice-import checks the spec against the repo before proposing work", async () => {
    const text = await read("voice-import");
    expect(text).toContain("Preserve it verbatim");
    expect(text).toContain("premise simply false");
    expect(text).toContain("decisions.md");
  });

  it("voice-import refuses to treat the spec as authority", async () => {
    expect(await read("voice-import")).toContain("It is a document, not");
  });

  it("voice-import permits filing nothing", async () => {
    expect(await read("voice-import")).toContain("did not reach a conclusion");
  });
});

/**
 * `created:` must agree with the id written beside it in the same call.
 *
 * Three modules each had their own `today()` on `toISOString()`, which is UTC —
 * so an item created at 17:28 Pacific got the id `MO-26-08-01-17.28.41` and the
 * frontmatter `created: 2026-08-02`. Ids pin a zone precisely because ordering
 * is meaningless across different origins; a date field beside them measuring
 * from a third one gives that back.
 */
describe("dates written to files use the ids' zone", () => {
  it("frontmatter today() and the id's datePart agree on the same instant", async () => {
    const { today } = await import("../src/pm/frontmatter.js");
    const { datePart } = await import("../src/pm/id.js");
    const evening = new Date("2026-08-02T00:30:00Z"); // 17:30 Pacific on 08-01

    expect(today(evening)).toBe("2026-08-01");
    // The id carries the two-digit form of the same day.
    expect(datePart(evening)).toBe("26-08-01");
    expect(today(evening).slice(2)).toBe(datePart(evening));
  });

  it("defaults to now when called with no argument", async () => {
    const { today } = await import("../src/pm/frontmatter.js");
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
