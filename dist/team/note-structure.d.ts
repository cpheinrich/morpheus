import type { MeetingNote } from "./schema.js";
export declare const PRIORITY_FIRST_SECTIONS: readonly ["Executive summary", "Key decisions", "Key action items"];
/** Validate only formats a note explicitly claims; unversioned historical notes stay readable. */
export declare function validateMeetingNoteBody(note: Pick<MeetingNote, "note_format">, body: string): string[];
