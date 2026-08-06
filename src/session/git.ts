import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** `origin/main` unless a project says otherwise. */
export const DEFAULT_TRUNK = "origin/main";

export interface TrunkRef {
  remote: string;
  branch: string;
}

/**
 * What a trunk lookup found. Three answers, not two.
 *
 * `missing` and `unreachable` rode one `null` channel until a review caught
 * it, and the whole `fresh` verdict turns on this field: a repo whose default
 * branch is not `main`, or whose remote is not `origin`, was permanently
 * `unknown` — `pm claim` and `access sync` refused forever, with a message
 * blaming a network that was fine. The same declared-thing-that-does-not-exist
 * shape as a handle without an inbox, one layer down.
 */
export type TrunkObservation =
  | { sha: string; reason?: undefined }
  | { sha: null; reason: "unreachable" | "missing" };

interface Run {
  ok: boolean;
  stdout: string;
  code: number | null;
}

async function git(root: string, args: string[]): Promise<Run> {
  try {
    const { stdout } = await run("git", args, { cwd: root, timeout: 15_000 });
    return { ok: true, stdout: stdout.trim(), code: 0 };
  } catch (error: unknown) {
    const err = error as { code?: number | string; stdout?: string };
    return {
      ok: false,
      stdout: (err.stdout ?? "").trim(),
      code: typeof err.code === "number" ? err.code : null,
    };
  }
}

async function out(root: string, args: string[]): Promise<string | null> {
  const result = await git(root, args);
  return result.ok && result.stdout ? result.stdout : null;
}

export function parseTrunk(ref: string): TrunkRef {
  const slash = ref.indexOf("/");
  if (slash <= 0) return { remote: "origin", branch: ref };
  return { remote: ref.slice(0, slash), branch: ref.slice(slash + 1) };
}

/**
 * Which ref is this project's canonical trunk.
 *
 * A declared value wins, because `origin` is **not** always canonical: for a
 * fork contributor `origin` is their fork, which AGENTS.md already states in
 * the section on id allocation. Left hardcoded, a fork's `main` would sit
 * still while the real trunk moved and the lease would certify `fresh` — the
 * exact state the protocol exists to refuse, arriving with a ✓.
 *
 * Undeclared, `origin/HEAD` is asked before falling back, so a repo whose
 * default branch is `master` or `trunk` works without configuration.
 */
export async function resolveTrunk(root: string, declared?: string): Promise<TrunkRef> {
  if (declared) return parseTrunk(declared);
  const head = await out(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  return parseTrunk(head ?? DEFAULT_TRUNK);
}

/**
 * The tip of the trunk, straight from the remote.
 *
 * `ls-remote` rather than `rev-parse origin/main`, which reads a local ref
 * only as current as the last fetch — the exact "looks checked, is not"
 * failure the lease exists to catch.
 *
 * `--exit-code` is what separates the two failures: it exits 2 when no ref
 * matches, where a plain `ls-remote` exits 0 with empty output and is
 * indistinguishable from a dead network.
 */
export async function trunkSha(root: string, trunk: TrunkRef): Promise<TrunkObservation> {
  // Fully qualified, because a bare name is a **glob against ref tails**:
  // `main` matches `refs/tags/main` and `refs/heads/feature/main` as well, and
  // the output is refname-sorted, so `feature/main` is emitted first and
  // `split()[0]` takes its SHA. The whole `fresh` verdict turns on this field.
  const ref = `refs/heads/${trunk.branch}`;
  const result = await git(root, ["ls-remote", "--exit-code", trunk.remote, ref]);
  if (result.ok) {
    const sha = result.stdout.split(/\s+/)[0];
    return sha ? { sha } : { sha: null, reason: "missing" };
  }
  return { sha: null, reason: result.code === 2 ? "missing" : "unreachable" };
}

export async function currentBranch(root: string): Promise<string> {
  return (await out(root, ["rev-parse", "--abbrev-ref", "HEAD"])) ?? "(detached)";
}

/**
 * The repository root of the *worktree* this process is in — not the common
 * git dir, which every worktree shares. Session identity is per-worktree, so
 * `--show-toplevel` is the right question.
 */
export async function worktreeRoot(root: string): Promise<string> {
  return (await out(root, ["rev-parse", "--show-toplevel"])) ?? root;
}

/**
 * What landed on the trunk between two SHAs, for a refresh to show rather
 * than merely assert. An agent told "the remote advanced" and nothing else
 * has to go looking; one `git log` is the difference between a prompt and an
 * answer.
 *
 * **`null` when the trunk could not be read, `[]` when the range is empty.**
 * The same split `doctor`'s `gitLines` was given, and for the same reason: the
 * fetch here transfers objects rather than doing one round trip, so it is what
 * hits the timeout after a day offline — and a caller that renders a failed
 * query as *"nothing on the trunk you do not have"* fails **open**, with the
 * most reassuring sentence available, in the branch added to stop a fail-open.
 */
export async function trunkLog(
  root: string,
  trunk: TrunkRef,
  from: string,
  to: string,
): Promise<string[] | null> {
  // An empty endpoint is not a range: git's revision syntax defaults an
  // omitted side of `..` to `HEAD`, so `abc1234..` silently becomes
  // `abc1234..HEAD` and answers with the local branch's own commits. Handing
  // that to a caller that labels the result "landed on main" invents a
  // specific, plausible answer out of a failed lookup — and the commit
  // subjects are real, which is what makes it hard to disbelieve.
  // `null`, not `[]`. The empty array now carries the positive meaning
  // "nothing on the trunk this branch does not have", and a range that was
  // never given is not that. Both callers guard both endpoints today, so this
  // is unreachable — but a guard in the caller and a sentinel in the function
  // is the arrangement this module has spent several rounds dismantling.
  if (!from || !to) return null;
  // `from..to` needs both objects locally, so a fetch is part of asking. It is
  // the only network call a refresh makes beyond `ls-remote`, and the only one
  // whose cost scales with how long you were away.
  const fetched = await git(root, ["fetch", "--quiet", trunk.remote, trunk.branch]);
  if (!fetched.ok) return null;

  const log = await git(root, ["log", "--oneline", "--no-decorate", `${from}..${to}`]);
  if (!log.ok) return null;
  return log.stdout ? log.stdout.split("\n").filter(Boolean) : [];
}
