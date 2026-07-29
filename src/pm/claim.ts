import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
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

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "");
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

  const claims: Claim[] = [];
  for (const line of out.split("\n").filter(Boolean)) {
    const [ref, at, by] = line.split("\t");
    if (!ref) continue;
    const branch = ref.replace(/^origin\//, "");
    const m = /^([a-z]{2,4}-\d{3,})-/i.exec(branch);
    if (!m) continue;
    claims.push({
      id: m[1]!.toUpperCase(),
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
  const today = new Date().toISOString().slice(0, 10);
  const next = raw
    .replace(/^status:.*$/m, "status: in-progress")
    .replace(/^updated:.*$/m, `updated: ${today}`);
  await writeFile(item.path, next, "utf8");
}

export interface ClaimResult {
  id: string;
  branch: string;
  title: string;
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
  const existing = await findClaims(id, cwd);
  if (existing.length > 0) {
    throw new ClaimError(
      `${id} is already claimed by branch "${existing[0]}". ` +
        `Run \`morpheus pm claims\` to see who and how long ago.`,
    );
  }

  const { items } = await parseArtifact(productDir, "roadmap");
  const item = items.find((i) => i.data.id === id);
  if (!item) throw new ClaimError(`No roadmap item ${id} in ${productDir}/roadmap/`);
  if (item.data.status === "shipped" || item.data.status === "dropped") {
    throw new ClaimError(`${id} is "${item.data.status}" — nothing to claim.`);
  }

  const branch = `${branchPrefix(id)}${slugify(item.data.title)}`;
  await git(["checkout", "-b", branch], cwd);
  await setStatusInProgress(productDir, id);

  // Stage only the item file. `add -A` would sweep whatever else is in the
  // working tree into a commit the author did not intend — including editor
  // scratch, which is how a screenshot once reached a public repo.
  await git(["add", "--", item.path], cwd);
  await git(["commit", "-m", `chore(${id}): claim — status to in-progress`], cwd);
  await git(["push", "-u", "origin", branch], cwd);

  return { id, branch, title: item.data.title };
}
