import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assess, DEFAULT_CONFIG, type AssessInput } from "../src/heartbeat/assess.js";
import { hasDispatchCredential, readConfig } from "../src/heartbeat/config.js";
import { formatBeat, formatSummary } from "../src/heartbeat/format.js";
import { parseClaimRefs, type Claim } from "../src/pm/claim.js";
import type { Item } from "../src/pm/parse.js";
import type { Goal, RoadmapItem } from "../src/pm/schema.js";

const NOW = new Date("2026-08-01T12:00:00Z");

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

function goal(id: string, status: Goal["status"]): Item<Goal> {
  return {
    path: `/x/${id}.md`,
    body: "",
    data: {
      id,
      title: "A goal",
      horizon: "quarterly",
      period: "2026-Q3",
      metric: "m",
      target: "t",
      status,
    },
  };
}

function claim(id: string): Claim {
  return { id, branch: `${id.toLowerCase()}-slug`, at: "2026-07-31T00:00:00Z" };
}

function input(over: Partial<AssessInput> = {}): AssessInput {
  return {
    items: [],
    goals: [],
    claims: [],
    config: DEFAULT_CONFIG,
    now: NOW,
    ...over,
  };
}

describe("ranking", () => {
  it("puts P0 above P1 above P2", () => {
    const beat = assess(
      input({
        items: [
          item({ id: "MO-002", priority: "P2" }),
          item({ id: "MO-000", priority: "P0" }),
          item({ id: "MO-001", priority: "P1" }),
        ],
      }),
    );
    expect(beat.ranked.map((c) => c.id)).toEqual(["MO-000", "MO-001", "MO-002"]);
    expect(beat.pick?.id).toBe("MO-000");
  });

  // Priority is a human's explicit statement of leverage; alignment is derived
  // from a goal link that plenty of legitimate items simply do not have. When
  // the two disagree the explicit signal has to win.
  it("does not let alignment outrank priority", () => {
    const beat = assess(
      input({
        items: [
          item({ id: "MO-001", priority: "P0" }),
          item({ id: "MO-002", priority: "P3", goal: "MO-G-2026-Q3-01" }),
        ],
        goals: [goal("MO-G-2026-Q3-01", "on-track")],
      }),
    );
    expect(beat.pick?.id).toBe("MO-001");
  });

  it("uses alignment as the tiebreak at equal priority", () => {
    const beat = assess(
      input({
        items: [
          item({ id: "MO-001", priority: "P1" }),
          item({ id: "MO-002", priority: "P1", goal: "MO-G-2026-Q3-01" }),
        ],
        goals: [goal("MO-G-2026-Q3-01", "on-track")],
      }),
    );
    expect(beat.pick?.id).toBe("MO-002");
    expect(beat.pick?.aligned).toBe(true);
  });

  it("does not count an achieved goal as alignment", () => {
    const beat = assess(
      input({
        items: [item({ id: "MO-001", goal: "MO-G-2026-Q3-01" })],
        goals: [goal("MO-G-2026-Q3-01", "achieved")],
      }),
    );
    expect(beat.pick?.aligned).toBe(false);
    expect(beat.pick?.note).toContain("achieved");
  });

  it("counts an at-risk goal as still live", () => {
    const beat = assess(
      input({
        items: [item({ id: "MO-001", goal: "MO-G-2026-Q3-01" })],
        goals: [goal("MO-G-2026-Q3-01", "at-risk")],
      }),
    );
    expect(beat.pick?.aligned).toBe(true);
  });

  // Oldest first, so nothing starves at the bottom of the board.
  it("breaks a full tie by age, oldest first", () => {
    const beat = assess(
      input({
        items: [
          item({ id: "MO-001", updated: "2026-07-31" }),
          item({ id: "MO-002", updated: "2026-07-01" }),
        ],
      }),
    );
    expect(beat.pick?.id).toBe("MO-002");
    expect(beat.pick?.age).toBe(31);
  });

  it("is stable — the same inputs give the same pick", () => {
    const twice = [1, 2].map(() =>
      assess(input({ items: [item({ id: "MO-001" }), item({ id: "MO-002" })] })),
    );
    expect(twice[0]!.pick?.id).toBe(twice[1]!.pick?.id);
  });
});

describe("the ceiling", () => {
  it("picks nothing when in-flight is at the ceiling", () => {
    const beat = assess(
      input({
        items: [item({ id: "MO-009" })],
        claims: [claim("MO-001"), claim("MO-002"), claim("MO-003")],
      }),
    );
    expect(beat.pick).toBeNull();
    expect(beat.headroom).toBe(0);
    expect(beat.reason).toContain("finishing beats starting");
  });

  it("picks when one lane is free", () => {
    const beat = assess(
      input({ items: [item({ id: "MO-009" })], claims: [claim("MO-001"), claim("MO-002")] }),
    );
    expect(beat.pick?.id).toBe("MO-009");
    expect(beat.headroom).toBe(1);
  });

  it("respects a raised ceiling", () => {
    const beat = assess(
      input({
        items: [item({ id: "MO-009" })],
        claims: [claim("MO-001"), claim("MO-002"), claim("MO-003")],
        config: { ceiling: 4, dispatch: false },
      }),
    );
    expect(beat.pick?.id).toBe("MO-009");
  });

  // The load-bearing guard: a blocked item holds its branch on purpose, so
  // counting it would let one unanswered question consume a lane forever —
  // a ceiling that cannot be released is a deadlock with a schedule.
  it("does not count a blocked claim against the ceiling", () => {
    const beat = assess(
      input({
        items: [
          item({ id: "MO-001", status: "blocked", needs: "which model" }),
          item({ id: "MO-002", status: "blocked", needs: "a credential" }),
          item({ id: "MO-003", status: "blocked", needs: "an answer" }),
          item({ id: "MO-009" }),
        ],
        claims: [claim("MO-001"), claim("MO-002"), claim("MO-003")],
      }),
    );
    expect(beat.inFlight).toHaveLength(0);
    expect(beat.blocked).toHaveLength(3);
    expect(beat.pick?.id).toBe("MO-009");
  });

  // A squash-merge leaves the branch behind unless the merger passed
  // --delete-branch or the repo sets delete_branch_on_merge, so a finished item
  // keeps a ref that still parses as a claim. Counting it fills the ceiling with
  // work that is already on the trunk, and the beat reports the resulting
  // paralysis as "finishing beats starting".
  it("does not count a shipped or dropped item's surviving branch against the ceiling", () => {
    const beat = assess(
      input({
        items: [
          item({ id: "MO-001", status: "shipped" }),
          item({ id: "MO-002", status: "shipped" }),
          item({ id: "MO-003", status: "dropped" }),
          item({ id: "MO-009" }),
        ],
        claims: [claim("MO-001"), claim("MO-002"), claim("MO-003")],
      }),
    );
    expect(beat.inFlight).toHaveLength(0);
    expect(beat.pick?.id).toBe("MO-009");
  });

  it("still counts a genuinely in-progress claim beside a shipped one", () => {
    const beat = assess(
      input({
        items: [item({ id: "MO-001", status: "shipped" }), item({ id: "MO-009" })],
        claims: [claim("MO-001"), claim("MO-002")],
      }),
    );
    expect(beat.inFlight.map((c) => c.id)).toEqual(["MO-002"]);
  });

  it("counts unblocked claims and ignores blocked ones in the same set", () => {
    const beat = assess(
      input({
        items: [item({ id: "MO-001", status: "blocked", needs: "x" }), item({ id: "MO-009" })],
        claims: [claim("MO-001"), claim("MO-002")],
      }),
    );
    expect(beat.inFlight.map((c) => c.id)).toEqual(["MO-002"]);
  });
});

describe("doing nothing", () => {
  it("succeeds with a reason on an empty board", () => {
    const beat = assess(input());
    expect(beat.pick).toBeNull();
    expect(beat.reason).toContain("board is empty");
  });

  it("says so when everything unclaimed is blocked", () => {
    const beat = assess(
      input({ items: [item({ id: "MO-001", status: "blocked", needs: "an answer" })] }),
    );
    expect(beat.pick).toBeNull();
    expect(beat.reason).toContain("blocked");
  });

  it("picks nothing when the board is entirely shipped", () => {
    const beat = assess(
      input({ items: [item({ id: "MO-001", status: "shipped" }), item({ id: "MO-002", status: "dropped" })] }),
    );
    expect(beat.pick).toBeNull();
    expect(beat.reason).toContain("Nothing in the backlog");
  });

  it("never leaves the reason empty", () => {
    for (const beat of [
      assess(input()),
      assess(input({ items: [item({ id: "MO-001" })] })),
      assess(input({ items: [item({ id: "MO-001" })], claims: [claim("MO-002"), claim("MO-003"), claim("MO-004")] })),
    ]) {
      expect(beat.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("candidates", () => {
  it("excludes an item that already has a claim", () => {
    const beat = assess(input({ items: [item({ id: "MO-001" })], claims: [claim("MO-001")] }));
    expect(beat.ranked).toHaveLength(0);
  });

  it("excludes review and in-progress items from the backlog", () => {
    const beat = assess(
      input({
        items: [item({ id: "MO-001", status: "review" }), item({ id: "MO-002", status: "in-progress" })],
      }),
    );
    expect(beat.ranked).toHaveLength(0);
  });

  // Something already went wrong there; quietly handing it to another agent
  // would compound it, so it is reported rather than picked.
  it("reports in-progress with no branch as drift", () => {
    const beat = assess(input({ items: [item({ id: "MO-002", status: "in-progress" })] }));
    expect(beat.drift.map((d) => d.id)).toEqual(["MO-002"]);
  });

  it("does not call a properly claimed in-progress item drift", () => {
    const beat = assess(
      input({ items: [item({ id: "MO-002", status: "in-progress" })], claims: [claim("MO-002")] }),
    );
    expect(beat.drift).toHaveLength(0);
  });

  it("survives a blocked item whose needs was hand-edited away", () => {
    const beat = assess(input({ items: [item({ id: "MO-001", status: "blocked" })] }));
    expect(beat.blocked[0]!.needs).toBe("(unrecorded)");
  });
});

describe("config", () => {
  it("defaults when there is no manifest at all", async () => {
    const dir = await mkdtemp(join(tmpdir(), "morpheus-hb-"));
    expect(await readConfig(dir)).toEqual({ ceiling: 3, dispatch: false });
  });

  it("defaults when the manifest has no heartbeat block", async () => {
    const dir = await mkdtemp(join(tmpdir(), "morpheus-hb-"));
    await writeFile(join(dir, "morpheus.json"), JSON.stringify({ name: "x" }));
    expect(await readConfig(dir)).toEqual({ ceiling: 3, dispatch: false });
  });

  it("reads a configured ceiling and dispatch flag", async () => {
    const dir = await mkdtemp(join(tmpdir(), "morpheus-hb-"));
    await writeFile(
      join(dir, "morpheus.json"),
      JSON.stringify({ name: "x", heartbeat: { ceiling: 5, dispatch: true } }),
    );
    expect(await readConfig(dir)).toEqual({ ceiling: 5, dispatch: true });
  });

  it("falls back to safe defaults on unparseable JSON rather than throwing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "morpheus-hb-"));
    await writeFile(join(dir, "morpheus.json"), "{ not json");
    expect(await readConfig(dir)).toEqual({ ceiling: 3, dispatch: false });
  });

  it("rejects a nonsense ceiling instead of adopting it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "morpheus-hb-"));
    await writeFile(
      join(dir, "morpheus.json"),
      JSON.stringify({ name: "x", heartbeat: { ceiling: -1 } }),
    );
    expect((await readConfig(dir)).ceiling).toBe(3);
  });
});

describe("dispatch credentials", () => {
  it("is false with nothing set", () => {
    expect(hasDispatchCredential({})).toBe(false);
  });

  it("is false for an empty or whitespace value", () => {
    expect(hasDispatchCredential({ ANTHROPIC_API_KEY: "" })).toBe(false);
    expect(hasDispatchCredential({ ANTHROPIC_API_KEY: "   " })).toBe(false);
  });

  it("accepts either credential", () => {
    expect(hasDispatchCredential({ ANTHROPIC_API_KEY: "sk-x" })).toBe(true);
    expect(hasDispatchCredential({ CLAUDE_CODE_OAUTH_TOKEN: "tok" })).toBe(true);
  });
});

describe("formatting", () => {
  const beat = assess(
    input({
      items: [
        item({ id: "MO-009", priority: "P0" }),
        item({ id: "MO-010", status: "blocked", needs: "which model" }),
      ],
      claims: [claim("MO-010")],
    }),
  );

  it("names the pick and the reason in the terminal output", () => {
    const out = formatBeat(beat);
    expect(out).toContain("MO-009");
    expect(out).toContain(beat.reason);
  });

  it("shows blocked work as waiting on a person", () => {
    expect(formatBeat(beat)).toContain("waiting on a person");
    expect(formatSummary(beat)).toContain("which model");
  });

  it("renders a no-pick beat without pretending otherwise", () => {
    const empty = assess(input());
    expect(formatBeat(empty)).toContain("Pick: nothing");
    expect(formatSummary(empty)).toContain("**Pick: nothing.**");
  });

  it("escapes a pipe so it cannot break the summary table", () => {
    const risky = assess(
      input({ items: [item({ id: "MO-001", status: "blocked", needs: "a | b" })] }),
    );
    expect(formatSummary(risky)).toContain("a \\| b");
  });
});

/**
 * The guards, exercised with the ids actually in use.
 *
 * Every test above uses `MO-001`, which is the legacy shape. That is why they
 * all kept passing while `listClaims` returned nothing at all under MO-057:
 * the beat was correct about a claim list that had silently gone empty.
 *
 * These use timestamp ids end to end — parsed from a branch exactly as
 * `listClaims` produces them — so a regression in the parser fails the guard it
 * actually breaks, not just the parser's own test.
 */
describe("the guards under timestamp ids", () => {
  const ref = (branch: string) => `origin/${branch}\t2026-08-01T00:00:00-07:00\tChris`;
  const claimFor = (branch: string) => parseClaimRefs(ref(branch))[0]!;

  const IN_FLIGHT = "mo-26-08-01-10.00.00-something";
  const BLOCKED = "mo-26-08-01-11.00.00-waiting";

  it("counts a timestamp-id claim against the ceiling", () => {
    const beat = assess(
      input({
        items: [item({ id: "MO-26-08-01-12.00.00" })],
        claims: [
          claimFor(IN_FLIGHT),
          claimFor("mo-26-08-01-10.30.00-b"),
          claimFor("mo-26-08-01-10.45.00-c"),
        ],
      }),
    );
    expect(beat.inFlight).toHaveLength(3);
    expect(beat.pick).toBeNull();
  });

  // The load-bearing guard from MO-050. It can only hold if the claim's id
  // matches the item's — which is exactly what the drifted parser broke.
  it("still excludes a blocked claim from the ceiling", () => {
    const beat = assess(
      input({
        items: [
          item({ id: "MO-26-08-01-11.00.00", status: "blocked", needs: "an answer" }),
          item({ id: "MO-26-08-01-12.00.00" }),
        ],
        claims: [claimFor(BLOCKED)],
      }),
    );
    expect(beat.inFlight).toHaveLength(0);
    expect(beat.blocked.map((b) => b.id)).toEqual(["MO-26-08-01-11.00.00"]);
    expect(beat.pick?.id).toBe("MO-26-08-01-12.00.00");
  });

  // With ids that do not match, a claimed item reads as unclaimed and the beat
  // hands another session work someone already holds.
  it("does not offer an item another session already claims", () => {
    const beat = assess(
      input({
        items: [item({ id: "MO-26-08-01-10.00.00" })],
        claims: [claimFor(IN_FLIGHT)],
      }),
    );
    expect(beat.ranked).toHaveLength(0);
    expect(beat.pick).toBeNull();
  });

  it("does not call a properly claimed timestamp-id item drift", () => {
    const beat = assess(
      input({
        items: [item({ id: "MO-26-08-01-10.00.00", status: "in-progress" })],
        claims: [claimFor(IN_FLIGHT)],
      }),
    );
    expect(beat.drift).toHaveLength(0);
  });
});
