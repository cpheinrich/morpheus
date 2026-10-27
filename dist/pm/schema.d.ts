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
export { ROADMAP_ID };
export declare const GOAL_ID: RegExp;
export declare const REQUEST_ID: RegExp;
/** The project prefix an id belongs to, or null if it is malformed. */
export declare function prefixOf(id: string): string | null;
/**
 * An ISO date (YYYY-MM-DD) compatible with legacy YAML date handling.
 *
 * Older YAML parsers converted an unquoted `2026-07-01` — or a full timestamp
 * such as `2026-08-18T13:15:00.000Z` — into a Date object, which this sliced to
 * its day. The current parser returns every one of those as a string, so a
 * timestamp string keeps its date part too: without that, files the old parser
 * accepted fail with "Invalid ISO date" (#466). The date is the one written,
 * not the UTC day, the same choice `isoDateTime` makes for offsets. Legacy Date
 * values are UTC, so slicing their ISO string cannot shift the day.
 */
export declare const isoDate: any;
/**
 * An ISO timestamp with an offset, compatible with legacy YAML date handling.
 *
 * Older YAML parsers converted an unquoted `2026-08-03T09:30:00-07:00` into a
 * Date. The current parser returns a string, but accepting both preserves
 * compatibility with already-materialised metadata.
 *
 * **The offset is preserved rather than normalised to UTC.** A meeting note's
 * id reads as the wall clock of the people who were in it, and converting to
 * UTC here would make a 09:30 meeting in Berlin disagree with its own filename.
 * A Date has already lost the offset, so one recovered from YAML is rendered in
 * UTC and will simply not match — which is the honest outcome: quote the value.
 */
export declare const isoDateTime: any;
/**
 * A scalar that YAML will happily turn into a number.
 *
 * `target: 1` is the most natural thing to write for a numeric goal, and
 * unquoted YAML makes it a number, which a plain `z.string()` rejects with
 * "expected string, received number" — a message about types, for a mistake
 * nobody made. Same family as `isoDate`: the file is right and the parser
 * has to meet it.
 */
export declare const looseString: any;
/**
 * `blocked` is the third exit, alongside finishing and failing.
 *
 * Without it an agent that meets real ambiguity takes the worse option and
 * guesses, because there is nowhere to put "started, stopped, here is what I
 * need". It sits next to `in-progress` rather than near `dropped`: the work is
 * live and its branch is still held, it is just waiting on an answer.
 */
export declare const RoadmapStatus: any;
export declare const Priority: any;
/** Subject metadata, independent of a role, claim or execution permission. */
export declare const WorkTags: any;
export declare const RoadmapItem: any;
export declare const Goal: any;
export declare const Request: any;
export declare const JournalEntry: any;
export type RoadmapItem = z.infer<typeof RoadmapItem>;
export type Goal = z.infer<typeof Goal>;
export type Request = z.infer<typeof Request>;
export type JournalEntry = z.infer<typeof JournalEntry>;
export type RoadmapStatus = z.infer<typeof RoadmapStatus>;
export type Priority = z.infer<typeof Priority>;
/** The artifact kinds that live as one-file-per-item under hq/product/. */
export declare const ARTIFACTS: {
    readonly roadmap: {
        readonly schema: any;
        readonly dir: "roadmap";
        readonly label: "Roadmap";
    };
    readonly goals: {
        readonly schema: any;
        readonly dir: "goals";
        readonly label: "Goals";
    };
    readonly requests: {
        readonly schema: any;
        readonly dir: "requests";
        readonly label: "Requests";
    };
};
export type ArtifactKind = keyof typeof ARTIFACTS;
/** Maps an artifact kind to the type its files parse into. */
export interface ArtifactTypes {
    roadmap: RoadmapItem;
    goals: Goal;
    requests: Request;
}
