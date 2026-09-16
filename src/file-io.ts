import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Best-effort discovery probe. False means inaccessible, not necessarily absent. */
export async function accessible(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

/** Optional authored content: only absence is optional; I/O errors propagate. */
export async function readIfExists(path: string): Promise<string | null> {
  try { return await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Best-effort discovery, where missing, unreadable and invalid JSON are unknown. */
export async function readJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch { return null; }
}

/** Shared scaffold bookkeeping; preserves existing authored files. */
export function scaffoldWriter(root: string, written: string[], skipped: string[]) {
  return async (rel: string, content: string): Promise<void> => {
    const abs = join(root, rel);
    if (await accessible(abs)) { skipped.push(rel); return; }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    written.push(rel);
  };
}
