import { z } from "zod";
/**
 * Structured QA comment batches for agent review.
 *
 * Local-only under `local/qa-comments/` (gitignored). The overlay writer and
 * `morpheus qa comments` CLI share this schema so Evo, Lakina, Kairos and any
 * other Morpheus project speak the same format. See docs/runbooks/qa-comments.md.
 */
export declare const QA_COMMENTS_DIR = "local/qa-comments";
export declare const QA_COMMENTS_PENDING = "local/qa-comments/pending";
export declare const QA_COMMENTS_RESOLVED = "local/qa-comments/resolved";
/** Point or region on the captured frame. Prefer normalized coords. */
export declare const QaAnchor: z.ZodObject<{
    normX: z.ZodOptional<z.ZodNumber>;
    normY: z.ZodOptional<z.ZodNumber>;
    x: z.ZodOptional<z.ZodNumber>;
    y: z.ZodOptional<z.ZodNumber>;
    w: z.ZodOptional<z.ZodNumber>;
    h: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const QaComment: z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
    createdAt: z.ZodString;
    anchor: z.ZodObject<{
        normX: z.ZodOptional<z.ZodNumber>;
        normY: z.ZodOptional<z.ZodNumber>;
        x: z.ZodOptional<z.ZodNumber>;
        y: z.ZodOptional<z.ZodNumber>;
        w: z.ZodOptional<z.ZodNumber>;
        h: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
}, z.core.$strict>;
export declare const QaPreview: z.ZodObject<{
    url: z.ZodString;
    kind: z.ZodOptional<z.ZodEnum<{
        other: "other";
        "serve-sim": "serve-sim";
        web: "web";
    }>>;
    label: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const QaFrame: z.ZodObject<{
    path: z.ZodOptional<z.ZodString>;
    width: z.ZodNumber;
    height: z.ZodNumber;
    capturedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const QaCommentBatch: z.ZodObject<{
    version: z.ZodLiteral<1>;
    id: z.ZodString;
    project: z.ZodString;
    createdAt: z.ZodString;
    preview: z.ZodObject<{
        url: z.ZodString;
        kind: z.ZodOptional<z.ZodEnum<{
            other: "other";
            "serve-sim": "serve-sim";
            web: "web";
        }>>;
        label: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    frame: z.ZodOptional<z.ZodObject<{
        path: z.ZodOptional<z.ZodString>;
        width: z.ZodNumber;
        height: z.ZodNumber;
        capturedAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    comments: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        createdAt: z.ZodString;
        anchor: z.ZodObject<{
            normX: z.ZodOptional<z.ZodNumber>;
            normY: z.ZodOptional<z.ZodNumber>;
            x: z.ZodOptional<z.ZodNumber>;
            y: z.ZodOptional<z.ZodNumber>;
            w: z.ZodOptional<z.ZodNumber>;
            h: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>;
    }, z.core.$strict>>;
    status: z.ZodEnum<{
        pending: "pending";
        resolved: "resolved";
    }>;
    resolvedAt: z.ZodOptional<z.ZodString>;
    resolvedBy: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type QaAnchor = z.infer<typeof QaAnchor>;
export type QaComment = z.infer<typeof QaComment>;
export type QaCommentBatch = z.infer<typeof QaCommentBatch>;
export declare function parseBatch(data: unknown): QaCommentBatch;
