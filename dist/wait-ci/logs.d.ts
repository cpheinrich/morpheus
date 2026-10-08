/**
 * Reducing `gh run view --job <id> --log-failed` to the lines an agent needs.
 *
 * The raw log is the whole job — runner banner, every earlier step, then
 * post-job cleanup — typically 400 to 3,000 lines with the failure somewhere
 * in the middle. Its last 60 lines are git cleanup, so a naive tail shows
 * nothing useful. The failure is the output of the step that contains the
 * last `##[error]`, between that step's `##[endgroup]` (which closes the echoed
 * script and its env) and the error itself.
 */
export declare const LINE_WIDTH = 200;
export declare const HEAD_LINES = 15;
export declare function stripAnsi(text: string): string;
/** The text of one log line, without job and step columns, BOM, timestamp or colour. */
export declare function logText(raw: string): string;
export interface TrimmedLog {
    /** The failing step, from its `Run …` header, when one was found. */
    step?: string;
    lines: string[];
    /** Lines dropped from the middle to fit the budget. */
    omitted: number;
    /** How many kept lines precede the gap, when `omitted` is non-zero. */
    omittedAfter: number;
}
/** Consecutive identical lines become one, with a count — a retry loop otherwise fills the budget. */
export declare function collapseRepeats(lines: string[]): string[];
/**
 * The failing step's output, de-duplicated, ANSI-stripped and cut to
 * `maxLines`. Over budget, the first {@link HEAD_LINES} and the tail are kept:
 * a diff or stack names its subject at the top, and a test runner summarises at
 * the bottom.
 */
export declare function trimFailedLog(raw: string, maxLines?: number): TrimmedLog;
/**
 * A `conventions` failure whose only blocking issue is the missing
 * `agent-reviewed` label. That is the expected state of a PR whose review has
 * not been recorded yet, not a defect in its code; agents chasing it waste a
 * cycle. Any other `✗` in the same output makes it a real failure.
 */
export declare function isLabelRace(checkName: string, lines: string[]): boolean;
