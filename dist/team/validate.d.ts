import { type ParseIssue } from "../pm/parse.js";
import { type Member } from "./schema.js";
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
/**
 * Check the roster and every meeting note.
 *
 * The cross-check is the point: **an attendee must resolve to a member.** A
 * handle that resolves to nobody is either a typo or a collaborator nobody
 * wrote down, and both are worth catching — the second is the one that makes a
 * roster go stale without anybody noticing.
 */
export declare function validateTeam(root: string): Promise<TeamValidation>;
/**
 * `YY-MM-DD-HH.MM.SS` from an offset timestamp, in that timestamp's own zone.
 *
 * Deliberately *not* the fixed Pacific zone roadmap ids use. A meeting's id
 * should read as the wall clock of the people who were in it — a 09:30 meeting
 * in Berlin is `09.30.00`, because that is what everyone in the room would call
 * it, and the offset in `occurred` keeps the absolute instant recoverable.
 */
export declare function expectedStamp(occurred: string): string;
