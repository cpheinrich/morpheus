import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
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
    from = resolvedPath;
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
  return next;
}

/** Test helper: write a pending batch directory. */
export async function writePendingBatch(
  root: string,
  batch: QaCommentBatch,
  frameBytes?: Buffer,
): Promise<string> {
  const dir = join(pendingRoot(root), batch.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "batch.json"), `${JSON.stringify(batch, null, 2)}\n`, "utf8");
  if (frameBytes) await writeFile(join(dir, "frame.png"), frameBytes);
  return dir;
}

export async function removeBatchTree(root: string): Promise<void> {
  await rm(join(root, "local/qa-comments"), { recursive: true, force: true });
}
