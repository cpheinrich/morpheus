import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * The commit a roadmap item was written against.
 *
 * `created:` says which day; this says which *repository*. For an item written
 * by someone outside the project — the case MO-054 exists to support — that is
 * the difference between "this was reported in August" and "this was reported
 * against exactly this tree", months later when the surrounding code has moved.
 *
 * Returns null rather than throwing when git cannot answer: outside a
 * repository, or in a fresh clone with no commits. An item is still worth
 * writing without it, and an allocator that fails on a missing nicety is worse
 * than one that records what it can.
 */
export async function headSha(cwd: string, ref = "origin/main"): Promise<string | null> {
  for (const candidate of [ref, "HEAD"]) {
    try {
      const { stdout } = await exec("git", ["rev-parse", "--short=12", candidate], { cwd });
      const sha = stdout.trim();
      if (sha) return sha;
    } catch {
      // Try the next candidate: a repo with no `origin/main` still has a HEAD.
    }
  }
  return null;
}
