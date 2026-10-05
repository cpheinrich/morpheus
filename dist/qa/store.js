import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { QA_COMMENTS_PENDING, QA_COMMENTS_RESOLVED, parseBatch, } from "./comments.js";
function pendingRoot(root) {
    return join(root, QA_COMMENTS_PENDING);
}
function resolvedRoot(root) {
    return join(root, QA_COMMENTS_RESOLVED);
}
async function readBatchFile(batchDir) {
    try {
        const raw = JSON.parse(await readFile(join(batchDir, "batch.json"), "utf8"));
        return parseBatch(raw);
    }
    catch {
        return null;
    }
}
async function listStatus(root, status) {
    const dir = status === "pending" ? pendingRoot(root) : resolvedRoot(root);
    let entries;
    try {
        entries = await readdir(dir);
    }
    catch {
        return [];
    }
    const listings = [];
    for (const id of entries.sort()) {
        const path = join(dir, id);
        const batch = await readBatchFile(path);
        if (!batch)
            continue;
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
export async function listPending(root) {
    return listStatus(root, "pending");
}
export async function showBatch(root, id) {
    for (const status of ["pending", "resolved"]) {
        const path = join(status === "pending" ? pendingRoot(root) : resolvedRoot(root), id);
        const batch = await readBatchFile(path);
        if (batch)
            return { batch, path };
    }
    return null;
}
/**
 * Move pending → resolved and stamp status. Idempotent if already resolved.
 * Returns null when the id is missing from both trees.
 */
export async function resolveBatch(root, id, resolvedBy = "agent") {
    const pendingPath = join(pendingRoot(root), id);
    const resolvedPath = join(resolvedRoot(root), id);
    let batch = await readBatchFile(pendingPath);
    let from = pendingPath;
    if (!batch) {
        batch = await readBatchFile(resolvedPath);
        if (!batch)
            return null;
        from = resolvedPath;
    }
    const next = {
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
export async function writePendingBatch(root, batch, frameBytes) {
    const dir = join(pendingRoot(root), batch.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "batch.json"), `${JSON.stringify(batch, null, 2)}\n`, "utf8");
    if (frameBytes)
        await writeFile(join(dir, "frame.png"), frameBytes);
    return dir;
}
export async function removeBatchTree(root) {
    await rm(join(root, "local/qa-comments"), { recursive: true, force: true });
}
//# sourceMappingURL=store.js.map