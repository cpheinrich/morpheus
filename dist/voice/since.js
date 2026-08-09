import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
const exec = promisify(execFile);
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
export const HANDOFF_DIR = "local/handoffs";
/** `2026-08-01-voice-handoff.md` → `2026-08-01`. */
const DATED = /^(\d{4}-\d{2}-\d{2})-.+\.md$/;
/**
 * The date of the most recent handoff, or null when there is none.
 *
 * Null rather than a default window, because "we have never done this" and "we
 * spoke a week ago" call for different briefs, and collapsing them would
 * silently truncate the first one — the shape `learned.md` records as *a check
 * that skips what is absent will report an empty thing as correct*.
 */
export function latestHandoffDate(filenames) {
    const dates = filenames
        .map((f) => DATED.exec(f)?.[1])
        .filter((d) => Boolean(d))
        .sort();
    return dates.length ? dates[dates.length - 1] : null;
}
async function git(args, cwd) {
    const { stdout } = await exec("git", args, { cwd });
    return stdout.trim();
}
/**
 * Read the delta since the last handoff.
 *
 * An unreadable git history reports `unavailable`, not an empty list. A brief
 * claiming "nothing has shipped" when it simply could not look would send a
 * voice session off to redesign work that already exists.
 */
export async function readSince(root) {
    let date = null;
    try {
        date = latestHandoffDate(await readdir(join(root, HANDOFF_DIR)));
    }
    catch {
        // No handoff directory yet is a legitimate first run, not a failure.
    }
    try {
        // The time is not optional. Git's approxidate fills a bare `YYYY-MM-DD`
        // with the *current time of day*, not midnight — so at 5pm, `--since` on
        // today's date hides everything committed before 5pm. Caught by running
        // this for real: a day with sixteen merged pull requests reported as
        // "nothing has landed".
        const args = ["log", "--format=%s", "--no-merges"];
        if (date)
            args.push(`--since=${date} 00:00:00`);
        else
            args.push("-20");
        const out = await git(args, root);
        return { date, commits: out ? out.split("\n").filter(Boolean) : [], unavailable: false };
    }
    catch {
        return { date, commits: [], unavailable: true };
    }
}
//# sourceMappingURL=since.js.map