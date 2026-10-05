import { type QaCommentBatch } from "./comments.js";
export interface BatchListing {
    id: string;
    path: string;
    status: "pending" | "resolved";
    project: string;
    commentCount: number;
    createdAt: string;
    previewUrl: string;
}
/** Pending batches newest-last (id sort is chronological). */
export declare function listPending(root: string): Promise<BatchListing[]>;
export declare function showBatch(root: string, id: string): Promise<{
    batch: QaCommentBatch;
    path: string;
} | null>;
/**
 * Move pending → resolved and stamp status. Idempotent if already resolved.
 * Returns null when the id is missing from both trees.
 */
export declare function resolveBatch(root: string, id: string, resolvedBy?: string): Promise<QaCommentBatch | null>;
/** Test helper: write a pending batch directory. */
export declare function writePendingBatch(root: string, batch: QaCommentBatch, frameBytes?: Buffer): Promise<string>;
export declare function removeBatchTree(root: string): Promise<void>;
