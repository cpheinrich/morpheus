import { join } from "node:path";
import { QA_COMMENTS_PENDING, parseBatch } from "./comments.js";
import { listPending, writePendingBatch } from "./store.js";
import { isResponderActive } from "./responder.js";
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
    if (defaultPreview.kind === "web" && raw.comments.length > 30)
        throw new BatchRejected("at most 30 web comments per batch");
    const id = newBatchId();
    let frameBytes;
    let frameMeta = raw.frame
        ? { width: raw.frame.width, height: raw.frame.height, capturedAt: raw.frame.capturedAt ?? new Date().toISOString() }
        : undefined;
    if (raw.frame?.dataUrl?.startsWith("data:image/png;base64,")) {
        frameBytes = Buffer.from(raw.frame.dataUrl.slice("data:image/png;base64,".length), "base64");
        frameMeta = { path: "frame.png", width: raw.frame.width, height: raw.frame.height, capturedAt: new Date().toISOString() };
    }
    const commentFrames = new Map();
    const comments = raw.comments.map((value, index) => {
        if (!value || typeof value !== "object" || Array.isArray(value))
            return value;
        const comment = value;
        const postedFrame = comment.frame;
        if (!postedFrame || typeof postedFrame !== "object" || Array.isArray(postedFrame))
            return value;
        const frame = postedFrame;
        const { dataUrl, ...metadata } = frame;
        if (dataUrl === undefined)
            return value;
        const mime = typeof dataUrl === "string" ? /^data:image\/(png|jpeg);base64,/.exec(dataUrl) : null;
        if (!mime || typeof dataUrl !== "string") {
            throw new BatchRejected("comment frame must be a PNG or JPEG data URL");
        }
        if (mime[1] === "jpeg" && dataUrl.length > 512 * 1024)
            throw new BatchRejected("comment JPEG exceeds 512 KiB");
        if (mime[1] === "jpeg" && (Number(frame.width) > 1600 || Number(frame.height) > 1600))
            throw new BatchRejected("comment JPEG exceeds 1600 px");
        const bytes = Buffer.from(dataUrl.slice(mime[0].length), "base64");
        if (bytes.length === 0)
            throw new BatchRejected("comment frame is empty");
        if (mime[1] === "jpeg" && (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff))
            throw new BatchRejected("comment JPEG has invalid signature");
        const path = `comment-${index + 1}.${mime[1] === "jpeg" ? "jpg" : "png"}`;
        commentFrames.set(path, bytes);
        return { ...comment, frame: { ...metadata, path } };
    });
    const batch = parseBatch({
        version: 1, id, project, createdAt: new Date().toISOString(),
        preview: raw.preview ?? defaultPreview,
        ...(frameMeta ? { frame: frameMeta } : {}),
        comments, status: "pending",
    });
    const path = await writePendingBatch(root, batch, frameBytes, commentFrames);
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
    return { id, path, batch, pendingCount: (await listPending(root)).length, wakeConfigured: Boolean(webhook), responderActive: await isResponderActive(root) };
}
//# sourceMappingURL=batches.js.map