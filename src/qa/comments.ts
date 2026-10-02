import { z } from "zod";

/**
 * Structured QA comment batches for agent review.
 *
 * Local-only under `local/qa-comments/` (gitignored). The overlay writer and
 * `morpheus qa comments` CLI share this schema so Evo, Lakina, Kairos and any
 * other Morpheus project speak the same format. See docs/runbooks/qa-comments.md.
 */

export const QA_COMMENTS_DIR = "local/qa-comments";
export const QA_COMMENTS_PENDING = `${QA_COMMENTS_DIR}/pending`;
export const QA_COMMENTS_RESOLVED = `${QA_COMMENTS_DIR}/resolved`;

const norm = z.number().min(0).max(1);

/** Point or region on the captured frame. Prefer normalized coords. */
export const QaAnchor = z
  .object({
    normX: norm.optional(),
    normY: norm.optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    w: z.number().positive().optional(),
    h: z.number().positive().optional(),
  })
  .strict()
  .refine(
    (a) =>
      (a.normX !== undefined && a.normY !== undefined) ||
      (a.x !== undefined && a.y !== undefined),
    { message: "anchor needs normX/normY or x/y" },
  );

export const QaComment = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    createdAt: z.string().min(1),
    anchor: QaAnchor,
  })
  .strict();

export const QaPreview = z
  .object({
    url: z.string().min(1),
    kind: z.enum(["serve-sim", "web", "other"]).optional(),
    label: z.string().optional(),
  })
  .strict();

export const QaFrame = z
  .object({
    /** Basename relative to the batch directory, usually `frame.png`. */
    path: z.string().min(1).optional(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    capturedAt: z.string().optional(),
  })
  .strict();

export const QaCommentBatch = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    project: z.string().min(1),
    createdAt: z.string().min(1),
    preview: QaPreview,
    frame: QaFrame.optional(),
    comments: z.array(QaComment).min(1),
    status: z.enum(["pending", "resolved"]),
    resolvedAt: z.string().optional(),
    resolvedBy: z.string().optional(),
  })
  .strict();

export type QaAnchor = z.infer<typeof QaAnchor>;
export type QaComment = z.infer<typeof QaComment>;
export type QaCommentBatch = z.infer<typeof QaCommentBatch>;

export function parseBatch(data: unknown): QaCommentBatch {
  return QaCommentBatch.parse(data);
}
