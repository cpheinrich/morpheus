import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SessionLease } from "./lease.js";

/**
 * Local-only session state. `local/` is deliberately gitignored, so a receipt
 * never becomes a misleading shared claim that another machine has read the
 * same files. Shared evidence remains the worklog/commit/PR.
 */
export function leasePath(root: string, sessionId: string): string {
  return join(root, "local", "sessions", `${sessionId}.json`);
}

export async function writeLease(root: string, sessionId: string, lease: SessionLease): Promise<string> {
  const path = leasePath(root, sessionId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(lease, null, 2)}\n`, "utf8");
  return path;
}

/** Null means no local session state exists; malformed state is never ignored. */
export async function readLease(root: string, sessionId: string): Promise<SessionLease | null> {
  try {
    return JSON.parse(await readFile(leasePath(root, sessionId), "utf8")) as SessionLease;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
