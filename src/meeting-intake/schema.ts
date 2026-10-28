import { z } from "zod";
import { MeetingNote } from "../team/schema.js";

export const meetingSlug = z.string().regex(/^[a-z][a-z0-9-]*$/);
const repository = z.string().regex(/^[\w.-]+\/[\w.-]+$/);
const handle = z.string().regex(/^[A-Za-z0-9-]+$/);
const relativeDirectory = z
  .string()
  .min(1)
  .regex(
    /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/,
    "must use safe repository-relative path segments",
  )
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.endsWith("/") &&
      !value.split("/").some((part) => part === "" || part === "." || part === ".."),
    "must be a safe repository-relative directory",
  );
const httpsUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.search && !url.hash;
}, "must be an HTTPS URL without query or fragment");
const unique = <T>(values: T[]): boolean => new Set(values).size === values.length;
const oneLine = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => !/[\r\n]/.test(value), "must be one line");
const shortText = oneLine.min(12);

const sourceIdentifiers = z
  .object({
    gmail_messages: z.array(oneLine).default([]),
    google_documents: z.array(oneLine).default([]),
    calendar_events: z.array(oneLine).default([]),
  })
  .default({ gmail_messages: [], google_documents: [], calendar_events: [] })
  .refine(
    (ids) =>
      unique(ids.gmail_messages) &&
      unique(ids.google_documents) &&
      unique(ids.calendar_events),
    "source identifiers must be unique within a note",
  );

/** The canonical note extension shared by every Gemini meeting-intake profile. */
export const DiscoveryNote = MeetingNote.safeExtend({
  discovery_version: z.literal(1),
  projects: z.array(meetingSlug).min(1).refine(unique, "projects must be unique"),
  topics: z.array(meetingSlug).min(1).refine(unique, "topics must be unique"),
  summary: shortText,
  project_summaries: z.record(meetingSlug, shortText).default({}),
  intake_policy: z.enum(["historical-notes-only", "current"]),
  source_kind: z.enum(["session-summary", "gemini-generated-notes"]),
  source_coverage: z.enum([
    "session",
    "full-notes",
    "email-summary",
    "notes-and-transcript",
  ]),
  source_ids: sourceIdentifiers,
  occurred_basis: z
    .enum(["meeting-start", "scheduled-start", "notes-session-start"])
    .optional(),
  related: z
    .array(z.string().regex(/^[\w.-]+\/[\w.-]+:[A-Z]{2,4}-[\d.-]+$/))
    .default([])
    .refine(unique, "related records must be unique"),
}).refine(
  (note) => Object.keys(note.project_summaries).every((project) => note.projects.includes(project)),
  { path: ["project_summaries"], error: "project summaries must name a project on the meeting" },
);

export type DiscoveryNote = z.infer<typeof DiscoveryNote>;

const projection = z.object({
  directory: relativeDirectory,
  title: oneLine,
  description: shortText,
  contextLabel: oneLine.optional(),
  runbook: z.string().min(1).optional(),
});

const gmailSource = z.object({
  account: z.email(),
  noteSenders: z.array(z.email()).min(1).refine(unique),
  failureSenders: z.array(z.email()).default([]).refine(unique),
});

export const MeetingIntakeConfig = z
  .object({
    schemaVersion: z.literal(1),
    project: meetingSlug,
    timeZone: z.string().min(1).refine((value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    }, "must be an IANA time zone"),
    canonical: z.object({
      repository,
      directory: relativeDirectory,
      webBase: httpsUrl,
    }),
    projection: projection.optional(),
    gmail: gmailSource,
    collaborators: z.record(handle, z.array(z.email()).min(1).refine(unique)),
    topicVocabulary: z.array(meetingSlug).min(1).refine(unique),
    notification: z
      .object({
        adapter: z.literal("zoe-text"),
        recipient: oneLine,
        authorized: z.literal(true),
        includeSummary: z.boolean().default(false),
      })
      .optional(),
  })
  .superRefine((config, context) => {
    const emails = new Map<string, string>();
    for (const [collaborator, addresses] of Object.entries(config.collaborators)) {
      for (const address of addresses) {
        const normalized = address.toLowerCase();
        const first = emails.get(normalized);
        if (first && first !== collaborator) {
          context.addIssue({
            code: "custom",
            path: ["collaborators", collaborator],
            message: `${address} is already assigned to ${first}`,
          });
        } else {
          emails.set(normalized, collaborator);
        }
      }
    }
  });

export type MeetingIntakeConfig = z.infer<typeof MeetingIntakeConfig>;

export function parseMeetingIntakeConfig(input: unknown): MeetingIntakeConfig {
  return MeetingIntakeConfig.parse(input);
}

export function validateNotePolicy(note: DiscoveryNote, config: MeetingIntakeConfig): void {
  const allowed = new Set(config.topicVocabulary);
  const unknown = note.topics.filter((topic) => !allowed.has(topic));
  if (unknown.length > 0) {
    throw new Error(`Unknown topic${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
  }
}
