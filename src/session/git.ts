import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The canonical trunk. `ContextReceipt.remoteSha` is its tip and nothing
 * else — the question a lease answers is whether the trunk moved under this
 * session, which is what another agent merging does.
 */
export const TRUNK = "main";

async function git(root: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run("git", args, { cwd: root, timeout: 15_000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * The tip of `origin/main`, straight from the remote.
 *
 * `ls-remote` rather than `rev-parse origin/main`, which reads a local ref
 * that is only as current as the last fetch — the exact "looks checked, is
 * not" failure the lease exists to catch. Null when the remote could not be
 * reached, which `observeLease` turns into `unknown` and never into unchanged.
 */
export async function trunkSha(root: string): Promise<string | null> {
  const out = await git(root, ["ls-remote", "origin", TRUNK]);
  return out ? (out.split(/\s+/)[0] ?? null) : null;
}

export async function currentBranch(root: string): Promise<string> {
  return (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])) ?? "(detached)";
}

/**
 * The repository root of the *worktree* this process is in — not the common
 * git dir, which every worktree shares. Session identity is per-worktree, so
 * `--show-toplevel` is the right question.
 */
export async function worktreeRoot(root: string): Promise<string> {
  return (await git(root, ["rev-parse", "--show-toplevel"])) ?? root;
}

/**
 * What landed on the trunk between two SHAs, for a refresh to show rather
 * than merely assert. An agent told "the remote advanced" and nothing else
 * has to go looking; one `git log` is the difference between a prompt and an
 * answer.
 */
export async function trunkLog(root: string, from: string, to: string): Promise<string[]> {
  // `--no-walk` is wrong here and `from..to` needs both objects locally, so a
  // fetch of the trunk is part of asking. It is cheap and it is the only
  // network call a refresh makes beyond `ls-remote`.
  await git(root, ["fetch", "--quiet", "origin", TRUNK]);
  const out = await git(root, ["log", "--oneline", "--no-decorate", `${from}..${to}`]);
  return out ? out.split("\n").filter(Boolean) : [];
}
