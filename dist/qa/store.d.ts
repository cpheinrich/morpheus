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
export interface BatchClaim {
    id: string;
    agent: string;
    claimedAt: string;
}
export declare class BatchClaimedError extends Error {
}
export declare function readBatchClaim(root: string, id: string): Promise<BatchClaim | null>;
/** Atomically reserve the oldest unclaimed batch for one agent. Claims survive process exits. */
export declare function claimNextBatch(root: string, agent: string): Promise<BatchClaim | null>;
/** Release a claim after a failed attempt, or explicitly recover an abandoned claim. */
export declare function releaseBatchClaim(root: string, id: string, agent: string, force?: boolean): Promise<boolean>;
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
/** Publish the complete batch and optional frame atomically into the durable queue. */
export declare function writePendingBatch(root: string, batch: QaCommentBatch, frameBytes?: Buffer, commentFrames?: ReadonlyMap<string, Buffer>): Promise<string>;
export declare function removeBatchTree(root: string): Promise<void>;
