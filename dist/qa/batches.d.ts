import { type QaCommentBatch } from "./comments.js";
/**
 * Turns a posted batch into a pending batch on disk: validated against the shared schema, frame
 * written when a PNG came with it, and the wake webhook notified when one is configured.
 *
 * Shared by the simulator overlay and the web overlay (MO-26-10-06-18.13.32) so the two cannot
 * write different shapes into the one inbox agents read.
 */
export interface PostedBatch {
    preview?: {
        url: string;
        kind?: "serve-sim" | "web" | "other";
        label?: string;
    };
    comments: unknown[];
    frame?: {
        path?: string;
        width: number;
        height: number;
        capturedAt?: string;
        dataUrl?: string;
    };
}
export declare class BatchRejected extends Error {
}
export declare function newBatchId(now?: Date): string;
export declare function recordBatch(root: string, project: string, raw: PostedBatch, defaultPreview: {
    url: string;
    kind: "serve-sim" | "web" | "other";
}): Promise<{
    id: string;
    path: string;
    batch: QaCommentBatch;
    pendingCount: number;
    wakeConfigured: boolean;
    responderActive: boolean;
}>;
