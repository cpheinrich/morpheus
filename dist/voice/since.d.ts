/**
 * What has happened since the last handoff.
 *
 * The delta is the reason the brief can stay short. A voice session that
 * already has the standing explainer does not need the project re-described —
 * it needs to know what moved, and "what moved" is bounded by when we last
 * talked.
 *
 * The boundary comes from the handoff directory itself rather than a stored
 * cursor. A cursor is state that can disagree with reality; the files are the
 * reality, and their names already carry dates.
 */
/** `local/handoffs/`, canonical because handoffs are never committed. */
export declare const HANDOFF_DIR = "local/handoffs";
/**
 * The date of the most recent handoff, or null when there is none.
 *
 * Null rather than a default window, because "we have never done this" and "we
 * spoke a week ago" call for different briefs, and collapsing them would
 * silently truncate the first one — the shape `learned.md` records as *a check
 * that skips what is absent will report an empty thing as correct*.
 */
export declare function latestHandoffDate(filenames: string[]): string | null;
export interface Since {
    /** ISO date the delta starts from, or null when this is the first handoff. */
    date: string | null;
    /** Commit subjects since that date, newest first. */
    commits: string[];
    /** True when git could not be read — distinct from "nothing happened". */
    unavailable: boolean;
}
/**
 * Read the delta since the last handoff.
 *
 * An unreadable git history reports `unavailable`, not an empty list. A brief
 * claiming "nothing has shipped" when it simply could not look would send a
 * voice session off to redesign work that already exists.
 */
export declare function readSince(root: string): Promise<Since>;
