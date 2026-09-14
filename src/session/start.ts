import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { projectPolicy } from "./policy.js";
import { resolveTrunk } from "./git.js";
import { roadmapIdFromBranch } from "../pm/id.js";

const exec = promisify(execFile);
export const sessionGit = async (root: string, args: string[]): Promise<string> =>
  (await exec("git", args, { cwd: root, timeout: 30_000 })).stdout.trim();

export async function checkoutIdentity(cwd: string): Promise<{ root: string; common: string; linked: boolean }> {
  const root = await realpath(await sessionGit(cwd, ["rev-parse", "--show-toplevel"]));
  const common = await realpath(resolve(root, await sessionGit(root, ["rev-parse", "--git-common-dir"])));
  const own = await realpath(resolve(root, await sessionGit(root, ["rev-parse", "--git-dir"])));
  return { root, common, linked: own !== common };
}

export interface SourceState {
  root: string;
  sha: string;
  trunk: string;
  branch: string;
  task?: string;
  behind: number;
  advanced: boolean;
}

/** Fetch into a private ref so concurrent sessions cannot replace FETCH_HEAD. */
export async function fetchTrunk(root: string): Promise<{ sha: string; trunk: string; branch: string }> {
  const policy = await projectPolicy(root);
  const trunk = await resolveTrunk(root, policy.trunk);
  await sessionGit(root, ["check-ref-format", `refs/heads/${trunk.branch}`]);
  const ref = `refs/morpheus/session-start/${randomUUID()}`;
  try {
    await sessionGit(root, ["fetch", "--no-tags", "--no-write-fetch-head", "--", trunk.remote, `refs/heads/${trunk.branch}:${ref}`]);
    const sha = await sessionGit(root, ["rev-parse", "--verify", `${ref}^{commit}`]);
    return { sha, trunk: `${trunk.remote}/${trunk.branch}`, branch: trunk.branch };
  } finally {
    await sessionGit(root, ["update-ref", "-d", ref]).catch(() => undefined);
  }
}

/**
 * Startup does not allocate a task. Only an exactly named, clean local trunk
 * may fast-forward. Feature branches, detached work and dirty checkouts stay
 * untouched, with the missing commits reported instead of called current.
 */
export async function prepareRepository(cwd: string, offline = false): Promise<SourceState> {
  const { root } = await checkoutIdentity(cwd);
  const manifest: unknown = JSON.parse(await readFile(resolve(root, "morpheus.json"), "utf8"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("A Morpheus project manifest is required.");
  if (offline) throw new Error("Offline: latest remote code is unverified. Existing local work may continue explicitly offline; do not claim the checkout is current.");
  const fetched = await fetchTrunk(root);
  const branch = await sessionGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const before = await sessionGit(root, ["rev-parse", "HEAD"]);
  const dirty = await sessionGit(root, ["status", "--porcelain"]);
  let advanced = false;
  if (branch === fetched.branch && !dirty && before !== fetched.sha) {
    // Only behind, never ahead/diverged: ff-only alone could keep local-only
    // trunk commits and misleadingly describe that checkout as exact trunk.
    const ancestor = await sessionGit(root, ["merge-base", "--is-ancestor", before, fetched.sha]).then(() => true, () => false);
    if (ancestor) {
      await sessionGit(root, ["merge", "--ff-only", fetched.sha]);
      advanced = true;
    }
  }
  const behind = Number(await sessionGit(root, ["rev-list", "--count", `HEAD..${fetched.sha}`]));
  return { root, sha: fetched.sha, trunk: fetched.trunk, branch, task: roadmapIdFromBranch(branch) ?? undefined, behind, advanced };
}

/** Source freshness is independent of a receipt's local fingerprints. */
export async function assertCurrentSource(root: string): Promise<string> {
  const fetched = await fetchTrunk(root);
  try { await sessionGit(root, ["merge-base", "--is-ancestor", fetched.sha, "HEAD"]); }
  catch { throw new Error(`Checkout does not contain current ${fetched.trunk} (${fetched.sha}). Run morpheus context brief; integrate trunk into existing work explicitly, then re-read the records and refresh.`); }
  return fetched.sha;
}

export interface SessionStartInput { sessionId?: string; source?: string }
export function parseSessionInput(raw: string, threadId?: string): SessionStartInput {
  const value: unknown = raw.trim() ? JSON.parse(raw) : {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Session hook input must be a JSON object.");
  const event = value as Record<string, unknown>;
  return { sessionId: typeof event.session_id === "string" && event.session_id ? event.session_id : threadId,
    source: typeof event.source === "string" ? event.source : undefined };
}
export const sessionKey = (id: string): string => createHash("sha256").update(id).digest("hex");
