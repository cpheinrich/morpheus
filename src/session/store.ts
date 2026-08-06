import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { SessionLease } from "./lease.js";

/**
 * Local-only session state. `local/` is deliberately gitignored, so a receipt
 * never becomes a misleading shared claim that another machine has read the
 * same files. Shared evidence remains the worklog/commit/PR.
 */
export function leasePath(root: string, sessionId: string): string {
  return join(root, "local", "sessions", `${sessionId}.json`);
}

const contextInput = z.object({ id: z.string(), fingerprint: z.string() });

const leaseSchema = z.object({
  version: z.literal(1),
  receipt: z.object({
    version: z.literal(1),
    id: z.string(),
    createdAt: z.string(),
    remoteSha: z.string(),
    branch: z.string(),
    worktree: z.string(),
    inputs: z.array(contextInput),
    advisoryMemorySources: z.array(z.string()).optional(),
  }),
  checkedAt: z.string(),
  status: z.enum(["fresh", "refresh_required", "unknown"]),
  changedInputs: z.array(z.string()),
  unresolvableInputs: z.array(z.string()).optional(),
  reason: z.string().optional(),
});

export interface LeaseRead {
  /** The validated lease, or null when there is none to trust. */
  lease: SessionLease | null;
  /**
   * Set when a file existed but could not be trusted. Absent state and
   * unusable state both yield a null lease, and only this tells them apart —
   * a truncated write must not read as "no session was ever established".
   */
  issue?: string;
}

export async function writeLease(root: string, sessionId: string, lease: SessionLease): Promise<string> {
  const path = leasePath(root, sessionId);
  await mkdir(dirname(path), { recursive: true });
  // Write-then-rename: a crash mid-write leaves the previous lease intact
  // rather than a half-file that `readLease` would have to reject.
  const staging = `${path}.${process.pid}.tmp`;
  await writeFile(staging, `${JSON.stringify(lease, null, 2)}\n`, "utf8");
  await rename(staging, path);
  return path;
}

/**
 * Read local session state, surfacing a malformed file as data rather than
 * casting it through. Parseable-but-wrong JSON would otherwise reach
 * `requireFresh` and fail with a type error instead of a freshness error.
 */
export async function readLease(root: string, sessionId: string): Promise<LeaseRead> {
  const path = leasePath(root, sessionId);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    // The same two holes `readInputs` had, in the sibling file. A raw fs error
    // thrown from here aborts the guard instead of failing closed through it,
    // and `readFile` follows symlinks — so a dangling one reports ENOENT and
    // unusable state reads as "no session was ever established", which is what
    // this function exists to prevent.
    if (err.code !== "ENOENT") return { lease: null, issue: `${path}: ${err.code ?? err.message}` };
    if (await lstat(path).catch(() => null)) {
      return { lease: null, issue: `${path}: dangling symlink — the lease it pointed at is gone` };
    }
    return { lease: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    return { lease: null, issue: `${path}: not valid JSON (${(error as Error).message})` };
  }

  const result = leaseSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return { lease: null, issue: `${path}: not a session lease — ${detail}` };
  }
  return { lease: result.data as SessionLease };
}
