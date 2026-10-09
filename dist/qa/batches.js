import { join } from "node:path";
import { QA_COMMENTS_PENDING, parseBatch } from "./comments.js";
import { listPending, writePendingBatch } from "./store.js";
import { notifyBatchPending, QA_COMMENTS_WEBHOOK_FILE, resolveWebhookConfig } from "./webhook.js";
export class BatchRejected extends Error {
}
export function newBatchId(now = new Date()) {
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}
export async function recordBatch(root, project, raw, defaultPreview) {
    if (!Array.isArray(raw.comments) || raw.comments.length === 0)
        throw new BatchRejected("comments required");
    const id = newBatchId();
    let frameBytes;
    let frameMeta = raw.frame
        ? { width: raw.frame.width, height: raw.frame.height, capturedAt: raw.frame.capturedAt ?? new Date().toISOString() }
        : undefined;
    if (raw.frame?.dataUrl?.startsWith("data:image/png;base64,")) {
        frameBytes = Buffer.from(raw.frame.dataUrl.slice("data:image/png;base64,".length), "base64");
        frameMeta = { path: "frame.png", width: raw.frame.width, height: raw.frame.height, capturedAt: new Date().toISOString() };
    }
    const batch = parseBatch({
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
    }
    else {
        console.log(`qa comments webhook: unset — batch ${id} written; set MORPHEUS_QA_COMMENTS_WEBHOOK_URL or ${QA_COMMENTS_WEBHOOK_FILE} to wake an agent`);
    }
    return { id, path, batch, pendingCount: (await listPending(root)).length, wakeConfigured: Boolean(webhook) };
}
//# sourceMappingURL=batches.js.map