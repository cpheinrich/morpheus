import { mkdir, mkdtemp, open, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  QA_COMMENTS_CLAIMS,
  QA_COMMENTS_PENDING,
  QA_COMMENTS_RESOLVED,
  parseBatch,
  type QaCommentBatch,
} from "./comments.js";

export interface BatchListing {
  id: string;
  path: string;
  status: "pending" | "resolved";
  project: string;
  commentCount: number;
  createdAt: string;
  previewUrl: string;
}

function pendingRoot(root: string): string {
  return join(root, QA_COMMENTS_PENDING);
}

function resolvedRoot(root: string): string {
  return join(root, QA_COMMENTS_RESOLVED);
}

function claimsRoot(root: string): string {
  return join(root, QA_COMMENTS_CLAIMS);
}

function claimPath(root: string, id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(id)) throw new Error("Invalid QA batch id");
  return join(claimsRoot(root), `${id}.json`);
}

export interface BatchClaim {
  id: string;
  agent: string;
  claimedAt: string;
}

export class BatchClaimedError extends Error {}

export async function readBatchClaim(root: string, id: string): Promise<BatchClaim | null> {
  try {
    const data = JSON.parse(await readFile(claimPath(root, id), "utf8")) as BatchClaim;
    if (data.id === id && typeof data.agent === "string" && data.agent) return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
  }
  // A partial or malformed claim still reserves the batch until an operator releases it.
  throw new BatchClaimedError(`QA batch ${id} has an unreadable claim; release it with --force`);
}

/** Atomically reserve the oldest unclaimed batch for one agent. Claims survive process exits. */
async function tryClaimBatch(root: string, id: string, agent: string): Promise<BatchClaim | null> {
  await mkdir(claimsRoot(root), { recursive: true });
  const path = claimPath(root, id);
  let file;
  try {
    file = await open(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
    throw error;
  }
  const claim: BatchClaim = { id, agent, claimedAt: new Date().toISOString() };
  try {
    await file.writeFile(`${JSON.stringify(claim, null, 2)}\n`, "utf8");
  } catch (error) {
    await unlink(path).catch(() => undefined);
    throw error;
  } finally {
    await file.close();
  }
  // An older resolver may already have moved the batch. Do not hand it out.
  if (await readBatchFile(join(pendingRoot(root), id))) return claim;
  await unlink(path).catch(() => undefined);
  return null;
}

/** Atomically reserve the oldest unclaimed batch for one agent. Claims survive process exits. */
export async function claimNextBatch(root: string, agent: string): Promise<BatchClaim | null> {
  if (!agent.trim()) throw new Error("Agent identity is required to claim QA comments");
  for (const batch of await listPending(root)) {
    const claim = await tryClaimBatch(root, batch.id, agent);
    if (claim) return claim;
  }
  return null;
}

/** Release a claim after a failed attempt, or explicitly recover an abandoned claim. */
export async function releaseBatchClaim(root: string, id: string, agent: string, force = false): Promise<boolean> {
  const path = claimPath(root, id);
  const claim = force ? null : await readBatchClaim(root, id);
  if (!claim && !force) return false;
  if (!force && claim?.agent !== agent) throw new BatchClaimedError(`QA batch ${id} is claimed by ${claim?.agent}`);
  try {
    await unlink(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readBatchFile(batchDir: string): Promise<QaCommentBatch | null> {
  try {
    const raw = JSON.parse(await readFile(join(batchDir, "batch.json"), "utf8"));
    return parseBatch(raw);
  } catch {
    return null;
  }
}

async function listStatus(
  root: string,
  status: "pending" | "resolved",
): Promise<BatchListing[]> {
  const dir = status === "pending" ? pendingRoot(root) : resolvedRoot(root);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const listings: BatchListing[] = [];
  for (const id of entries.sort()) {
    const path = join(dir, id);
    const batch = await readBatchFile(path);
    if (!batch) continue;
    listings.push({
      id: batch.id,
      path,
      status: batch.status,
      project: batch.project,
      commentCount: batch.comments.length,
      createdAt: batch.createdAt,
      previewUrl: batch.preview.url,
    });
  }
  return listings;
}

/** Pending batches newest-last (id sort is chronological). */
export async function listPending(root: string): Promise<BatchListing[]> {
  return listStatus(root, "pending");
}

export async function showBatch(
  root: string,
  id: string,
): Promise<{ batch: QaCommentBatch; path: string } | null> {
  for (const status of ["pending", "resolved"] as const) {
    const path = join(status === "pending" ? pendingRoot(root) : resolvedRoot(root), id);
    const batch = await readBatchFile(path);
    if (batch) return { batch, path };
  }
  return null;
}

/**
 * Move pending → resolved and stamp status. Idempotent if already resolved.
 * Returns null when the id is missing from both trees.
 */
export async function resolveBatch(
  root: string,
  id: string,
  resolvedBy = "agent",
): Promise<QaCommentBatch | null> {
  const pendingPath = join(pendingRoot(root), id);
  const resolvedPath = join(resolvedRoot(root), id);

  let batch = await readBatchFile(pendingPath);
  let from = pendingPath;
  if (!batch) {
    batch = await readBatchFile(resolvedPath);
    if (!batch) return null;
    if (batch.status === "resolved") return batch;
    from = resolvedPath;
  }

  // Legacy callers may resolve without first claiming. They must acquire the same exclusive
  // boundary as claimNextBatch before moving the batch, or two agents can both receive it.
  const claim = (await readBatchClaim(root, id)) ?? (await tryClaimBatch(root, id, resolvedBy)) ?? (await readBatchClaim(root, id));
  if (!claim) {
    // Another resolver may have completed and removed its claim while we waited.
    const completed = await readBatchFile(resolvedPath);
    if (completed?.status === "resolved") return completed;
    throw new BatchClaimedError(`QA batch ${id} changed while resolving; retry`);
  }
  if (claim && claim.agent !== resolvedBy) {
    throw new BatchClaimedError(`QA batch ${id} is claimed by ${claim.agent}; resolve it as that agent or release the claim`);
  }

  const next: QaCommentBatch = {
    ...batch,
    status: "resolved",
    resolvedAt: new Date().toISOString(),
    resolvedBy,
  };

  await mkdir(resolvedRoot(root), { recursive: true });
  if (from === pendingPath) {
    await mkdir(resolvedPath, { recursive: true });
    // Move the whole directory (frame.png included).
    await rename(pendingPath, resolvedPath);
  }
  await writeFile(join(resolvedPath, "batch.json"), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  if (claim) await releaseBatchClaim(root, id, resolvedBy);
  return next;
}

/** Publish the complete batch and optional frame atomically into the durable queue. */
export async function writePendingBatch(
  root: string,
  batch: QaCommentBatch,
  frameBytes?: Buffer,
  commentFrames: ReadonlyMap<string, Buffer> = new Map(),
): Promise<string> {
  const dir = join(pendingRoot(root), batch.id);
  await mkdir(pendingRoot(root), { recursive: true });
  const staging = await mkdtemp(join(pendingRoot(root), ".staging-"));
  try {
    await writeFile(join(staging, "batch.json"), `${JSON.stringify(batch, null, 2)}\n`, "utf8");
    if (frameBytes) await writeFile(join(staging, "frame.png"), frameBytes);
    for (const [name, bytes] of commentFrames) {
      if (!/^comment-[A-Za-z0-9_-]+\.png$/.test(name)) throw new Error("Invalid QA comment frame name");
      await writeFile(join(staging, name), bytes);
    }
    await rename(staging, dir);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return dir;
}

export async function removeBatchTree(root: string): Promise<void> {
  await rm(join(root, "local/qa-comments"), { recursive: true, force: true });
}
