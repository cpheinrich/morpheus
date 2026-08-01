import { z } from "zod";
import { ROADMAP_ID } from "./id.js";

/**
 * Schemas for the file-based project management artifacts.
 *
 * These are the single definition of shape. The same schemas are used to
 * validate frontmatter in CI, parse files for /hq, and generate the index
 * tables in each directory's README.md.
 */

/**
 * Ids are prefixed by project, so `EV-002` is unambiguous across every repo.
 *
 * The prefix itself is declared in `morpheus.json` and validated separately —
 * these patterns only enforce *shape*, so the Zod schemas stay static rather
 * than being rebuilt per project.
 */
// Imported, not restated: `id.ts` owns the roadmap-id pattern. Two constants
// of the same name with different meanings is exactly the drift MO-004 was
// about, and the first draft of MO-057 had it — caught by a test asserting
// `MO-045` still validates.
export { ROADMAP_ID };
export const GOAL_ID = /^[A-Z]{2,4}-G-\d{4}-(Q[1-4]|ANNUAL)-\d{2}$/;
export const REQUEST_ID = /^[A-Z]{2,4}-FR-\d{3,}$/;

/** The project prefix an id belongs to, or null if it is malformed. */
export function prefixOf(id: string): string | null {
  return /^([A-Z]{2,4})-/.exec(id)?.[1] ?? null;
}

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

/**
 * A scalar that YAML will happily turn into a number.
 *
 * `target: 1` is the most natural thing to write for a numeric goal, and
 * unquoted YAML makes it a number, which a plain `z.string()` rejects with
 * "expected string, received number" — a message about types, for a mistake
 * nobody made. Same family as `isoDate`: the file is right and the parser
 * has to meet it.
 */
export const looseString = z.preprocess(
  (v) => (typeof v === "number" || typeof v === "boolean" ? String(v) : v),
  z.string().min(1),
);

/**
 * `blocked` is the third exit, alongside finishing and failing.
 *
 * Without it an agent that meets real ambiguity takes the worse option and
 * guesses, because there is nowhere to put "started, stopped, here is what I
 * need". It sits next to `in-progress` rather than near `dropped`: the work is
 * live and its branch is still held, it is just waiting on an answer.
 */
export const RoadmapStatus = z.enum([
  "backlog",
  "in-progress",
  "blocked",
  "review",
  "shipped",
  "dropped",
]);

export const Priority = z.enum(["P0", "P1", "P2", "P3"]);

export const RoadmapItem = z
  .object({
    id: z.string().regex(ROADMAP_ID, "must look like EV-014"),
    title: z.string().min(3),
    status: RoadmapStatus,
    priority: Priority.default("P2"),
    goal: z.string().regex(GOAL_ID).optional(),
    owner: z.enum(["agent", "human"]).default("agent"),
    prs: z.array(z.number().int().positive()).default([]),
    acceptance: z.string().optional(),
    /** What would unblock this. Required when `status` is `blocked`. */
    needs: z.string().optional(),
    created: isoDate,
    updated: isoDate,
  })
  /**
   * A blocked item must name its unblocker.
   *
   * "I am blocked" without "here is what I need" is a crash with better
   * manners — it stops the work and hands the reader nothing to act on. Making
   * it a schema rule rather than a convention means `pm validate` catches it in
   * CI, so the requirement costs no new mechanism.
   */
  .refine((item) => item.status !== "blocked" || (item.needs?.trim().length ?? 0) > 0, {
    error: 'status "blocked" requires a non-empty "needs" — say what would unblock it',
    path: ["needs"],
  });

export const Goal = z.object({
  id: z.string().regex(GOAL_ID, "must look like EV-G-2026-Q3-01"),
  title: z.string().min(3),
  horizon: z.enum(["annual", "quarterly"]),
  period: z.string().min(4),
  metric: looseString,
  target: looseString,
  current: looseString.optional(),
  status: z.enum(["on-track", "at-risk", "missed", "achieved"]),
});

export const Request = z.object({
  id: z.string().regex(REQUEST_ID, "must look like EV-FR-007"),
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
