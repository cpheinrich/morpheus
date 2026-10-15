import { lstat } from "node:fs/promises";
import { sessionGit as git, checkoutIdentity } from "./start.js";

export interface Worktree {
  path: string;
  head: string;
  branch?: string;
  detached: boolean;
  locked?: string;
  prunable?: string;
}

/** NUL records preserve spaces, newlines, and Git's unquoted paths. */
export async function listWorktrees(root: string): Promise<Worktree[]> {
  const listing = await git(root, ["worktree", "list", "--porcelain", "-z"]);
  return listing.split("\0\0").filter(Boolean).map(entry => {
    const fields = entry.split("\0");
    const value = (key: string) => fields.find(f => f.startsWith(`${key} `))?.slice(key.length + 1);
    const path = value("worktree"), head = value("HEAD");
    if (!path || !head) throw new Error("Incomplete Git worktree registration; manual inspection required.");
    return { path, head, branch: value("branch")?.replace(/^refs\/heads\//, ""),
      detached: fields.includes("detached"),
      locked: fields.includes("locked") ? "locked" : value("locked"),
      prunable: fields.includes("prunable") ? "prunable" : value("prunable") };
  });
}

export async function missingDirectory(path: string): Promise<boolean> {
  try { await lstat(path); return false; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return true; throw error; }
}

export async function assertWorktreePolicy(root: string, trunkBranch: string): Promise<void> {
  const identity = await checkoutIdentity(root);
  const branch = await git(root, ["branch", "--show-current"]);
  if (identity.linked && branch === trunkBranch) {
    throw new Error(`Policy violation: secondary worktree ${identity.root} is on trunk ${trunkBranch}. Preserve its work and explicitly move it to a task branch or temporary detached HEAD.`);
  }
}
