import { roadmapIdFromBranch, slugForFilename } from "./id.js";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { today, updateFrontmatter } from "./frontmatter.js";
import { parseArtifact } from "./parse.js";

const exec = promisify(execFile);

/**
 * Claiming a roadmap item.
 *
 * The remote branch *is* the claim. Branch names already derive from the item
 * id, so making that load-bearing needs no new file, no new format, and no
 * shared service — the remote arbitrates across machines, and merging the PR
 * releases the claim by deleting the branch.
 *
 * Deliberately not an assignee field: anyone may point any agent at any item,
 * and ownership begins when work begins.
 */

export interface Claim {
  id: string;
  branch: string;
  /** Last committer on the branch, when it could be determined. */
  by?: string;
  /** ISO date of the last commit on the branch. */
  at?: string;
}

export class ClaimError extends Error {}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await exec("git", args, { cwd });
  return stdout.trim();
}

/** Branch prefix for an item: EV-014 -> ev-014- */
export function branchPrefix(id: string): string {
  return `${id.toLowerCase()}-`;
}

/**
 * The branch slug — the *same* function filenames use.
 *
 * These were two implementations with different rules: 40 characters cut
 * mid-word here, 64 at a word boundary there. The same item therefore got
 * `…-open-an-issue-and` on its branch and `…-may-open-a-pr-carrying` in its
 * filename, which is how the divergence was spotted. One function, one answer.
 */
export function slugify(title: string): string {
  return slugForFilename(title);
}

/** Remote branches that claim an item. Empty means the item is free. */
export async function findClaims(id: string, cwd: string): Promise<string[]> {
  const out = await git(
    ["ls-remote", "--heads", "origin", `refs/heads/${branchPrefix(id)}*`],
    cwd,
  );
  if (!out) return [];
  return out
    .split("\n")
    .map((line) => line.split("refs/heads/")[1])
    .filter((b): b is string => Boolean(b));
}

/**
 * Sequence numbers already staked on the remote under an id prefix, or null
 * when origin could not be reached.
 *
 * Id allocation reads the item files on disk, which only hold ids that have
 * merged. An id another session claimed lives solely on its remote branch until
 * then, so allocation cannot see it and re-issues it — which it did, with
 * MO-038 held by a parallel session while local `main` stopped at MO-037.
 *
 * Null rather than an empty array on failure: "origin holds no claims" is
 * evidence, "origin was unreachable" is not, and collapsing them lets a network
 * blip render as a free id. Same reason `mergedPrs` returns null.
 *
 * @param idPrefix Everything before the digits, e.g. `MO-` or `MO-G-`.
 */
export async function claimedNumbers(
  idPrefix: string,
  cwd: string,
): Promise<number[] | null> {
  try {
    const out = await git(
      ["ls-remote", "--heads", "origin", `refs/heads/${idPrefix.toLowerCase()}*`],
      cwd,
    );
    return parseClaimedNumbers(out, idPrefix);
  } catch {
    return null;
  }
}

/**
 * Sequence numbers staked by `git ls-remote --heads` output.
 *
 * Split out from the lookup because the parsing is where this can quietly go
 * wrong — `mo-*` also matches the goal and request branches (`mo-g-001-…`,
 * `mo-fr-007-…`), and a roadmap allocation must not read their numbers as its
 * own. Requiring a digit immediately after the prefix is what separates them.
 */
export function parseClaimedNumbers(lsRemote: string, idPrefix: string): number[] {
  // Branches are `<id lowercased>-<slug>`, so the digits between the prefix and
  // the next hyphen are the sequence number.
  const pattern = new RegExp(`^${idPrefix.toLowerCase()}(\\d+)-`);
  const numbers: number[] = [];
  for (const line of lsRemote.split("\n")) {
    const branch = line.split("refs/heads/")[1];
    if (!branch) continue;
    const m = pattern.exec(branch);
    if (m) numbers.push(Number(m[1]));
  }
  return numbers;
}

/** Every live claim in the repo, newest activity first. */
export async function listClaims(cwd: string): Promise<Claim[]> {
  await git(["fetch", "origin", "--quiet"], cwd).catch(() => "");

  const out = await git(
    [
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname:short)%09%(committerdate:iso-strict)%09%(authorname)",
      "refs/remotes/origin/",
    ],
    cwd,
  );

  return parseClaimRefs(out);
}

/**
 * Turn `for-each-ref` output into claims.
 *
 * Split out from the lookup for the same reason `parseClaimedNumbers` was: the
 * parsing is where this goes wrong, and it cannot be tested while it is welded
 * to a git call.
 *
 * It goes wrong *silently*, which is the part worth guarding. A branch this
 * fails to parse is not reported as unparseable — it is simply absent from the
 * result, and every caller reads absence as "no claim". `listClaims` carried a
 * private copy of the id pattern that MO-057 left behind, so under the current
 * scheme it returned an empty list from a remote full of claims.
 */
export function parseClaimRefs(forEachRefOutput: string): Claim[] {
  const claims: Claim[] = [];
  for (const line of forEachRefOutput.split("\n").filter(Boolean)) {
    const [ref, at, by] = line.split("\t");
    if (!ref) continue;
    const branch = ref.replace(/^origin\//, "");
    const id = roadmapIdFromBranch(branch);
    if (!id) continue;
    claims.push({
      id,
      branch,
      ...(by ? { by } : {}),
      ...(at ? { at } : {}),
    });
  }
  return claims;
}

/** Whole days since an ISO timestamp. */
export function ageInDays(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

async function setStatusInProgress(productDir: string, id: string): Promise<void> {
  const { items } = await parseArtifact(productDir, "roadmap");
  const item = items.find((i) => i.data.id === id);
  if (!item) throw new ClaimError(`No roadmap item ${id} in ${productDir}/roadmap/`);

  const raw = await readFile(item.path, "utf8");
  // `needs` is cleared, because re-claiming a previously blocked item means the
  // answer arrived. Leaving it would read as a live blocker on active work.
  await writeFile(
    item.path,
    updateFrontmatter(raw, { status: "in-progress", needs: null, updated: today() }),
    "utf8",
  );
}

export interface ClaimResult {
  id: string;
  branch: string;
  title: string;
  /** Items reconciled to shipped as a side effect of claiming. */
  shipped?: string[];
}

/**
 * Where an item file lives — **looked up, not reconstructed**.
 *
 * `<id>.md` stopped being the filename in MO-057, when roadmap items gained a
 * slug. Rebuilding the name from the id is the same mistake `index-gen` made,
 * and it fails loudly here: `git add` on a path that does not exist aborts the
 * claim. Returns null when the id has no file, so a caller can skip it rather
 * than stage a phantom.
 */
async function itemPath(productDir: string, id: string): Promise<string | null> {
  const { items } = await parseArtifact(productDir, "roadmap");
  return items.find((i) => (i.data as { id: string }).id === id)?.path ?? null;
}

/**
 * Claim an item: verify nothing holds it, create the branch, mark the item
 * in-progress, and push immediately so the claim is visible to everyone else.
 */
export async function claim(
  productDir: string,
  id: string,
  cwd: string,
): Promise<ClaimResult> {
  // Reconcile before branching, so merged work is marked shipped here and
  // rides along with this claim's commit.
  //
  // Doing it after a merge instead leaves the status change sitting in a dirty
  // working tree on protected `main`, with nowhere to go — which is exactly
  // what happened the first time, and is how a housekeeping step gets quietly
  // dropped.
  const { reconcile } = await import("./ship.js");
  const reconciled = await reconcile(productDir, cwd).catch(() => null);

  const { items } = await parseArtifact(productDir, "roadmap");
  const item = items.find((i) => i.data.id === id);
  if (!item) throw new ClaimError(`No roadmap item ${id} in ${productDir}/roadmap/`);
  if (item.data.status === "shipped" || item.data.status === "dropped") {
    throw new ClaimError(`${id} is "${item.data.status}" — nothing to claim.`);
  }

  const existing = await findClaims(id, cwd);
  if (existing.length > 0) {
    // A blocked item still holds its branch on purpose — the partial work is
    // there. So this is the *expected* path back into blocked work, not a
    // collision, and the message has to name the different recovery or the
    // item looks permanently unclaimable.
    if (item.data.status === "blocked") {
      throw new ClaimError(
        `${id} is blocked and still holds its branch — the partial work is on it.\n` +
          `Resume it rather than re-claiming:\n\n` +
          `  git checkout ${existing[0]}\n` +
          `  morpheus pm unblock ${id}\n\n` +
          `It needs: ${item.data.needs ?? "(unrecorded)"}`,
      );
    }
    throw new ClaimError(
      `${id} is already claimed by branch "${existing[0]}". ` +
        `Run \`morpheus pm claims\` to see who and how long ago.`,
    );
  }

  const branch = `${branchPrefix(id)}${slugify(item.data.title)}`;
  await git(["checkout", "-b", branch], cwd);
  await setStatusInProgress(productDir, id);

  // Stage only the item files. `add -A` would sweep whatever else is in the
  // working tree into a commit the author did not intend — including editor
  // scratch, which is how a screenshot once reached a public repo.
  const shipped = (reconciled?.outcomes ?? [])
    .filter((o) => o.kind === "shipped" || o.kind === "stale")
    .map((o) => o.id);
  const shippedPaths = (await Promise.all(shipped.map((sid) => itemPath(productDir, sid)))).filter(
    (p): p is string => p !== null,
  );
  const paths = [item.path, ...shippedPaths];
  await git(["add", "--", ...paths], cwd);

  const note = shipped.length
    ? `chore(${id}): claim — status to in-progress\n\nAlso marks ${shipped.join(", ")} shipped, reconciled against merged PRs.`
    : `chore(${id}): claim — status to in-progress`;
  await git(["commit", "-m", note], cwd);
  await git(["push", "-u", "origin", branch], cwd);

  return { id, branch, title: item.data.title, shipped };
}
