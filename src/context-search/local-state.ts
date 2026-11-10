import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sessionGit } from "../session/start.js";

const STATE = "local/context-search";

export async function searchStateDirectory(root: string, child: "cache" | "traces" | "startup"): Promise<string> {
  await sessionGit(root, ["check-ignore", "--quiet", "--", STATE + "/"]).catch(() => {
    throw new Error("Context search state needs an ignored local/context-search directory.");
  });
  let directory = root;
  for (const name of ["local", "context-search", child]) {
    directory = join(directory, name);
    await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    if (await realpath(directory) !== directory) throw new Error("Context search state must stay inside the worktree.");
  }
  return directory;
}

export function validSearchSession(session?: string): session is string {
  return !!session && session.length <= 512;
}


// An older checkout may lack the ignore rule. Keep its query working without
// putting a private index in Git's view or changing the project's ignore file.
export async function withContextSearchCache<T>(root: string, use: (cache: string) => Promise<T>): Promise<T> {
  const persistent = await searchStateDirectory(root, "cache").catch(() => undefined);
  if (persistent) return use(persistent);
  const scratch = await mkdtemp(join(tmpdir(), "morpheus-context-cache-"));
  try {
    return await use(scratch);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
