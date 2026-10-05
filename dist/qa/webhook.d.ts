/** Durable, gitignored config under the project that receives batches. */
export declare const QA_COMMENTS_WEBHOOK_FILE = "local/qa-comments/webhook.json";
export interface QaCommentsWebhookPayload {
    event: "qa.comments.batch_pending";
    id: string;
    project: string;
    root: string;
    pendingDir: string;
    path: string;
    commentCount: number;
    createdAt: string;
}
export interface QaCommentsWebhookConfig {
    url: string;
    /** Raw token or full `Bearer …` value; normalized when sent. */
    authorization?: string;
}
/**
 * Resolve wake webhook config.
 *
 * Durable file (preferred): `local/qa-comments/webhook.json`
 * `{ "url": "…", "authorization"?: "Bearer …" | "<token>" }`.
 *
 * Session overrides:
 * - `MORPHEUS_QA_COMMENTS_WEBHOOK_URL` — replaces url when set
 * - `MORPHEUS_QA_COMMENTS_WEBHOOK_AUTHORIZATION` — replaces authorization when set
 */
export declare function resolveWebhookConfig(root: string): Promise<QaCommentsWebhookConfig | null>;
/** @deprecated Prefer resolveWebhookConfig — kept for call-site clarity in logs. */
export declare function resolveWebhookUrl(root: string): Promise<string | null>;
/** Normalize to a full Authorization header value. */
export declare function authorizationHeaderValue(raw: string): string;
/**
 * Fire-and-forget POST. Never throws to the caller; logs a one-line result.
 * Send must not wait on this.
 */
export declare function notifyBatchPending(webhookUrl: string, payload: QaCommentsWebhookPayload, options?: {
    authorization?: string;
}): void;
