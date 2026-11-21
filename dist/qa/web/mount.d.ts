import { type WebQaBatch, type WebQaReceipt } from "./schema.js";
export type { WebQaBatch, WebQaComment, WebQaEvidence, WebQaReceipt, WebQaScope } from "./schema.js";
/** The host uses this only for a response that rejected the request before writing. */
export declare class WebQaRejectedError extends Error {
}
export interface WebQaMountOptions {
    /** Shown in the panel title and part of the draft storage key. */
    project: string;
    /** An opaque per-account key (for example a user id), so two accounts in one tab never share drafts. */
    accountKey: string;
    /** Show the Build and deploy option. The server must still authorize it. */
    canBuild: boolean;
    /** Attach a redacted pin-time viewport image and bounded diagnostics. Defaults to off. */
    captureEvidence?: boolean;
    submit: (batch: WebQaBatch) => Promise<WebQaReceipt>;
    onClose: () => void;
}
/** Mount the QA panel in Pin mode. Returns a function that removes every trace of it from the page. */
export declare function mountWebQa(options: WebQaMountOptions): () => void;
