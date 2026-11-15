import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitSubprocessEnv } from "../git-env.js";

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
    const { stdout } = await run("git", args, { cwd: root, timeout: 15_000, env: gitSubprocessEnv() });
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
  // Even a fully qualified ls-remote pattern can match a longer ref's tail.
  // The receipt needs the exact configured ref, regardless of output order.
  const ref = `refs/heads/${trunk.branch}`;
  const result = await git(root, ["ls-remote", "--exit-code", trunk.remote, ref]);
  if (result.ok) {
    for (const line of result.stdout.split("\n")) {
      const [sha, name] = line.split("\t");
      if (name === ref && sha && /^[a-f0-9]{40}([a-f0-9]{24})?$/.test(sha)) return { sha };
    }
    return { sha: null, reason: "missing" };
  }
  return { sha: null, reason: result.code === 2 ? "missing" : "unreachable" };
}

/**
 * What HEAD is on: a branch name, or the commit when detached.
 *
 * **`null` when the lookup failed**, which is not a name. `(detached)` was
 * both — `rev-parse --abbrev-ref HEAD` *succeeds* and prints the literal
 * `HEAD` when detached, so the sentinel only ever meant "the command failed",
 * and it was the one string that looked like an answer. Two failed lookups
 * then compared equal and the in-term short-circuit answered from a receipt
 * taken elsewhere: fail-open, in the one comparison added to fail closed.
 *
 * Detached resolves to the **commit**, because `HEAD` is the same string for
 * every commit — so `checkout <sha1>` then `checkout <sha2>` inside the term
 * would otherwise be the one branch change the comparison structurally cannot
 * see. `git worktree add ../wt <sha>` lands there directly.
 */
export async function currentBranch(root: string): Promise<string | null> {
  // `symbolic-ref`, not `rev-parse --abbrev-ref`: it answers on an **unborn**
  // branch, where `rev-parse HEAD` has nothing to resolve, and it exits
  // non-zero when detached rather than printing the literal `HEAD`.
  const branch = await out(root, ["symbolic-ref", "--short", "-q", "HEAD"]);
  if (branch) return branch;
  return await out(root, ["rev-parse", "HEAD"]);
}

/**
 * The repository root of the *worktree* this process is in — not the common
 * git dir, which every worktree shares. Session identity is per-worktree, so
 * `--show-toplevel` is the right question.
 */
export async function worktreeRoot(root: string): Promise<string> {
  return (await out(root, ["rev-parse", "--show-toplevel"])) ?? root;
}

/** Read the verified trunk delta from local objects. A missing range is distinct from an empty one. */
export async function trunkLog(root: string, from: string, to: string): Promise<string[] | null> {
  // An empty endpoint would default to HEAD and answer a different question.
  if (!from || !to) return null;
  const log = await git(root, ["log", "--oneline", "--no-decorate", `${from}..${to}`]);
  if (!log.ok) return null;
  return log.stdout ? log.stdout.split("\n") : [];
}
