import { z } from "zod";
import { HANDLE } from "../inbox/schema.js";
import { isoDate, isoDateTime } from "../pm/schema.js";

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
export const Member = z.object({
  /** GitHub handle. Also names this person's inbox: `hq/team/<github>.md`. */
  github: z.string().regex(HANDLE, "must be a GitHub handle"),
  name: z.string().min(2),
  role: z.string().optional(),
  /**
   * Free prose about how to work with this person.
   *
   * The highest-value field here and the only one an agent cannot derive from
   * the repo. It reaches a voice session's standing explainer and a reviewer's
   * sense of who wrote a change.
   */
  context: z.string().optional(),
  /**
   * Identifiers in other systems, so a chat message or a calendar invite can be
   * attributed to the same person a commit can.
   */
  channels: z.record(z.string(), z.string()).optional(),
});
export type Member = z.infer<typeof Member>;

export const Members = z.object({
  members: z.array(Member).min(1),
});
export type Members = z.infer<typeof Members>;

/** Where a meeting note came from. `session` is an agent in the meeting. */
export const NoteSource = z.enum(["session", "granola", "manual", "otter", "zoom"]);

/**
 * A meeting note — a **summary**, never a transcript.
 *
 * Settled 2026-08-03: whoever takes the notes distils them into the canonical
 * format in `hq/team/meeting-notes/README.md`. That is the decision that makes
 * this affordable — a transcript is high volume and low signal, and storing
 * transcripts would make an agent's context worse rather than better.
 */
export const MeetingNote = z
  .object({
    /**
     * `PREFIX-YY-MM-DD-HH.MM.SS`, same shape as a roadmap id — but taken from
     * **when the meeting happened**, not when the file was written.
     *
     * Roadmap ids come from the creation clock because nothing better exists. A
     * meeting has a real event time, and using creation time would sort notes by
     * when somebody got round to writing them rather than by when things were
     * said. Same format, different source, and worth stating because an
     * unstated difference between two identical-looking things is how they rot.
     */
    id: z.string().regex(/^[A-Z]{2,4}-\d{2}-\d{2}-\d{2}-\d{2}\.\d{2}\.\d{2}$/, "must look like MO-26-08-03-09.30.00"),
    title: z.string().min(3),
    /** The meeting's start, with an offset. The id is derived from this. */
    occurred: isoDateTime,
    /** GitHub handles. Validated against members.yaml by `team validate`. */
    attendees: z.array(z.string().regex(HANDLE)).min(1),
    /** Who wrote the summary — an agent name or a handle. */
    recorded_by: z.string().min(2),
    source: NoteSource,
    /** Lets the original be re-fetched; never itself the note. */
    source_ref: z.string().optional(),
    duration_minutes: z.number().int().positive().optional(),
    /**
     * Roadmap ids this meeting produced, once they have been filed.
     *
     * Empty is honest — it means nothing has been filed yet, not that nothing
     * was decided. The action items live in the body until they become items.
     */
    roadmap: z.array(z.string()).default([]),
    /**
     * Written by the note-taker after redacting. See the README.
     *
     * **Defaults to `false`, so omitting it fails.** The first version defaulted
     * to `true`, which meant the only note refused was one that *declared* it
     * had skipped the pass — while the person who forgot the line entirely, who
     * is the whole population this field exists for, sailed through. Silence has
     * to read as "not yet redacted" or the gate is decorative.
     */
    redacted: z.boolean().default(false),
    created: isoDate,
  })
  /**
   * A note that has not been through the redaction pass must not merge.
   *
   * The pass strips off-topic personal conversation and anything that would
   * embarrass a participant. Making it a schema field rather than a convention
   * means `team validate` refuses in CI, and the note-taker has to make a
   * positive claim rather than forget.
   */
  .refine((n) => n.redacted, {
    error: "meeting notes must be redacted before they are committed — see meeting-notes/README.md",
    path: ["redacted"],
  });
export type MeetingNote = z.infer<typeof MeetingNote>;
