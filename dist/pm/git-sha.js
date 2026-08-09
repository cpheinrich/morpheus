import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
/**
 * The commit a roadmap item was written against.
 *
 * `created:` says which day; this says which *repository*. For an item written
 * by someone outside the project — the case MO-054 exists to support — that is
 * the difference between "this was reported in August" and "this was reported
 * against exactly this tree", months later when the code has moved.
 *
 * **`HEAD`, not `origin/main`.** The first draft preferred `origin/main`, which
 * answers the wrong question twice over:
 *
 * - For an external contributor, `origin` is *their fork*. The point of the
 *   field is to record the version they were actually using when they hit the
 *   problem, which may be well behind upstream — recording upstream's tip
 *   asserts they were on code they may never have run.
 * - Even internally, `origin/main` is a remote-tracking ref reflecting the last
 *   `git fetch`, not what is checked out. An agent on a feature branch would
 *   have recorded a commit it was not working from.
 *
 * `HEAD` is the commit the author actually had. That is the whole question.
 *
 * Returns null rather than throwing when git cannot answer — outside a
 * repository, or in a fresh clone with no commits. An item is still worth
 * writing without it, and an allocator that fails on a missing nicety is worse
 * than one that records what it can.
 */
export async function headSha(cwd, ref = "HEAD") {
    try {
        const { stdout } = await exec("git", ["rev-parse", "--short=12", ref], { cwd });
        return stdout.trim() || null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=git-sha.js.map