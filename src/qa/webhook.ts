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
 * - `MORPHEUS_QA_COMMENTS_WEBHOOK_URL` — replaces url when set; empty disables waking
 * - `MORPHEUS_QA_COMMENTS_WEBHOOK_AUTHORIZATION` — replaces authorization when set; empty clears it
 */
export async function resolveWebhookConfig(
  root: string,
): Promise<QaCommentsWebhookConfig | null> {
  let url: string | undefined;
  let authorization: string | undefined;

  try {
    const raw = JSON.parse(
      await readFile(join(root, QA_COMMENTS_WEBHOOK_FILE), "utf8"),
    ) as { url?: unknown; authorization?: unknown };
    if (typeof raw.url === "string" && raw.url.trim()) url = raw.url.trim();
    if (typeof raw.authorization === "string" && raw.authorization.trim()) {
      authorization = raw.authorization.trim();
    }
  } catch {
    /* absent or unreadable — fine */
  }

  const envUrl = process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_URL?.trim();
  if (envUrl !== undefined) url = envUrl;
  const envAuth = process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_AUTHORIZATION?.trim();
  if (envAuth !== undefined) authorization = envAuth;

  if (!url) return null;
  return authorization ? { url, authorization } : { url };
}

/** @deprecated Prefer resolveWebhookConfig — kept for call-site clarity in logs. */
export async function resolveWebhookUrl(root: string): Promise<string | null> {
  return (await resolveWebhookConfig(root))?.url ?? null;
}

/** Normalize to a full Authorization header value. */
export function authorizationHeaderValue(raw: string): string {
  const trimmed = raw.trim();
  if (/^bearer\s+/i.test(trimmed)) return trimmed;
  return `Bearer ${trimmed}`;
}

const WEBHOOK_TIMEOUT_MS = 2500;

/**
 * Fire-and-forget POST. Never throws to the caller; logs a one-line result.
 * Send must not wait on this.
 */
export function notifyBatchPending(
  webhookUrl: string,
  payload: QaCommentsWebhookPayload,
  options?: { authorization?: string },
): void {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (options?.authorization) {
    headers.Authorization = authorizationHeaderValue(options.authorization);
  }
  void fetch(webhookUrl, {
    method: "POST",
    headers,
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
