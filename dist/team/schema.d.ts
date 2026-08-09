import { z } from "zod";
/**
 * Who the collaborators are, and what passed between them.
 *
 * `hq/` is otherwise organised by business *function* — product, brand,
 * finance, ops. This is a *medium*: one meeting covers three functions, so it
 * belongs to none of them. `hq/team/` is where the second category lives, and
 * inboxes were always its first member — they sat at the top of `hq/` rather
 * than under a function for exactly this reason.
 *
 * **Everything here is raw input to a distillation, never a third thing to
 * read.** §7.5 pairs each raw log with one distillation: `inbox-archive/` feeds
 * `decisions.md`, `worklog/` feeds `learned.md`. Meeting notes feed both, and
 * their action items feed the roadmap. A note whose outputs nothing traverses
 * is an archive, and an agent that must read every archive knows less, not more.
 */
/**
 * A person, not an account and not a permission.
 *
 * Deliberately **not** an access-control list. `morpheus.json`'s `hq.allowlist`
 * already grants access and is enforced against Firebase custom claims (§13).
 * Two lists of people, one of which is load-bearing for auth, is how somebody
 * gets access by editing the wrong file.
 */
export declare const Member: z.ZodObject<{
    github: z.ZodString;
    name: z.ZodString;
    role: z.ZodOptional<z.ZodString>;
    context: z.ZodOptional<z.ZodString>;
    channels: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
export type Member = z.infer<typeof Member>;
export declare const Members: z.ZodObject<{
    members: z.ZodArray<z.ZodObject<{
        github: z.ZodString;
        name: z.ZodString;
        role: z.ZodOptional<z.ZodString>;
        context: z.ZodOptional<z.ZodString>;
        channels: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Members = z.infer<typeof Members>;
/** Where a meeting note came from. `session` is an agent in the meeting. */
export declare const NoteSource: z.ZodEnum<{
    session: "session";
    granola: "granola";
    manual: "manual";
    otter: "otter";
    zoom: "zoom";
}>;
/**
 * A meeting note — a **summary**, never a transcript.
 *
 * Settled 2026-08-03: whoever takes the notes distils them into the canonical
 * format in `hq/team/meeting-notes/README.md`. That is the decision that makes
 * this affordable — a transcript is high volume and low signal, and storing
 * transcripts would make an agent's context worse rather than better.
 */
export declare const MeetingNote: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    occurred: z.ZodPreprocess<z.ZodISODateTime>;
    attendees: z.ZodArray<z.ZodString>;
    recorded_by: z.ZodString;
    source: z.ZodEnum<{
        session: "session";
        granola: "granola";
        manual: "manual";
        otter: "otter";
        zoom: "zoom";
    }>;
    source_ref: z.ZodOptional<z.ZodString>;
    duration_minutes: z.ZodOptional<z.ZodNumber>;
    roadmap: z.ZodDefault<z.ZodArray<z.ZodString>>;
    redacted: z.ZodDefault<z.ZodBoolean>;
    created: z.ZodPreprocess<z.ZodISODate>;
}, z.core.$strip>;
export type MeetingNote = z.infer<typeof MeetingNote>;
