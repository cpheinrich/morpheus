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
export const QA_COMMENTS_CLAIMS = `${QA_COMMENTS_DIR}/claims`;
export const QA_COMMENTS_RESOLVED = `${QA_COMMENTS_DIR}/resolved`;
const norm = z.number().min(0).max(1);
/**
 * What a web pin points at (MO-26-10-06-18.13.32). A page reflows and scrolls, so a fraction of
 * the frame alone goes stale after one edit; the element is what the comment is about. `selector`
 * is a CSS path that resolved to exactly this element when the pin was placed; `offsetX`/`offsetY`
 * are fractions of its box; `text` is its trimmed visible text, cut short.
 */
export const QaElementAnchor = z
    .object({
    selector: z.string().min(1),
    tag: z.string().min(1),
    text: z.string().optional(),
    offsetX: norm,
    offsetY: norm,
})
    .strict();
/** Where the page was when a web pin was placed. `x`/`y` on the anchor are page pixels. */
export const QaPageContext = z
    .object({
    url: z.string().min(1),
    title: z.string().optional(),
    scrollX: z.number(),
    scrollY: z.number(),
    viewportWidth: z.number().positive(),
    viewportHeight: z.number().positive(),
    pageWidth: z.number().positive(),
    pageHeight: z.number().positive(),
})
    .strict();
/**
 * Point or region on the captured frame. Prefer normalized coords. For a web page the frame is the
 * whole page, so normX/normY are fractions of the page; `element` and `page` say what and where.
 */
export const QaAnchor = z
    .object({
    normX: norm.optional(),
    normY: norm.optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    w: z.number().positive().optional(),
    h: z.number().positive().optional(),
    element: QaElementAnchor.optional(),
    page: QaPageContext.optional(),
})
    .strict()
    .refine((a) => (a.normX !== undefined && a.normY !== undefined) ||
    (a.x !== undefined && a.y !== undefined), { message: "anchor needs normX/normY or x/y" });
const webText = z.string().max(240);
const webBounds = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).strict();
const webNode = z.object({
    tag: z.string().max(32),
    attributes: z.partialRecord(z.enum(["id", "data-testid", "data-qa-view", "data-entity-id", "data-artist-id", "role", "aria-label", "aria-labelledby", "name", "type", "alt"]), webText),
    text: webText,
    bounds: webBounds,
    styles: z.partialRecord(z.enum(["display", "position", "color", "background-color", "font-size", "text-decoration-line", "padding", "overflow", "z-index"]), z.string().max(120)),
}).strict();
/** Small, allowlisted semantic HTML evidence, frozen synchronously at pin placement. */
export const QaWebContext = z.object({
    version: z.literal(1),
    scope: z.enum(["element", "view", "page"]),
    capturedAt: z.string().min(1).max(64),
    route: z.object({ pathname: webText, query: z.string().max(1000), hash: webText }).strict(),
    target: webNode,
    ancestors: z.array(webNode).max(6),
    view: z.object({ kind: z.enum(["dialog", "view", "page"]), identity: z.string().max(2000), root: webNode }).strict(),
    state: z.array(z.object({ kind: z.string().max(32), label: webText, value: webText }).strict()).max(16),
    scroll: z.array(z.object({ selector: webText, x: z.number(), y: z.number() }).strict()).max(8),
    viewport: z.object({ width: z.number().positive(), height: z.number().positive(), scrollX: z.number(), scrollY: z.number() }).strict(),
    limitations: z.array(z.string().max(160)).max(4),
    image: z.object({
        status: z.enum(["pending", "captured", "failed"]),
        coordinateSpace: z.literal("viewport"),
        scale: z.number().positive(),
        scaleX: z.number().positive().optional(),
        scaleY: z.number().positive().optional(),
        quality: z.literal(0.5),
        point: z.object({ x: z.number(), y: z.number() }).strict(),
        omitted: z.array(z.string().max(160)).max(4).optional(),
        error: z.string().max(160).optional(),
    }).strict().optional(),
}).strict();
export const QaComment = z
    .object({
    id: z.string().min(1),
    text: z.string().min(1),
    createdAt: z.string().min(1),
    anchor: QaAnchor,
    webContext: QaWebContext.optional(),
    /** Stable accessibility identifier for the screen at pin placement. */
    screenId: z.string().min(1).optional(),
    /** Optional immutable image captured when this pin was placed. */
    frame: z.object({
        path: z.string().min(1).optional(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        capturedAt: z.string().optional(),
    }).strict().optional(),
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
export function parseBatch(data) {
    return QaCommentBatch.parse(data);
}
//# sourceMappingURL=comments.js.map