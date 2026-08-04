import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { assess, DEFAULT_CONFIG, meetingContext } from "../src/heartbeat/assess.js";
import { INBOX_DIR, MEETING_NOTES_DIR, MEMBERS_FILE, TEAM_RESERVED } from "../src/paths.js";
import { isRecordsOnly } from "../src/paths.js";
import type { Item } from "../src/pm/parse.js";
import { MeetingNote, Members } from "../src/team/schema.js";
import { expectedStamp, validateTeam } from "../src/team/validate.js";

let root: string;

const NOTE = (over = "") => `id: MO-26-08-03-09.30.00
title: "A meeting"
occurred: "2026-08-03T09:30:00-07:00"
attendees: [cpheinrich]
recorded_by: claude
source: session
roadmap: []
redacted: true
${over}created: 2026-08-03`;

async function seedNote(frontmatter = NOTE(), name = "MO-26-08-03-09.30.00-a-meeting.md") {
  await mkdir(join(root, MEETING_NOTES_DIR), { recursive: true });
  await writeFile(join(root, MEETING_NOTES_DIR, name), `---\n${frontmatter}\n---\n\n## Context\n\nBody.\n`);
}

async function seedMembers(body = "members:\n  - github: cpheinrich\n    name: Christopher Heinrich") {
  await mkdir(join(root, INBOX_DIR), { recursive: true });
  await writeFile(join(root, MEMBERS_FILE), `---\n${body}\n---\n\n# Team\n`);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "morpheus-team-"));
});

describe("the member schema", () => {
  it("accepts a minimal member", () => {
    expect(Members.safeParse({ members: [{ github: "cpheinrich", name: "Chris H" }] }).success).toBe(true);
  });

  it("rejects a handle that is not a GitHub handle", () => {
    expect(Members.safeParse({ members: [{ github: "not a handle", name: "X Y" }] }).success).toBe(false);
  });

  it("rejects an empty roster — a file that lists nobody is a mistake, not a state", () => {
    expect(Members.safeParse({ members: [] }).success).toBe(false);
  });
});

describe("the meeting-note schema", () => {
  const base = {
    id: "MO-26-08-03-09.30.00",
    title: "A meeting",
    occurred: "2026-08-03T09:30:00-07:00",
    attendees: ["cpheinrich"],
    recorded_by: "claude",
    source: "session",
    redacted: true,
    created: "2026-08-03",
  };

  it("accepts a well-formed note", () => {
    expect(MeetingNote.safeParse(base).success).toBe(true);
  });

  /**
   * The finding that mattered: `.default(true)` meant the only note refused was
   * one that *declared* it had skipped the pass, while the person who forgot the
   * line — the whole population the field exists for — sailed through. Silence
   * has to read as "not yet redacted" or the gate is decorative.
   */
  it("refuses a note that never claims to have been redacted", () => {
    const { redacted: _omitted, ...noClaim } = base;
    expect(MeetingNote.safeParse(noClaim).success).toBe(false);
  });

  // The whole folder rests on notes being summaries. The redaction pass is the
  // gate, so it is a schema rule rather than a convention somebody remembers.
  it("refuses a note that has not been redacted", () => {
    const r = MeetingNote.safeParse({ ...base, redacted: false });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain("redacted");
  });

  it("does not treat an absent claim as a made one", () => {
    const { redacted: _omitted, ...noClaim } = base;
    expect(MeetingNote.safeParse(noClaim).error?.issues[0]?.message).toContain("redacted");
  });

  /**
   * YAML turns an unquoted timestamp into a Date, which is the trap `isoDate`
   * already exists for one layer up. Without the preprocessor a note written
   * the natural way fails with "expected string, received Date".
   */
  it("tolerates a timestamp YAML has already turned into a Date", () => {
    const r = MeetingNote.safeParse({ ...base, occurred: new Date("2026-08-03T16:30:00Z") });
    expect(r.success).toBe(true);
  });

  it("rejects a timestamp with no offset, since the id depends on one", () => {
    expect(MeetingNote.safeParse({ ...base, occurred: "2026-08-03T09:30:00" }).success).toBe(false);
  });
});

describe("expectedStamp", () => {
  // Deliberately the wall clock of the room, not a fixed zone: a 09:30 meeting
  // in Berlin is 09.30.00, and the offset keeps the instant recoverable.
  it("reads the local wall clock, not UTC", () => {
    expect(expectedStamp("2026-08-03T09:30:00-07:00")).toBe("26-08-03-09.30.00");
    expect(expectedStamp("2026-08-03T09:30:00+02:00")).toBe("26-08-03-09.30.00");
  });

  it("is empty for something that is not a timestamp", () => {
    expect(expectedStamp("nonsense")).toBe("");
  });
});

describe("validateTeam", () => {
  it("passes a roster and a note that agree", async () => {
    await seedMembers();
    await seedNote();
    const r = await validateTeam(root);
    expect(r.issues).toEqual([]);
    expect(r.members).toHaveLength(1);
    expect(r.noteCount).toBe(1);
  });

  // A roster nobody maintains is the failure mode; an attendee resolving to
  // nobody is either a typo or a collaborator who was never written down.
  it("flags an attendee who is not in the roster", async () => {
    await seedMembers();
    await seedNote(NOTE().replace("[cpheinrich]", "[cpheinrich, ghost]"));
    const r = await validateTeam(root);
    expect(r.issues[0]!.message).toContain("ghost");
  });

  // Demanding a roster before notes can exist is the wrong order.
  it("does not cross-check attendees when there is no roster", async () => {
    await seedNote(NOTE().replace("[cpheinrich]", "[anyone]"));
    expect((await validateTeam(root)).issues).toEqual([]);
  });

  /**
   * `break` skipped the id check for *every* note, not just the attendee
   * cross-check — and no-roster-with-notes is the state `morpheus init`
   * scaffolds, so `team validate` printed a clean sweep over unvalidated ids.
   * The previous test could not tell `break` from `continue`, because its note
   * had an id that already agreed.
   */
  it("still checks the id against occurred when there is no roster", async () => {
    await seedNote(
      NOTE()
        .replace("[cpheinrich]", "[anyone]")
        .replace('"2026-08-03T09:30:00-07:00"', '"2026-08-03T14:00:00-07:00"'),
    );
    expect((await validateTeam(root)).issues[0]!.message).toContain("derived from the meeting's start");
  });

  it("treats a missing roster as absent, not as an error", async () => {
    const r = await validateTeam(root);
    expect(r.issues).toEqual([]);
    expect(r.members).toEqual([]);
  });

  it("reports a malformed roster rather than ignoring it", async () => {
    await seedMembers("members:\n  - name: No handle here");
    expect((await validateTeam(root)).issues.length).toBeGreaterThan(0);
  });

  it("catches a duplicate member", async () => {
    await seedMembers(
      "members:\n  - github: cpheinrich\n    name: Chris H\n  - github: cpheinrich\n    name: Chris Again",
    );
    expect((await validateTeam(root)).issues[0]!.message).toContain("duplicate");
  });

  // The id is derived from `occurred`; if they disagree, one was hand-edited
  // and the filename no longer sorts chronologically.
  it("catches an id that disagrees with when the meeting happened", async () => {
    await seedMembers();
    await seedNote(NOTE().replace('"2026-08-03T09:30:00-07:00"', '"2026-08-03T14:00:00-07:00"'));
    expect((await validateTeam(root)).issues[0]!.message).toContain("derived from the meeting's start");
  });
});

describe("hq/team paths", () => {
  it("puts inboxes at the root of the team folder", () => {
    expect(INBOX_DIR).toBe("hq/team");
  });

  // Otherwise `inbox validate` reads the roster as an inbox and reports three
  // schema errors about a perfectly valid file.
  it("knows which files in the folder are not inboxes", () => {
    expect(TEAM_RESERVED.has("members.md")).toBe(true);
    expect(TEAM_RESERVED.has("readme.md")).toBe(true);
    expect(TEAM_RESERVED.has("cpheinrich.md")).toBe(false);
  });

  /**
   * Three readers now: `inbox validate`, `doctor`, and `pm block`'s owner
   * inference. Each one that hand-wrote the exclusion reported the roster as a
   * broken inbox — the same failure, found three times in one afternoon.
   */
  it("is used by every reader of the folder, not re-listed", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join: j } = await import("node:path");
    for (const f of ["src/cli/inbox.ts", "src/doctor/index.ts", "src/cli/pm.ts", "src/cli/voice.ts"]) {
      const src = await readFile(j(import.meta.dirname, "..", f), "utf8");
      expect(src, `${f} should use TEAM_RESERVED`).toContain("TEAM_RESERVED");
      expect(src, `${f} should not hand-write the exclusion`).not.toMatch(/!==\s*"readme\.md"/);
    }
  });

  /**
   * A scaffolded template naming the old path is invisible here and only shows
   * up in a *new* project — the worst place to discover it, because the person
   * hitting it has no reason to suspect Morpheus rather than their own repo.
   */
  it("leaves no source file pointing at the old inbox path", async () => {
    const { readFile, readdir } = await import("node:fs/promises");
    const { join: j } = await import("node:path");

    // Narrower than the bug: the first version checked one file, and three
    // more stale references survived it — including an onboarding instruction
    // whose own detector disagreed with it.
    const root = j(import.meta.dirname, "..", "src");
    const walk = async (d: string): Promise<string[]> => {
      const out: string[] = [];
      for (const e of await readdir(d, { withFileTypes: true })) {
        const full = j(d, e.name);
        if (e.isDirectory()) out.push(...(await walk(full)));
        else if (e.name.endsWith(".ts")) out.push(full);
      }
      return out;
    };

    for (const f of await walk(root)) {
      // `paths.ts` names the legacy directory on purpose, for the migration.
      if (f.endsWith("paths.ts")) continue;
      expect(await readFile(f, "utf8"), `${f} still names the old path`).not.toContain("hq/inbox/");
    }
  });

  it("scaffolds a team README that covers more than inboxes", async () => {
    const { dirReadmes } = await import("../src/init/templates.js");
    const readme = dirReadmes["hq/team"]!({ name: "Acme" } as never);
    expect(readme).toContain("members.md");
    expect(readme).toContain("meeting-notes");
  });

  it("counts everything under hq/team as a record", () => {
    expect(isRecordsOnly(["hq/team/cpheinrich.md"])).toBe(true);
    expect(isRecordsOnly(["hq/team/meeting-notes/MO-26-08-03-09.30.00-x.md"])).toBe(true);
    expect(isRecordsOnly(["hq/team/members.md", "src/x.ts"])).toBe(false);
  });
});

describe("the beat's meeting context", () => {
  const NOW = new Date("2026-08-10T12:00:00Z");
  const note = (id: string, occurred: string, roadmap: string[] = []) =>
    ({ path: `/x/${id}.md`, body: "", data: { id, title: `Note ${id}`, occurred, roadmap } }) as Item<{
      id: string;
      title: string;
      occurred: string;
      roadmap: string[];
    }>;

  // Absence and emptiness are different answers, the same distinction the rest
  // of the beat draws.
  it("reports null rather than zero when a project keeps no notes", () => {
    expect(meetingContext([], NOW).sinceLastNote).toBeNull();
  });

  it("measures staleness from the most recent note", () => {
    const c = meetingContext(
      [note("a", "2026-08-01T09:00:00-07:00"), note("b", "2026-08-08T09:00:00-07:00")],
      NOW,
    );
    expect(c.sinceLastNote).toBe(1);
  });

  /**
   * Capture with no decay path is the failure this folder is most likely to
   * have. A note that filed nothing is the visible form of it.
   */
  it("surfaces notes that produced no roadmap items, oldest first", () => {
    const c = meetingContext(
      [
        note("a", "2026-08-01T09:00:00-07:00"),
        note("b", "2026-08-08T09:00:00-07:00", ["MO-26-08-08-10.00.00"]),
        note("c", "2026-07-20T09:00:00-07:00"),
      ],
      NOW,
    );
    expect(c.unpromoted.map((u) => u.id)).toEqual(["c", "a"]);
  });

  it("is empty when every note produced something", () => {
    const c = meetingContext([note("a", "2026-08-08T09:00:00-07:00", ["MO-1"])], NOW);
    expect(c.unpromoted).toEqual([]);
  });

  it("reaches the beat, so the gap is visible without a connector", () => {
    const beat = assess({
      items: [],
      goals: [],
      claims: [],
      config: DEFAULT_CONFIG,
      now: NOW,
      notes: [note("a", "2026-08-01T09:00:00-07:00")],
    });
    expect(beat.meetings.sinceLastNote).toBe(8);
    expect(beat.meetings.unpromoted).toHaveLength(1);
  });
});
