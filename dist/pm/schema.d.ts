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
 * An ISO date (YYYY-MM-DD) tolerant of YAML's date handling.
 *
 * YAML parses an unquoted `2026-07-01` into a Date object, so frontmatter
 * would otherwise fail validation unless every date were quoted. Normalising
 * here keeps the files natural to write by hand. js-yaml parses as UTC, so
 * slicing the ISO string cannot shift the day.
 */
export declare const isoDate: z.ZodPreprocess<z.ZodISODate>;
/**
 * An ISO timestamp with an offset, tolerant of YAML's date handling.
 *
 * Same trap as `isoDate` one layer up: YAML parses an unquoted
 * `2026-08-03T09:30:00-07:00` into a Date, so a meeting note written the
 * natural way fails with "expected string, received Date".
 *
 * **The offset is preserved rather than normalised to UTC.** A meeting note's
 * id reads as the wall clock of the people who were in it, and converting to
 * UTC here would make a 09:30 meeting in Berlin disagree with its own filename.
 * A Date has already lost the offset, so one recovered from YAML is rendered in
 * UTC and will simply not match — which is the honest outcome: quote the value.
 */
export declare const isoDateTime: z.ZodPreprocess<z.ZodISODateTime>;
/**
 * A scalar that YAML will happily turn into a number.
 *
 * `target: 1` is the most natural thing to write for a numeric goal, and
 * unquoted YAML makes it a number, which a plain `z.string()` rejects with
 * "expected string, received number" — a message about types, for a mistake
 * nobody made. Same family as `isoDate`: the file is right and the parser
 * has to meet it.
 */
export declare const looseString: z.ZodPreprocess<z.ZodString>;
/**
 * `blocked` is the third exit, alongside finishing and failing.
 *
 * Without it an agent that meets real ambiguity takes the worse option and
 * guesses, because there is nowhere to put "started, stopped, here is what I
 * need". It sits next to `in-progress` rather than near `dropped`: the work is
 * live and its branch is still held, it is just waiting on an answer.
 */
export declare const RoadmapStatus: z.ZodEnum<{
    backlog: "backlog";
    "in-progress": "in-progress";
    blocked: "blocked";
    review: "review";
    shipped: "shipped";
    dropped: "dropped";
}>;
export declare const Priority: z.ZodEnum<{
    P0: "P0";
    P1: "P1";
    P2: "P2";
    P3: "P3";
}>;
export declare const RoadmapItem: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    status: z.ZodEnum<{
        backlog: "backlog";
        "in-progress": "in-progress";
        blocked: "blocked";
        review: "review";
        shipped: "shipped";
        dropped: "dropped";
    }>;
    priority: z.ZodDefault<z.ZodEnum<{
        P0: "P0";
        P1: "P1";
        P2: "P2";
        P3: "P3";
    }>>;
    goal: z.ZodOptional<z.ZodString>;
    owner: z.ZodDefault<z.ZodEnum<{
        agent: "agent";
        human: "human";
    }>>;
    prs: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
    issues: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
    acceptance: z.ZodOptional<z.ZodString>;
    needs: z.ZodOptional<z.ZodString>;
    created: z.ZodPreprocess<z.ZodISODate>;
    updated: z.ZodPreprocess<z.ZodISODate>;
}, z.core.$strip>;
export declare const Goal: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    horizon: z.ZodEnum<{
        annual: "annual";
        quarterly: "quarterly";
    }>;
    period: z.ZodString;
    metric: z.ZodPreprocess<z.ZodString>;
    target: z.ZodPreprocess<z.ZodString>;
    current: z.ZodOptional<z.ZodPreprocess<z.ZodString>>;
    status: z.ZodEnum<{
        "on-track": "on-track";
        "at-risk": "at-risk";
        missed: "missed";
        achieved: "achieved";
    }>;
}, z.core.$strip>;
export declare const Request: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    source: z.ZodEnum<{
        agent: "agent";
        support: "support";
        analytics: "analytics";
        investor: "investor";
        founder: "founder";
    }>;
    status: z.ZodEnum<{
        new: "new";
        triaged: "triaged";
        accepted: "accepted";
        declined: "declined";
        duplicate: "duplicate";
    }>;
    roadmap: z.ZodOptional<z.ZodString>;
    created: z.ZodPreprocess<z.ZodISODate>;
}, z.core.$strip>;
export declare const JournalEntry: z.ZodObject<{
    date: z.ZodPreprocess<z.ZodISODate>;
    agent: z.ZodEnum<{
        human: "human";
        claude: "claude";
        codex: "codex";
    }>;
    roadmap: z.ZodOptional<z.ZodString>;
    outcome: z.ZodEnum<{
        blocked: "blocked";
        shipped: "shipped";
        abandoned: "abandoned";
        research: "research";
    }>;
    summary: z.ZodString;
}, z.core.$strip>;
export type RoadmapItem = z.infer<typeof RoadmapItem>;
export type Goal = z.infer<typeof Goal>;
export type Request = z.infer<typeof Request>;
export type JournalEntry = z.infer<typeof JournalEntry>;
export type RoadmapStatus = z.infer<typeof RoadmapStatus>;
export type Priority = z.infer<typeof Priority>;
/** The artifact kinds that live as one-file-per-item under hq/product/. */
export declare const ARTIFACTS: {
    readonly roadmap: {
        readonly schema: z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            status: z.ZodEnum<{
                backlog: "backlog";
                "in-progress": "in-progress";
                blocked: "blocked";
                review: "review";
                shipped: "shipped";
                dropped: "dropped";
            }>;
            priority: z.ZodDefault<z.ZodEnum<{
                P0: "P0";
                P1: "P1";
                P2: "P2";
                P3: "P3";
            }>>;
            goal: z.ZodOptional<z.ZodString>;
            owner: z.ZodDefault<z.ZodEnum<{
                agent: "agent";
                human: "human";
            }>>;
            prs: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
            issues: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
            acceptance: z.ZodOptional<z.ZodString>;
            needs: z.ZodOptional<z.ZodString>;
            created: z.ZodPreprocess<z.ZodISODate>;
            updated: z.ZodPreprocess<z.ZodISODate>;
        }, z.core.$strip>;
        readonly dir: "roadmap";
        readonly label: "Roadmap";
    };
    readonly goals: {
        readonly schema: z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            horizon: z.ZodEnum<{
                annual: "annual";
                quarterly: "quarterly";
            }>;
            period: z.ZodString;
            metric: z.ZodPreprocess<z.ZodString>;
            target: z.ZodPreprocess<z.ZodString>;
            current: z.ZodOptional<z.ZodPreprocess<z.ZodString>>;
            status: z.ZodEnum<{
                "on-track": "on-track";
                "at-risk": "at-risk";
                missed: "missed";
                achieved: "achieved";
            }>;
        }, z.core.$strip>;
        readonly dir: "goals";
        readonly label: "Goals";
    };
    readonly requests: {
        readonly schema: z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            source: z.ZodEnum<{
                agent: "agent";
                support: "support";
                analytics: "analytics";
                investor: "investor";
                founder: "founder";
            }>;
            status: z.ZodEnum<{
                new: "new";
                triaged: "triaged";
                accepted: "accepted";
                declined: "declined";
                duplicate: "duplicate";
            }>;
            roadmap: z.ZodOptional<z.ZodString>;
            created: z.ZodPreprocess<z.ZodISODate>;
        }, z.core.$strip>;
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
