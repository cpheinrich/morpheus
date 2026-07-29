import { z } from "zod";

/**
 * Schemas for the file-based project management artifacts.
 *
 * These are the single definition of shape. The same schemas are used to
 * validate frontmatter in CI, parse files for /hq, and generate the index
 * tables in each directory's README.md.
 */

export const ROADMAP_ID = /^RM-\d{3,}$/;
export const GOAL_ID = /^G-\d{4}-(Q[1-4]|ANNUAL)-\d{2}$/;
export const REQUEST_ID = /^FR-\d{3,}$/;

/**
 * An ISO date (YYYY-MM-DD) tolerant of YAML's date handling.
 *
 * YAML parses an unquoted `2026-07-01` into a Date object, so frontmatter
 * would otherwise fail validation unless every date were quoted. Normalising
 * here keeps the files natural to write by hand. js-yaml parses as UTC, so
 * slicing the ISO string cannot shift the day.
 */
export const isoDate = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.iso.date(),
);

export const RoadmapStatus = z.enum([
  "backlog",
  "in-progress",
  "review",
  "shipped",
  "dropped",
]);

export const Priority = z.enum(["P0", "P1", "P2", "P3"]);

export const RoadmapItem = z.object({
  id: z.string().regex(ROADMAP_ID, "must look like RM-014"),
  title: z.string().min(3),
  status: RoadmapStatus,
  priority: Priority.default("P2"),
  goal: z.string().regex(GOAL_ID).optional(),
  owner: z.enum(["agent", "human"]).default("agent"),
  prs: z.array(z.number().int().positive()).default([]),
  acceptance: z.string().optional(),
  created: isoDate,
  updated: isoDate,
});

export const Goal = z.object({
  id: z.string().regex(GOAL_ID, "must look like G-2026-Q3-01"),
  title: z.string().min(3),
  horizon: z.enum(["annual", "quarterly"]),
  period: z.string().min(4),
  metric: z.string().min(1),
  target: z.string().min(1),
  current: z.string().optional(),
  status: z.enum(["on-track", "at-risk", "missed", "achieved"]),
});

export const Request = z.object({
  id: z.string().regex(REQUEST_ID, "must look like FR-007"),
  title: z.string().min(3),
  source: z.enum(["support", "analytics", "investor", "founder", "agent"]),
  status: z.enum(["new", "triaged", "accepted", "declined", "duplicate"]),
  roadmap: z.string().regex(ROADMAP_ID).optional(),
  created: isoDate,
});

export const JournalEntry = z.object({
  date: isoDate,
  agent: z.enum(["claude", "codex", "human"]),
  roadmap: z.string().regex(ROADMAP_ID).optional(),
  outcome: z.enum(["shipped", "abandoned", "blocked", "research"]),
  summary: z.string().min(1),
});

export type RoadmapItem = z.infer<typeof RoadmapItem>;
export type Goal = z.infer<typeof Goal>;
export type Request = z.infer<typeof Request>;
export type JournalEntry = z.infer<typeof JournalEntry>;
export type RoadmapStatus = z.infer<typeof RoadmapStatus>;
export type Priority = z.infer<typeof Priority>;

/** The artifact kinds that live as one-file-per-item under hq/product/. */
export const ARTIFACTS = {
  roadmap: { schema: RoadmapItem, dir: "roadmap", label: "Roadmap" },
  goals: { schema: Goal, dir: "goals", label: "Goals" },
  requests: { schema: Request, dir: "requests", label: "Requests" },
} as const;

export type ArtifactKind = keyof typeof ARTIFACTS;

/** Maps an artifact kind to the type its files parse into. */
export interface ArtifactTypes {
  roadmap: RoadmapItem;
  goals: Goal;
  requests: Request;
}
