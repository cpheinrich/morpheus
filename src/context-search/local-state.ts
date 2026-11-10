import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
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
