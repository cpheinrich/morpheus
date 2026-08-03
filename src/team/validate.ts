import { readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { MEETING_NOTES_DIR, MEMBERS_FILE } from "../paths.js";
import { parseDir, type ParseIssue } from "../pm/parse.js";
import { MeetingNote, Members, type Member } from "./schema.js";

/**
 * Validating collaborative context.
 *
 * Issues are returned as data rather than thrown, the same as `pm/parse.ts`, so
 * one malformed note cannot hide the other nineteen.
 */

export interface TeamValidation {
  members: Member[];
  noteCount: number;
  issues: ParseIssue[];
}

async function readMembers(root: string): Promise<{ members: Member[]; issues: ParseIssue[] }> {
  const path = join(root, MEMBERS_FILE);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    // A project with no roster is legitimate — Morpheus itself has one person
    // and no need to write it down. Absence is not an error; a *malformed*
    // roster is.
    return { members: [], issues: [] };
  }

  let data: unknown;
  try {
    data = matter(raw).data;
  } catch (err) {
    const detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return { members: [], issues: [{ path, message: `invalid frontmatter — ${detail}` }] };
  }

  const parsed = Members.safeParse(data);
  if (!parsed.success) {
    return {
      members: [],
      issues: parsed.error.issues.map((i) => ({
        path,
        message: `${i.path.join(".") || "(root)"}: ${i.message}`,
      })),
    };
  }

  const seen = new Set<string>();
  const issues: ParseIssue[] = [];
  for (const m of parsed.data.members) {
    if (seen.has(m.github)) {
      issues.push({ path, message: `duplicate member ${m.github}` });
    }
    seen.add(m.github);
  }
  return { members: parsed.data.members, issues };
}

/**
 * Check the roster and every meeting note.
 *
 * The cross-check is the point: **an attendee must resolve to a member.** A
 * handle that resolves to nobody is either a typo or a collaborator nobody
 * wrote down, and both are worth catching — the second is the one that makes a
 * roster go stale without anybody noticing.
 */
export async function validateTeam(root: string): Promise<TeamValidation> {
  const { members, issues } = await readMembers(root);
  const known = new Set(members.map((m) => m.github));

  const { items, issues: noteIssues } = await parseDir(join(root, MEETING_NOTES_DIR), MeetingNote);
  const all = [...issues, ...noteIssues];

  for (const note of items) {
    // Only cross-check when a roster exists. With none, an attendee list is
    // still useful and refusing it would make notes unusable before the roster
    // is written — which is the wrong order to demand.
    if (known.size === 0) break;

    for (const who of note.data.attendees) {
      if (!known.has(who)) {
        all.push({
          path: note.path,
          message: `attendee "${who}" is not in ${MEMBERS_FILE} — a typo, or somebody nobody wrote down`,
        });
      }
    }

    // The id encodes the meeting's start; if it disagrees with `occurred`, one
    // of the two was edited and the filename no longer sorts chronologically.
    const stamp = note.data.id.slice(note.data.id.indexOf("-") + 1);
    const expected = expectedStamp(note.data.occurred);
    if (stamp !== expected) {
      all.push({
        path: note.path,
        message: `id says ${stamp} but occurred is ${expected} — the id is derived from the meeting's start`,
      });
    }
  }

  return { members, noteCount: items.length, issues: all };
}

/**
 * `YY-MM-DD-HH.MM.SS` from an offset timestamp, in that timestamp's own zone.
 *
 * Deliberately *not* the fixed Pacific zone roadmap ids use. A meeting's id
 * should read as the wall clock of the people who were in it — a 09:30 meeting
 * in Berlin is `09.30.00`, because that is what everyone in the room would call
 * it, and the offset in `occurred` keeps the absolute instant recoverable.
 */
export function expectedStamp(occurred: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(occurred);
  if (!m) return "";
  const [, y, mo, d, h, mi, s] = m;
  return `${y!.slice(2)}-${mo}-${d}-${h}.${mi}.${s}`;
}
