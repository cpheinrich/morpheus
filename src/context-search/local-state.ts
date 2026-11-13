import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkoutIdentity, sessionGit } from "../session/start.js";
import { listWorktrees } from "../session/worktrees.js";
import type { SearchOptions } from "./engine.js";

const STATE = "local/context-search";

export async function searchStateDirectory(root: string, child: "cache" | "traces" | "startup", create = true): Promise<string> {
  await sessionGit(root, ["check-ignore", "--quiet", "--", STATE + "/"]).catch(() => {
    throw new Error("Context search state needs an ignored local/context-search directory.");
  });
  let directory = root;
  for (const name of ["local", "context-search", child]) {
    directory = join(directory, name);
    if (create) await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    if (await realpath(directory) !== directory) throw new Error("Context search state must stay inside the worktree.");
  }
  return directory;
}

export async function persistentContextCache(root: string): Promise<SearchOptions> {
  return { cacheDir: await searchStateDirectory(root, "cache"), sharedCache: () => primaryCache(root) };
}

async function primaryCache(root: string): Promise<string | undefined> {
  const current = await checkoutIdentity(root);
  if (!current.linked) return;
  const primary = (await listWorktrees(root))[0];
  if (!primary || primary.prunable) return;
  const candidate = await checkoutIdentity(primary.path);
  if (candidate.linked || candidate.common !== current.common) return;
  return searchStateDirectory(candidate.root, "cache", false);
}

export function validSearchSession(session?: string): session is string {
  return !!session && session.length <= 512;
}


// An older checkout may lack the ignore rule. Keep its query working without
// putting a private index in Git's view or changing the project's ignore file.
export async function withContextSearchCache<T>(root: string, use: (cache: SearchOptions) => Promise<T>): Promise<T> {
  const persistent = await persistentContextCache(root).catch(() => undefined);
  if (persistent) return use(persistent);
  const scratch = await mkdtemp(join(tmpdir(), "morpheus-context-cache-"));
  try {
    return await use({ cacheDir: scratch });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
