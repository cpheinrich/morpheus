import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { QA_COMMENTS_DIR } from "./comments.js";

/** Durable, gitignored config under the project that receives batches. */
export const QA_COMMENTS_WEBHOOK_FILE = `${QA_COMMENTS_DIR}/webhook.json`;

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

/**
 * Resolve the wake webhook URL.
 *
 * Precedence: `MORPHEUS_QA_COMMENTS_WEBHOOK_URL` (session override), then
 * `local/qa-comments/webhook.json` `{ "url": "..." }` under the project root.
 * The file is the durable, one-true config; the env var is for one-off sessions.
 */
export async function resolveWebhookUrl(root: string): Promise<string | null> {
  const fromEnv = process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_URL?.trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = JSON.parse(
      await readFile(join(root, QA_COMMENTS_WEBHOOK_FILE), "utf8"),
    ) as { url?: unknown };
    if (typeof raw.url === "string" && raw.url.trim()) return raw.url.trim();
  } catch {
    /* absent or unreadable — fine */
  }
  return null;
}

const WEBHOOK_TIMEOUT_MS = 2500;

/**
 * Fire-and-forget POST. Never throws to the caller; logs a one-line result.
 * Send must not wait on this.
 */
export function notifyBatchPending(
  webhookUrl: string,
  payload: QaCommentsWebhookPayload,
): void {
  const body = JSON.stringify(payload);
  void fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  })
    .then((res) => {
      if (!res.ok) {
        console.error(
          `qa comments webhook: ${res.status} ${res.statusText} for batch ${payload.id}`,
        );
        return;
      }
      console.log(`qa comments webhook: notified for batch ${payload.id}`);
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`qa comments webhook: failed for batch ${payload.id} (${msg})`);
    });
}
