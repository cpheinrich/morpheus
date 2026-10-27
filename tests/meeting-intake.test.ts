import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DiscoveryNote,
  buildCatalog,
  completionNotice,
  parseMeetingIntakeConfig,
  readCanonicalRecords,
  renderIndex,
  runMeetingIntake,
  searchCatalog,
  type DiscoveryRecord,
  type MeetingIntakeConfig,
} from "../src/meeting-intake/index.js";

const revision = "a".repeat(40);

const evo = parseMeetingIntakeConfig({
  schemaVersion: 1,
  project: "evo",
  timeZone: "America/Los_Angeles",
  canonical: {
    repository: "darwin-health/darwin",
    directory: "hq/team/meeting-notes",
    webBase: "https://darwin.health/hq/team/meeting-notes",
  },
  projection: {
    directory: "hq/team/meeting-notes",
    title: "Meeting notes — Darwin records relevant to Evo",
    description: "Darwin owns the full records; this generated catalog is a discovery aid.",
    contextLabel: "Evo",
    runbook: "../../../docs/runbooks/meeting-intake.md",
  },
  gmail: {
    account: "cpheinrich@gmail.com",
    noteSenders: ["gemini-notes@google.com"],
    failureSenders: ["meetings-noreply@google.com"],
  },
  collaborators: {
    cpheinrich: ["cpheinrich@gmail.com", "chris@darwin.health"],
    "robbie-del": ["robbie@example.com"],
  },
  topicVocabulary: ["engineering", "operations", "hardware"],
  notification: { adapter: "zoe-text", recipient: "darwin", authorized: true },
});

const lakina = parseMeetingIntakeConfig({
  schemaVersion: 1,
  project: "lakina",
  timeZone: "America/Los_Angeles",
  canonical: {
    repository: "cpheinrich/lakinacapital",
    directory: "hq/team/meeting-notes",
    webBase: "https://lakinacapital.com/hq/team/meeting-notes",
  },
  gmail: {
    account: "cpheinrich@gmail.com",
    noteSenders: ["gemini-notes@google.com"],
    failureSenders: [],
  },
  collaborators: {
    cpheinrich: ["cpheinrich@gmail.com"],
    alexoedelman: ["alexoedelman@gmail.com"],
  },
  topicVocabulary: ["research", "operations", "strategy"],
});

function record(
  config: MeetingIntakeConfig,
  day = "26",
  changes: Record<string, unknown> = {},
): DiscoveryRecord {
  const id = `${config.project === "lakina" ? "LK" : "DW"}-26-10-${day}-11.39.00`;
  return {
    path: `${config.canonical.directory}/${id}-synthetic.md`,
    raw: "Synthetic redacted business record only.",
    data: DiscoveryNote.parse({
      id,
      title: "Synthetic product review",
      occurred: `2026-10-${day}T11:39:00-07:00`,
      attendees: config.project === "lakina" ? ["cpheinrich", "alexoedelman"] : ["cpheinrich", "robbie-del"],
      recorded_by: "codex",
      source: "manual",
      redacted: true,
      created: "2026-10-26",
      discovery_version: 1,
      projects: [config.project],
      topics: [config.topicVocabulary[0]],
      summary: "Discussed the project and its source context.",
      intake_policy: "current",
      source_kind: "gemini-generated-notes",
      source_coverage: "full-notes",
      source_ids: {
        gmail_messages: [`gmail-${config.project}-${day}`],
        google_documents: [`document-${config.project}-${day}`],
        calendar_events: [`event-${config.project}-${day}`],
      },
      ...changes,
    }),
  };
}

function ready(config: MeetingIntakeConfig) {
  return {
    occurred: "2026-10-26T11:39:00-07:00",
    projects: [config.project],
    hqUrl: `${config.canonical.webBase}/LK-26-10-26-11.39.00-synthetic/`,
    noteSha256: "b".repeat(64),
    intakePolicy: "current",
    delivery: {
      note: {
        status: "verified",
        prUrl: "https://github.com/cpheinrich/lakinacapital/pull/1",
        revision,
      },
      index: {
        status: "verified",
        prUrl: "https://github.com/darwin-health/evo/pull/1",
        revision,
        noteDigest: "b".repeat(64),
      },
      actions: { status: "recorded", count: 2 },
    },
  };
}

function serialize(note: DiscoveryRecord): string {
  return (
    `---\n` +
    Object.entries(note.data)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n") +
    `\n---\n\nSynthetic committed body.\n`
  );
}

describe("meeting-intake profiles and projection", () => {
  it("keeps project policy in config and refuses ambiguous collaborator identities", () => {
    expect(evo.projection?.directory).toBe("hq/team/meeting-notes");
    expect(lakina.projection).toBeUndefined();
    expect(() =>
      parseMeetingIntakeConfig({
        ...lakina,
        collaborators: {
          cpheinrich: ["same@example.com"],
          alexoedelman: ["same@example.com"],
        },
      }),
    ).toThrow(/already assigned/);
    for (const directory of ["../outside", "..\\outside", "line\nbreak"]) {
      expect(() =>
        parseMeetingIntakeConfig({
          ...lakina,
          canonical: { ...lakina.canonical, directory },
        }),
      ).toThrow(/repository-relative/);
    }
  });

  it("projects Evo records, selects a scoped mixed summary and never copies the body", () => {
    const mixed = record(evo, "26", {
      projects: ["darwin", "evo"],
      summary: "Company hardware details stay in the canonical record.",
      project_summaries: { evo: "Discussed app capture tests and device coverage." },
    });
    const catalog = buildCatalog(
      [record(evo, "05"), record(evo, "09", { projects: ["darwin"] }), mixed],
      revision,
      evo,
    );
    expect(catalog.entries.map((entry) => entry.id)).toEqual([
      mixed.data.id,
      record(evo, "05").data.id,
    ]);
    expect(catalog.entries[0]!.summary).not.toContain("Company hardware");
    expect(catalog.entries[0]!.sourceCoverage).toBe("full-notes");
    expect(catalog.entries[0]!.repositoryUrl).toContain(`/blob/${revision}/`);
    expect(JSON.stringify(catalog)).not.toContain("Synthetic redacted business record only");
  });

  it("supports a same-repository Lakina profile without manufacturing a projection", () => {
    const catalog = buildCatalog(
      [record(lakina, "03", { intake_policy: "historical-notes-only" })],
      revision,
      lakina,
    );
    expect(catalog.project).toBe("lakina");
    expect(catalog.entries[0]!.policy).toBe("historical-notes-only");
    expect(() => renderIndex(catalog, lakina)).toThrow(/no catalog projection/);
  });

  it("rejects unredacted notes, unknown topics, mixed notes without a scoped summary and unsafe inputs", () => {
    expect(() => record(evo, "26", { redacted: false })).toThrow(/redacted/);
    expect(() => buildCatalog([record(evo, "26", { topics: ["legal"] })], revision, evo)).toThrow(
      /Unknown topic/,
    );
    expect(
      buildCatalog(
        [record(evo, "26", { projects: ["darwin"], topics: ["darwin-only"] })],
        revision,
        evo,
      ).entries,
    ).toEqual([]);
    expect(() =>
      buildCatalog([record(evo, "26", { projects: ["darwin", "evo"] })], revision, evo),
    ).toThrow(/Mixed meeting/);
    expect(() =>
      buildCatalog([{ ...record(evo), path: "../../outside.md" }], revision, evo),
    ).toThrow(/path/);
    expect(() => buildCatalog([record(evo)], "main", evo)).toThrow(/full commit/);
  });

  it("deduplicates meeting, Gmail, Calendar and Docs identities before filtering by project", () => {
    expect(() => buildCatalog([record(evo), record(evo)], revision, evo)).toThrow(/meeting id/);
    for (const field of ["gmail_messages", "google_documents", "calendar_events"] as const) {
      const firstIds = {
        gmail_messages: ["mail-first"],
        google_documents: ["doc-first"],
        calendar_events: ["event-first"],
      };
      const secondIds = {
        gmail_messages: ["mail-second"],
        google_documents: ["doc-second"],
        calendar_events: ["event-second"],
      };
      firstIds[field] = ["duplicate"];
      secondIds[field] = ["duplicate"];
      expect(() =>
        buildCatalog(
          [
            record(evo, "26", { source_ids: firstIds }),
            record(evo, "09", { source_ids: secondIds, projects: ["darwin"] }),
          ],
          revision,
          evo,
        ),
      ).toThrow(/source identity/);
    }
  });

  it("renders escaped deterministic metadata and performs bounded search", () => {
    const catalog = buildCatalog(
      [
        record(evo, "26", {
          summary: "Capture | test [link] <script> context.",
          intake_policy: "historical-notes-only",
        }),
      ],
      revision,
      evo,
    );
    const output = renderIndex(catalog, evo);
    expect(output).toContain("Capture &#124; test \\[link\\] &lt;script&gt;");
    expect(output).toContain("full-notes");
    expect(output).toContain("historical-notes-only");
    expect(output).toBe(renderIndex(catalog, evo));
    expect(searchCatalog(catalog, "capture", "engineering")).toHaveLength(1);
    expect(searchCatalog(catalog, "capture", "operations")).toEqual([]);
    expect(() => searchCatalog(catalog, "", undefined, 21)).toThrow(/1–20/);
  });
});

describe("publication completion gate", () => {
  it("formats only a fully verified current Evo delivery", () => {
    expect(completionNotice(ready(evo), evo)).toContain("October 26, 2026");
    expect(completionNotice(ready(evo), evo)).toContain("along with the action items");
    const noActions = ready(evo);
    noActions.delivery.actions.count = 0;
    expect(completionNotice(noActions, evo)).toContain("no new action items");
  });

  it("blocks historical, stale, partial, repeated, uncertain and unauthorized notices", () => {
    const historical = { ...ready(evo), intakePolicy: "historical-notes-only" };
    expect(() => completionNotice(historical, evo)).toThrow();
    const stale = ready(evo);
    stale.delivery.index.noteDigest = "c".repeat(64);
    expect(() => completionNotice(stale, evo)).toThrow(/stale/);
    const waived = {
      ...ready(evo),
      delivery: {
        ...ready(evo).delivery,
        index: { status: "not-applicable" },
      },
    };
    expect(() => completionNotice(waived, evo)).toThrow(/requires/);
    const partial = {
      ...ready(evo),
      delivery: {
        ...ready(evo).delivery,
        note: { ...ready(evo).delivery.note, status: "pending" },
      },
    };
    expect(() => completionNotice(partial, evo)).toThrow();
    for (const status of ["sent", "sending", "uncertain"]) {
      expect(() => completionNotice({ ...ready(evo), notification: { status } }, evo)).toThrow(
        /reconcile/,
      );
    }
    expect(completionNotice({ ...ready(evo), notification: { status: "pending" } }, evo)).toContain(
      "Meeting notes",
    );
    expect(() => completionNotice({ ...ready(evo), notification: "sent" }, evo)).toThrow();
    expect(() =>
      completionNotice({ ...ready(evo), notification: { status: "unexpected" } }, evo),
    ).toThrow();
    expect(() => completionNotice(ready(lakina), lakina)).toThrow(/does not authorize/);
    const offProject = ready(evo);
    offProject.projects = ["darwin"];
    expect(() => completionNotice(offProject, evo)).toThrow(/outside the evo project/);
  });
});

describe("committed Git source adapter and CLI guide", () => {
  it("ignores dirty files and refuses wrong origins, invalid metadata and empty corpora", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meeting-source-test-"));
    const git = (...args: string[]): string =>
      execFileSync("git", ["-C", directory, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    try {
      git("init", "-b", "main");
      git("config", "user.name", "Synthetic test");
      git("config", "user.email", "test@example.invalid");
      git("remote", "add", "origin", "https://github.com/cpheinrich/lakinacapital.git");
      git("-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", "Empty source");
      await expect(readCanonicalRecords(directory, "HEAD", lakina)).rejects.toThrow(/No canonical/);

      const note = record(lakina);
      const path = join(directory, note.path);
      await mkdir(join(directory, lakina.canonical.directory), { recursive: true });
      const raw = serialize(note);
      await writeFile(path, raw);
      git("add", ".");
      git("-c", "core.hooksPath=/dev/null", "commit", "-m", "Synthetic note");
      const sha = git("rev-parse", "HEAD");
      await writeFile(path, "Uncommitted and invalid content");
      const result = await readCanonicalRecords(directory, "HEAD", lakina);
      expect(result.revision).toBe(sha);
      expect(result.records[0]!.raw).toBe(raw);

      await mkdir(join(directory, ".morpheus"), { recursive: true });
      await writeFile(
        join(directory, ".morpheus/meeting-intake.json"),
        `${JSON.stringify(lakina, null, 2)}\n`,
      );
      const output = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        expect(await runMeetingIntake(["search", "--query", "project"], directory)).toBe(0);
        expect(output.mock.calls.flat().join("\n")).toContain(note.data.id);
      } finally {
        output.mockRestore();
      }

      git("remote", "set-url", "origin", "https://github.com/unrelated/repository.git");
      await expect(readCanonicalRecords(directory, "HEAD", lakina)).rejects.toThrow(/repository/);

      git("remote", "set-url", "origin", "https://github.com/cpheinrich/lakinacapital.git");
      await writeFile(path, "---\nid: invalid\n---\n");
      git("add", ".");
      git("-c", "core.hooksPath=/dev/null", "commit", "-m", "Invalid metadata");
      await expect(readCanonicalRecords(directory, "HEAD", lakina)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("generates, verifies and searches an optional projection from one exact source revision", async () => {
    const source = await mkdtemp(join(tmpdir(), "meeting-canonical-test-"));
    const project = await mkdtemp(join(tmpdir(), "meeting-project-test-"));
    const git = (...args: string[]): string =>
      execFileSync("git", ["-C", source, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      git("init", "-b", "main");
      git("config", "user.name", "Synthetic test");
      git("config", "user.email", "test@example.invalid");
      git("remote", "add", "origin", "https://github.com/darwin-health/darwin.git");
      const note = record(evo);
      await mkdir(join(source, evo.canonical.directory), { recursive: true });
      await writeFile(join(source, note.path), serialize(note));
      git("add", ".");
      git("-c", "core.hooksPath=/dev/null", "commit", "-m", "Synthetic note");

      await mkdir(join(project, ".morpheus"), { recursive: true });
      await writeFile(
        join(project, ".morpheus/meeting-intake.json"),
        `${JSON.stringify(evo, null, 2)}\n`,
      );
      const base = ["index", "--source", source, "--revision", "HEAD"];
      expect(await runMeetingIntake(base, project)).toBe(0);
      expect(await runMeetingIntake([...base, "--check"], project)).toBe(0);
      expect(await runMeetingIntake(["search", "--query", "product"], project)).toBe(0);

      const destination = join(project, evo.projection!.directory);
      expect(JSON.parse(await readFile(join(destination, "catalog.json"), "utf8"))).toMatchObject({
        project: "evo",
        entries: [{ id: note.data.id }],
      });
      expect(await readFile(join(destination, "README.md"), "utf8")).toContain(
        evo.projection!.title,
      );

      await writeFile(join(source, note.path), "dirty and invalid");
      expect(await runMeetingIntake([...base, "--check"], project)).toBe(0);
    } finally {
      output.mockRestore();
      await rm(source, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  });

  it("prints the shared guide without requiring project config", async () => {
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await runMeetingIntake(["guide"], "/does/not/need/to/exist")).toBe(0);
      expect(output.mock.calls.flat().join("\n")).toContain("Historical imports are notes only");
    } finally {
      output.mockRestore();
    }
  });
});
