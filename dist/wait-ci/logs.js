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
/** `gh` prints `<job>\t<step>\t<timestamp> <text>`; the step is often `UNKNOWN STEP`. */
const TIMESTAMP = /^﻿?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z ?/;
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
/** ANSI that arrived already rendered as text — `^[[36;1m` — when a log was copied through a terminal. */
const CARET_ANSI = /\^\[\[[0-9;?]*[A-Za-z]/g;
export const LINE_WIDTH = 200;
export const HEAD_LINES = 15;
export function stripAnsi(text) {
    return text.replace(ANSI, "").replace(CARET_ANSI, "");
}
/** The text of one log line, without job and step columns, BOM, timestamp or colour. */
export function logText(raw) {
    const parts = raw.split("\t");
    const text = parts.length >= 3 ? parts.slice(2).join("\t") : raw;
    return stripAnsi(text.replace(TIMESTAMP, "")).replace(/\s+$/, "");
}
function clip(line) {
    return line.length > LINE_WIDTH ? `${line.slice(0, LINE_WIDTH - 1)}…` : line;
}
/** Consecutive identical lines become one, with a count — a retry loop otherwise fills the budget. */
export function collapseRepeats(lines) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
        let j = i + 1;
        while (j < lines.length && lines[j] === lines[i])
            j++;
        out.push(j - i > 1 ? `${lines[i]}  (×${j - i})` : lines[i]);
        i = j;
    }
    return out;
}
/**
 * The failing step's output, de-duplicated, ANSI-stripped and cut to
 * `maxLines`. Over budget, the first {@link HEAD_LINES} and the tail are kept:
 * a diff or stack names its subject at the top, and a test runner summarises at
 * the bottom.
 */
export function trimFailedLog(raw, maxLines = 60) {
    const texts = raw.split(/\r?\n/).filter((l) => l.length > 0).map(logText);
    let errorAt = -1;
    for (let i = texts.length - 1; i >= 0; i--) {
        if (texts[i].startsWith("##[error]")) {
            errorAt = i;
            break;
        }
    }
    let start = 0;
    let step;
    let end = texts.length;
    if (errorAt >= 0) {
        end = errorAt + 1;
        for (let i = errorAt; i >= 0; i--) {
            const header = /^##\[group\]Run (.*)$/.exec(texts[i]);
            if (header) {
                step = clip(header[1].trim());
                start = i + 1;
                const close = texts.slice(start, errorAt).findIndex((t) => t === "##[endgroup]");
                if (close >= 0)
                    start += close + 1;
                break;
            }
        }
    }
    else {
        // No error marker: a cancelled or timed-out job. Its last lines before
        // cleanup are the best evidence there is.
        const cleanup = texts.findIndex((t) => t === "Post job cleanup.");
        if (cleanup >= 0)
            end = cleanup;
        start = Math.max(0, end - maxLines);
    }
    const body = collapseRepeats(texts.slice(start, end).filter((t) => !/^##\[(end)?group\]/.test(t)).map((t) => clip(t.replace(/^##\[error\]/, "error: "))));
    if (body.length <= maxLines)
        return { step, lines: body, omitted: 0, omittedAfter: body.length };
    const head = Math.min(HEAD_LINES, Math.floor(maxLines / 4));
    const tail = maxLines - head;
    return { step, lines: [...body.slice(0, head), ...body.slice(body.length - tail)], omitted: body.length - head - tail, omittedAfter: head };
}
const LABEL_RACE = "agent-reviewed label is not applied";
/**
 * A `conventions` failure whose only blocking issue is the missing
 * `agent-reviewed` label. That is the expected state of a PR whose review has
 * not been recorded yet, not a defect in its code; agents chasing it waste a
 * cycle. Any other `✗` in the same output makes it a real failure.
 */
export function isLabelRace(checkName, lines) {
    if (!/conventions/.test(checkName))
        return false;
    const blocking = lines.filter((l) => l.startsWith("✗"));
    return blocking.length > 0 && blocking.every((l) => l.includes(LABEL_RACE));
}
//# sourceMappingURL=logs.js.map