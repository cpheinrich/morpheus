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
export declare const QA_COMMENTS_CLAIMS = "local/qa-comments/claims";
export declare const QA_COMMENTS_RESOLVED = "local/qa-comments/resolved";
/**
 * What a web pin points at (MO-26-10-06-18.13.32). A page reflows and scrolls, so a fraction of
 * the frame alone goes stale after one edit; the element is what the comment is about. `selector`
 * is a CSS path that resolved to exactly this element when the pin was placed; `offsetX`/`offsetY`
 * are fractions of its box; `text` is its trimmed visible text, cut short.
 */
export declare const QaElementAnchor: z.ZodObject<{
    selector: z.ZodString;
    tag: z.ZodString;
    text: z.ZodOptional<z.ZodString>;
    offsetX: z.ZodNumber;
    offsetY: z.ZodNumber;
}, z.core.$strict>;
/** Where the page was when a web pin was placed. `x`/`y` on the anchor are page pixels. */
export declare const QaPageContext: z.ZodObject<{
    url: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    scrollX: z.ZodNumber;
    scrollY: z.ZodNumber;
    viewportWidth: z.ZodNumber;
    viewportHeight: z.ZodNumber;
    pageWidth: z.ZodNumber;
    pageHeight: z.ZodNumber;
}, z.core.$strict>;
/**
 * Point or region on the captured frame. Prefer normalized coords. For a web page the frame is the
 * whole page, so normX/normY are fractions of the page; `element` and `page` say what and where.
 */
export declare const QaAnchor: z.ZodObject<{
    normX: z.ZodOptional<z.ZodNumber>;
    normY: z.ZodOptional<z.ZodNumber>;
    x: z.ZodOptional<z.ZodNumber>;
    y: z.ZodOptional<z.ZodNumber>;
    w: z.ZodOptional<z.ZodNumber>;
    h: z.ZodOptional<z.ZodNumber>;
    element: z.ZodOptional<z.ZodObject<{
        selector: z.ZodString;
        tag: z.ZodString;
        text: z.ZodOptional<z.ZodString>;
        offsetX: z.ZodNumber;
        offsetY: z.ZodNumber;
    }, z.core.$strict>>;
    page: z.ZodOptional<z.ZodObject<{
        url: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        scrollX: z.ZodNumber;
        scrollY: z.ZodNumber;
        viewportWidth: z.ZodNumber;
        viewportHeight: z.ZodNumber;
        pageWidth: z.ZodNumber;
        pageHeight: z.ZodNumber;
    }, z.core.$strict>>;
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
        element: z.ZodOptional<z.ZodObject<{
            selector: z.ZodString;
            tag: z.ZodString;
            text: z.ZodOptional<z.ZodString>;
            offsetX: z.ZodNumber;
            offsetY: z.ZodNumber;
        }, z.core.$strict>>;
        page: z.ZodOptional<z.ZodObject<{
            url: z.ZodString;
            title: z.ZodOptional<z.ZodString>;
            scrollX: z.ZodNumber;
            scrollY: z.ZodNumber;
            viewportWidth: z.ZodNumber;
            viewportHeight: z.ZodNumber;
            pageWidth: z.ZodNumber;
            pageHeight: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    screenId: z.ZodOptional<z.ZodString>;
    frame: z.ZodOptional<z.ZodObject<{
        path: z.ZodOptional<z.ZodString>;
        width: z.ZodNumber;
        height: z.ZodNumber;
        capturedAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
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
            element: z.ZodOptional<z.ZodObject<{
                selector: z.ZodString;
                tag: z.ZodString;
                text: z.ZodOptional<z.ZodString>;
                offsetX: z.ZodNumber;
                offsetY: z.ZodNumber;
            }, z.core.$strict>>;
            page: z.ZodOptional<z.ZodObject<{
                url: z.ZodString;
                title: z.ZodOptional<z.ZodString>;
                scrollX: z.ZodNumber;
                scrollY: z.ZodNumber;
                viewportWidth: z.ZodNumber;
                viewportHeight: z.ZodNumber;
                pageWidth: z.ZodNumber;
                pageHeight: z.ZodNumber;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        screenId: z.ZodOptional<z.ZodString>;
        frame: z.ZodOptional<z.ZodObject<{
            path: z.ZodOptional<z.ZodString>;
            width: z.ZodNumber;
            height: z.ZodNumber;
            capturedAt: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
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
