import { gitSubprocessEnv } from "../git-env.js";
import { run } from "./install.js";

/** A changed file and the new-side line ranges that changed in it. */
export interface ChangedFile {
  path: string;
  /** Every line counts as changed: an added, untracked or binary file. */
  whole: boolean;
  /** Inclusive [first, last] new-side lines. A pure deletion spans the two lines around it. */
  ranges: [number, number][];
}

export type ChangeSet = { ok: true; mergeBase: string; files: ChangedFile[] } | { ok: false; reason: string };

/**
 * Plain `git`, never the user's diff configuration: an external diff tool or
 * a textconv filter would change what is measured, and a quoted path would
 * name a file that does not exist.
 */
async function git(root: string, args: string[]) {
  return run("git", ["-c", "core.quotePath=off", ...args], { cwd: root, env: gitSubprocessEnv() });
}

/**
 * What changed between the merge base of `base` and HEAD, and the working
 * tree: committed, staged, unstaged and untracked work alike, because the
 * local check runs before anything is committed.
 */
export async function changedFiles(root: string, base: string): Promise<ChangeSet> {
  const mb = await git(root, ["merge-base", base, "HEAD"]);
  if (mb.code !== 0) return { ok: false, reason: `no merge base between ${base} and HEAD: ${mb.stderr.trim() || "unknown"}` };
  const mergeBase = mb.stdout.trim();
  const status = await git(root, ["diff", "-z", "--name-status", "-M", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", mergeBase, "--"]);
  if (status.code !== 0) return { ok: false, reason: `git diff failed: ${status.stderr.trim()}` };
  const untracked = await git(root, ["ls-files", "-z", "--others", "--exclude-standard"]);
  if (untracked.code !== 0) return { ok: false, reason: `git ls-files failed: ${untracked.stderr.trim()}` };

  const files: ChangedFile[] = [];
  for (const entry of parseNameStatus(status.stdout)) {
    // A deleted file has no lines left to measure.
    if (entry.status === "D") continue;
    if (entry.status === "A") {
      files.push({ path: entry.path, whole: true, ranges: [] });
      continue;
    }
    const hunks = await fileHunks(root, mergeBase, entry);
    if (hunks === null) return { ok: false, reason: `git diff of ${entry.path} failed` };
    files.push(hunks);
  }
  for (const path of untracked.stdout.split("\0").filter(Boolean)) files.push({ path, whole: true, ranges: [] });
  return { ok: true, mergeBase, files };
}

export interface NameStatus {
  status: string;
  path: string;
  from?: string;
}

/** `--name-status -z`: a status, then one path, or two for a rename or copy. */
export function parseNameStatus(out: string): NameStatus[] {
  const fields = out.split("\0");
  const entries: NameStatus[] = [];
  for (let i = 0; i + 1 < fields.length; ) {
    const code = fields[i] ?? "";
    const letter = code.charAt(0);
    if (letter === "R" || letter === "C") {
      entries.push({ status: letter, from: fields[i + 1] ?? "", path: fields[i + 2] ?? "" });
      i += 3;
    } else {
      entries.push({ status: letter, path: fields[i + 1] ?? "" });
      i += 2;
    }
  }
  return entries.filter((e) => e.path !== "");
}

async function fileHunks(root: string, mergeBase: string, entry: NameStatus): Promise<ChangedFile | null> {
  const paths = entry.from ? [entry.from, entry.path] : [entry.path];
  const diff = await git(root, [
    "diff", "-U0", "-M", "--no-ext-diff", "--no-textconv", "--no-color", mergeBase, "--",
    ...paths.map((p) => `:(literal)${p}`),
  ]);
  if (diff.code !== 0) return null;
  const ranges = parseHunkRanges(diff.stdout);
  // A binary change has no hunks; with nothing to localise, the whole file changed.
  const binary = ranges.length === 0 && /^Binary files /m.test(diff.stdout);
  return { path: entry.path, whole: binary, ranges };
}

/**
 * New-side ranges from `-U0` hunk headers. `+c,0` is a pure deletion after new
 * line c, so the lines either side of the gap, c and c+1, are what it touched.
 */
export function parseHunkRanges(diff: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    ranges.push(count === 0 ? [start, start + 1] : [start, start + count - 1]);
  }
  return ranges;
}

/** Every file in the working tree that Git tracks or would track, for `--all`. */
export async function allFiles(root: string): Promise<{ ok: true; files: string[] } | { ok: false; reason: string }> {
  const listed = await git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--deduplicate"]);
  const gone = await git(root, ["ls-files", "-z", "--deleted"]);
  if (listed.code !== 0 || gone.code !== 0) return { ok: false, reason: `git ls-files failed: ${listed.stderr.trim() || gone.stderr.trim()}` };
  const deleted = new Set(gone.stdout.split("\0").filter(Boolean));
  return { ok: true, files: listed.stdout.split("\0").filter((p) => p && !deleted.has(p)) };
}
