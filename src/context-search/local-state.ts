import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sessionGit } from "../session/start.js";
import type { SearchEngine } from "./rollout.js";

const STATE = "local/context-search";

export async function searchStateDirectory(root: string, child: "cache" | "traces" | "engines"): Promise<string> {
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

function engineFile(session: string): string {
  return createHash("sha256").update(session).digest("hex") + ".txt";
}

export function validSearchSession(session?: string): session is string {
  return !!session && session.length <= 512;
}

export async function sessionEngine(root: string, session?: string): Promise<SearchEngine | undefined> {
  if (!validSearchSession(session)) return;
  const relative = join(STATE, "engines", engineFile(session));
  const path = join(root, relative);
  try {
    if (await realpath(path) !== path) return;
    await sessionGit(root, ["check-ignore", "--quiet", "--", relative]);
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 8) return;
      const value = await file.readFile("utf8");
      return value === "tantivy" || value === "ripgrep" ? value : undefined;
    } finally {
      await file.close();
    }
  } catch {
    // A missing, unsafe or untracked-by-convention pin must not prevent search.
    return undefined;
  }
}

export async function setSessionEngine(root: string, session: string, engine: SearchEngine | "auto"): Promise<void> {
  const directory = await searchStateDirectory(root, "engines");
  const path = join(directory, engineFile(session));
  if (engine === "auto") {
    await rm(path, { force: true });
    return;
  }
  const pending = join(directory, randomUUID() + ".tmp");
  await writeFile(pending, engine, { flag: "wx", mode: 0o600 });
  try {
    await rename(pending, path);
  } finally {
    await rm(pending, { force: true });
  }
}
