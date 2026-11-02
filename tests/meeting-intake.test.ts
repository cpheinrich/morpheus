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
const priorityBody = `## Executive summary

The product review selected the next delivery boundary.

## Key decisions

- Keep the first release small enough to verify with current fixtures.

## Key action items

- @owner will document the migration.

## Detailed notes

Supporting evidence belongs after the outcomes.`;

const projected = parseMeetingIntakeConfig({
  schemaVersion: 1,
  project: "projected",
  timeZone: "America/Los_Angeles",
  canonical: {
    repository: "example-org/canonical-records",
    directory: "hq/team/meeting-notes",
    webBase: "https://canonical.example.test/hq/meeting-notes",
  },
  projection: {
    directory: "hq/team/meeting-notes",
    title: "Meeting notes — canonical records relevant to Projected",
    description: "The canonical repository owns full records; this catalog is a discovery aid.",
    contextLabel: "Projected",
    runbook: "../../../docs/runbooks/meeting-intake.md",
  },
  gmail: {
    account: "operator@example.test",
    noteSenders: ["gemini-notes@google.com"],
    failureSenders: ["meetings-noreply@google.com"],
  },
  collaborators: {
    owner: ["operator@example.test", "owner@example.test"],
    collaborator: ["collaborator@example.test"],
  },
  topicVocabulary: ["engineering", "operations", "hardware"],
  notification: { adapter: "zoe-text", recipient: "projected-group", authorized: true },
});

const direct = parseMeetingIntakeConfig({
  schemaVersion: 1,
  project: "direct",
  timeZone: "America/Los_Angeles",
  canonical: {
    repository: "example-org/direct-records",
    directory: "hq/team/meeting-notes",
    webBase: "https://direct.example.test/hq/meeting-notes",
  },
  gmail: {
    account: "operator@example.test",
    noteSenders: ["gemini-notes@google.com"],
    failureSenders: [],
  },
  collaborators: {
    owner: ["operator@example.test"],
    partner: ["partner@example.test"],
  },
  topicVocabulary: ["research", "operations", "strategy"],
});

const directWithSummary = parseMeetingIntakeConfig({
  ...direct,
  notification: {
    adapter: "zoe-text",
    recipient: "direct-group",
    authorized: true,
    includeSummary: true,
  },
});

function record(
  config: MeetingIntakeConfig,
  day = "26",
  changes: Record<string, unknown> = {},
): DiscoveryRecord {
  const id = `${config.project === "direct" ? "DR" : "PR"}-26-10-${day}-11.39.00`;
  return {
    path: `${config.canonical.directory}/${id}-synthetic.md`,
    raw: "Synthetic redacted business record only.",
    data: DiscoveryNote.parse({
      id,
      title: "Synthetic product review",
      occurred: `2026-10-${day}T11:39:00-07:00`,
      attendees: config.project === "direct" ? ["owner", "partner"] : ["owner", "collaborator"],
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
    hqUrl: `${config.canonical.webBase}/NT-26-10-26-11.39.00-synthetic/`,
    noteSha256: "b".repeat(64),
    intakePolicy: "current",
    summary: "Discussed the project and its source context.",
    delivery: {
      note: {
        status: "verified",
        prUrl: "https://github.com/example-org/direct-records/pull/1",
        revision,
      },
      index: {
        status: "verified",
        prUrl: "https://github.com/example-org/projected-index/pull/1",
        revision,
        noteDigest: "b".repeat(64),
      },
      actions: { status: "recorded", count: 2 },
    },
  };
}

function serialize(note: DiscoveryRecord): string {
  const body = note.data.note_format === "priority-first-v1" ? priorityBody : "Synthetic committed body.";
  return (
    `---\n` +
    Object.entries(note.data)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n") +
    `\n---\n\n${body}\n`
  );
}

describe("meeting-intake profiles and projection", () => {
  it("keeps project policy in config and refuses ambiguous collaborator identities", () => {
    expect(projected.projection?.directory).toBe("hq/team/meeting-notes");
    expect(direct.projection).toBeUndefined();
    expect(() =>
      parseMeetingIntakeConfig({
        ...direct,
        collaborators: {
          owner: ["same@example.com"],
          partner: ["same@example.com"],
        },
      }),
    ).toThrow(/already assigned/);
    for (const directory of ["../outside", "..\\outside", "line\nbreak"]) {
      expect(() =>
        parseMeetingIntakeConfig({
          ...direct,
          canonical: { ...direct.canonical, directory },
        }),
      ).toThrow(/repository-relative/);
    }
  });

  it("requires new discovery records to declare the priority-first format", () => {
    expect(() => record(direct, "26", { discovery_version: 2 })).toThrow(
      /requires priority-first-v1/,
    );
    expect(
      record(direct, "26", {
        discovery_version: 2,
        note_format: "priority-first-v1",
      }).data.discovery_version,
    ).toBe(2);
    expect(record(direct).data.discovery_version).toBe(1);
  });

  it("projects configured records, selects a scoped mixed summary and never copies the body", () => {
    const mixed = record(projected, "26", {
      projects: ["canonical", "projected"],
      summary: "Company hardware details stay in the canonical record.",
      project_summaries: { projected: "Discussed app capture tests and device coverage." },
    });
    const catalog = buildCatalog(
      [record(projected, "05"), record(projected, "09", { projects: ["canonical"] }), mixed],
      revision,
      projected,
    );
    expect(catalog.entries.map((entry) => entry.id)).toEqual([
      mixed.data.id,
      record(projected, "05").data.id,
    ]);
    expect(catalog.entries[0]!.summary).not.toContain("Company hardware");
    expect(catalog.entries[0]!.sourceCoverage).toBe("full-notes");
    expect(catalog.entries[0]!.repositoryUrl).toContain(`/blob/${revision}/`);
    expect(JSON.stringify(catalog)).not.toContain("Synthetic redacted business record only");
  });

  it("supports a same-repository profile without manufacturing a projection", () => {
    const catalog = buildCatalog(
      [record(direct, "03", { intake_policy: "historical-notes-only" })],
      revision,
      direct,
    );
    expect(catalog.project).toBe("direct");
    expect(catalog.entries[0]!.policy).toBe("historical-notes-only");
    expect(() => renderIndex(catalog, direct)).toThrow(/no catalog projection/);
  });

  it("rejects unredacted notes, unknown topics, mixed notes without a scoped summary and unsafe inputs", () => {
    expect(() => record(projected, "26", { redacted: false })).toThrow(/redacted/);
    expect(() => buildCatalog([record(projected, "26", { topics: ["legal"] })], revision, projected)).toThrow(
      /Unknown topic/,
    );
    expect(
      buildCatalog(
        [record(projected, "26", { projects: ["canonical"], topics: ["canonical-only"] })],
        revision,
        projected,
      ).entries,
    ).toEqual([]);
    expect(() =>
      buildCatalog([record(projected, "26", { projects: ["canonical", "projected"] })], revision, projected),
    ).toThrow(/Mixed meeting/);
    expect(() =>
      buildCatalog([{ ...record(projected), path: "../../outside.md" }], revision, projected),
    ).toThrow(/path/);
    expect(() => buildCatalog([record(projected)], "main", projected)).toThrow(/full commit/);
  });

  it("deduplicates meeting, Gmail, Calendar and Docs identities before filtering by project", () => {
    expect(() => buildCatalog([record(projected), record(projected)], revision, projected)).toThrow(/meeting id/);
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
            record(projected, "26", { source_ids: firstIds }),
            record(projected, "09", { source_ids: secondIds, projects: ["canonical"] }),
          ],
          revision,
          projected,
        ),
      ).toThrow(/source identity/);
    }
  });

  it("renders escaped deterministic metadata and performs bounded search", () => {
    const catalog = buildCatalog(
      [
        record(projected, "26", {
          summary: "Capture | test [link] <script> context.",
          intake_policy: "historical-notes-only",
        }),
      ],
      revision,
      projected,
    );
    const output = renderIndex(catalog, projected);
    expect(output).toContain("Capture &#124; test \\[link\\] &lt;script&gt;");
    expect(output).toContain("full-notes");
    expect(output).toContain("historical-notes-only");
    expect(output).toBe(renderIndex(catalog, projected));
    expect(searchCatalog(catalog, "capture", "engineering")).toHaveLength(1);
    expect(searchCatalog(catalog, "capture", "operations")).toEqual([]);
    expect(() => searchCatalog(catalog, "", undefined, 21)).toThrow(/1–20/);
  });
});

describe("publication completion gate", () => {
  it("formats only a fully verified current delivery", () => {
    expect(completionNotice(ready(projected), projected)).toBe(
      "Meeting notes for October 26, 2026 have been summarized and recorded, " +
        "along with the action items. " +
        "https://canonical.example.test/hq/meeting-notes/NT-26-10-26-11.39.00-synthetic/",
    );
    const noActions = ready(projected);
    noActions.delivery.actions.count = 0;
    expect(completionNotice(noActions, projected)).toBe(
      "Meeting notes for October 26, 2026 have been summarized and recorded; " +
        "no new action items were filed. " +
        "https://canonical.example.test/hq/meeting-notes/NT-26-10-26-11.39.00-synthetic/",
    );
    expect(completionNotice({ ...ready(projected), summary: "invalid\nsummary" }, projected)).toBe(
      "Meeting notes for October 26, 2026 have been summarized and recorded, " +
        "along with the action items. " +
        "https://canonical.example.test/hq/meeting-notes/NT-26-10-26-11.39.00-synthetic/",
    );
  });

  it("includes a bounded summary only when the authorized profile requests it", () => {
    expect(completionNotice(ready(directWithSummary), directWithSummary)).toBe(
      "Meeting notes for October 26, 2026 have been summarized and recorded. " +
        "Discussed the project and its source context. " +
        "The action items were also recorded. " +
        "https://direct.example.test/hq/meeting-notes/NT-26-10-26-11.39.00-synthetic/",
    );
    const missing = ready(directWithSummary);
    delete (missing as Partial<typeof missing>).summary;
    expect(() => completionNotice(missing, directWithSummary)).toThrow(
      /requires the verified note summary/,
    );
    for (const summary of ["Invalid summary\ncontinued", "x".repeat(501)]) {
      expect(() =>
        completionNotice({ ...ready(directWithSummary), summary }, directWithSummary),
      ).toThrow();
    }
  });

  it("allows a verified note notice before separate action promotion", () => {
    const pendingActions = {
      ...ready(directWithSummary),
      delivery: {
        ...ready(directWithSummary).delivery,
        actions: { status: "not-promoted" },
      },
    };
    expect(completionNotice(pendingActions, directWithSummary)).toBe(
      "Meeting notes for October 26, 2026 have been summarized and recorded. " +
        "Discussed the project and its source context. " +
        "Key action items remain in the meeting note; separate task promotion is pending. " +
        "https://direct.example.test/hq/meeting-notes/NT-26-10-26-11.39.00-synthetic/",
    );
    const projectedPending = {
      ...ready(projected),
      delivery: {
        ...ready(projected).delivery,
        actions: { status: "not-promoted" },
      },
    };
    expect(completionNotice(projectedPending, projected)).toBe(
      "Meeting notes for October 26, 2026 have been summarized and recorded. " +
        "Key action items remain in the meeting note; separate task promotion is pending. " +
        "https://canonical.example.test/hq/meeting-notes/NT-26-10-26-11.39.00-synthetic/",
    );
  });

  it("blocks historical, stale, partial, repeated, uncertain and unauthorized notices", () => {
    const historical = { ...ready(projected), intakePolicy: "historical-notes-only" };
    expect(() => completionNotice(historical, projected)).toThrow();
    const stale = ready(projected);
    stale.delivery.index.noteDigest = "c".repeat(64);
    expect(() => completionNotice(stale, projected)).toThrow(/stale/);
    const waived = {
      ...ready(projected),
      delivery: {
        ...ready(projected).delivery,
        index: { status: "not-applicable" },
      },
    };
    expect(() => completionNotice(waived, projected)).toThrow(/requires/);
    const partial = {
      ...ready(projected),
      delivery: {
        ...ready(projected).delivery,
        note: { ...ready(projected).delivery.note, status: "pending" },
      },
    };
    expect(() => completionNotice(partial, projected)).toThrow();
    for (const status of ["sent", "sending", "uncertain"]) {
      expect(() => completionNotice({ ...ready(projected), notification: { status } }, projected)).toThrow(
        /reconcile/,
      );
    }
    expect(completionNotice({ ...ready(projected), notification: { status: "pending" } }, projected)).toContain(
      "Meeting notes",
    );
    expect(() => completionNotice({ ...ready(projected), notification: "sent" }, projected)).toThrow();
    expect(() =>
      completionNotice({ ...ready(projected), notification: { status: "unexpected" } }, projected),
    ).toThrow();
    const invalidActions = ready(projected);
    invalidActions.delivery.actions = { status: "unknown", count: 0 };
    expect(() => completionNotice(invalidActions, projected)).toThrow();
    expect(() => completionNotice(ready(direct), direct)).toThrow(/does not authorize/);
    const offProject = ready(projected);
    offProject.projects = ["unrelated"];
    expect(() => completionNotice(offProject, projected)).toThrow(/outside the projected project/);
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
      git("remote", "add", "origin", "https://github.com/example-org/direct-records.git");
      git("-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", "Empty source");
      await expect(readCanonicalRecords(directory, "HEAD", direct)).rejects.toThrow(/No canonical/);

      const note = record(direct, "26", {
        discovery_version: 2,
        note_format: "priority-first-v1",
      });
      const path = join(directory, note.path);
      await mkdir(join(directory, direct.canonical.directory), { recursive: true });
      const raw = serialize(note);
      await writeFile(path, raw);
      git("add", ".");
      git("-c", "core.hooksPath=/dev/null", "commit", "-m", "Synthetic note");
      const sha = git("rev-parse", "HEAD");
      await writeFile(path, "Uncommitted and invalid content");
      const result = await readCanonicalRecords(directory, "HEAD", direct);
      expect(result.revision).toBe(sha);
      expect(result.records[0]!.raw).toBe(raw);

      await mkdir(join(directory, ".morpheus"), { recursive: true });
      await writeFile(
        join(directory, ".morpheus/meeting-intake.json"),
        `${JSON.stringify(direct, null, 2)}\n`,
      );
      const output = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        expect(await runMeetingIntake(["search", "--query", "project"], directory)).toBe(0);
        expect(output.mock.calls.flat().join("\n")).toContain(note.data.id);
      } finally {
        output.mockRestore();
      }

      git("remote", "set-url", "origin", "https://github.com/unrelated/repository.git");
      await expect(readCanonicalRecords(directory, "HEAD", direct)).rejects.toThrow(/repository/);

      git("remote", "set-url", "origin", "https://github.com/example-org/direct-records.git");
      await writeFile(
        path,
        raw.replace(
          "The product review selected the next delivery boundary.",
          "```text\n```",
        ),
      );
      git("add", ".");
      git("-c", "core.hooksPath=/dev/null", "commit", "-m", "Invalid note structure");
      await expect(readCanonicalRecords(directory, "HEAD", direct)).rejects.toThrow(
        /Executive summary.*must contain/,
      );

      await writeFile(path, "---\nid: invalid\n---\n");
      git("add", ".");
      git("-c", "core.hooksPath=/dev/null", "commit", "-m", "Invalid metadata");
      await expect(readCanonicalRecords(directory, "HEAD", direct)).rejects.toThrow();
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
      git("remote", "add", "origin", "https://github.com/example-org/canonical-records.git");
      const note = record(projected);
      await mkdir(join(source, projected.canonical.directory), { recursive: true });
      await writeFile(join(source, note.path), serialize(note));
      git("add", ".");
      git("-c", "core.hooksPath=/dev/null", "commit", "-m", "Synthetic note");

      await mkdir(join(project, ".morpheus"), { recursive: true });
      await writeFile(
        join(project, ".morpheus/meeting-intake.json"),
        `${JSON.stringify(projected, null, 2)}\n`,
      );
      const base = ["index", "--source", source, "--revision", "HEAD"];
      expect(await runMeetingIntake(base, project)).toBe(0);
      expect(await runMeetingIntake([...base, "--check"], project)).toBe(0);
      expect(await runMeetingIntake(["search", "--query", "product"], project)).toBe(0);

      const destination = join(project, projected.projection!.directory);
      expect(JSON.parse(await readFile(join(destination, "catalog.json"), "utf8"))).toMatchObject({
        project: "projected",
        entries: [{ id: note.data.id }],
      });
      expect(await readFile(join(destination, "README.md"), "utf8")).toContain(
        projected.projection!.title,
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
      expect(output.mock.calls.flat().join("\n")).toContain("discovery_version: 2");
      expect(output.mock.calls.flat().join("\n")).toContain("## Executive summary");
    } finally {
      output.mockRestore();
    }
  });
});
