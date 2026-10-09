import { join } from "node:path";
import { QA_COMMENTS_PENDING, parseBatch, type QaCommentBatch } from "./comments.js";
import { listPending, writePendingBatch } from "./store.js";
import { notifyBatchPending, QA_COMMENTS_WEBHOOK_FILE, resolveWebhookConfig } from "./webhook.js";

/**
 * Turns a posted batch into a pending batch on disk: validated against the shared schema, frame
 * written when a PNG came with it, and the wake webhook notified when one is configured.
 *
 * Shared by the simulator overlay and the web overlay (MO-26-10-06-18.13.32) so the two cannot
 * write different shapes into the one inbox agents read.
 */
export interface PostedBatch {
  preview?: { url: string; kind?: "serve-sim" | "web" | "other"; label?: string };
  comments: unknown[];
  frame?: { path?: string; width: number; height: number; capturedAt?: string; dataUrl?: string };
}

export class BatchRejected extends Error {}

export function newBatchId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function recordBatch(
  root: string,
  project: string,
  raw: PostedBatch,
  defaultPreview: { url: string; kind: "serve-sim" | "web" | "other" },
): Promise<{ id: string; path: string; batch: QaCommentBatch; pendingCount: number; wakeConfigured: boolean }> {
  if (!Array.isArray(raw.comments) || raw.comments.length === 0) throw new BatchRejected("comments required");
  const id = newBatchId();
  let frameBytes: Buffer | undefined;
  let frameMeta: { path?: "frame.png"; width: number; height: number; capturedAt: string } | undefined = raw.frame
    ? { width: raw.frame.width, height: raw.frame.height, capturedAt: raw.frame.capturedAt ?? new Date().toISOString() }
    : undefined;
  if (raw.frame?.dataUrl?.startsWith("data:image/png;base64,")) {
    frameBytes = Buffer.from(raw.frame.dataUrl.slice("data:image/png;base64,".length), "base64");
    frameMeta = { path: "frame.png", width: raw.frame.width, height: raw.frame.height, capturedAt: new Date().toISOString() };
  }
  const batch: QaCommentBatch = parseBatch({
    version: 1, id, project, createdAt: new Date().toISOString(),
    preview: raw.preview ?? defaultPreview,
    ...(frameMeta ? { frame: frameMeta } : {}),
    comments: raw.comments, status: "pending",
  });
  const path = await writePendingBatch(root, batch, frameBytes);
  const webhook = await resolveWebhookConfig(root);
  if (webhook) {
    notifyBatchPending(webhook.url, {
      event: "qa.comments.batch_pending", id, project, root,
      pendingDir: join(root, QA_COMMENTS_PENDING), path, commentCount: batch.comments.length, createdAt: batch.createdAt,
    }, webhook.authorization ? { authorization: webhook.authorization } : undefined);
  } else {
    console.log(`qa comments webhook: unset — batch ${id} written; set MORPHEUS_QA_COMMENTS_WEBHOOK_URL or ${QA_COMMENTS_WEBHOOK_FILE} to wake an agent`);
  }
  return { id, path, batch, pendingCount: (await listPending(root)).length, wakeConfigured: Boolean(webhook) };
}
