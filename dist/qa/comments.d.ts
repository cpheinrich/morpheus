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
export declare const QaElementAnchor: any;
/** Where the page was when a web pin was placed. `x`/`y` on the anchor are page pixels. */
export declare const QaPageContext: any;
/**
 * Point or region on the captured frame. Prefer normalized coords. For a web page the frame is the
 * whole page, so normX/normY are fractions of the page; `element` and `page` say what and where.
 */
export declare const QaAnchor: any;
/** Small, allowlisted semantic HTML evidence, frozen synchronously at pin placement. */
export declare const QaWebContext: any;
export declare const QaComment: any;
export declare const QaPreview: any;
export declare const QaFrame: any;
export declare const QaCommentBatch: any;
export type QaAnchor = z.infer<typeof QaAnchor>;
export type QaComment = z.infer<typeof QaComment>;
export type QaCommentBatch = z.infer<typeof QaCommentBatch>;
export declare function parseBatch(data: unknown): QaCommentBatch;
