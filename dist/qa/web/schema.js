/**
 * The production web QA contract (MO-26-11-15-18.52.12), shared by the browser panel
 * (`morpheus-kit/qa/web`) and a site's own server route (`morpheus-kit/qa/web/schema`).
 *
 * The payload is deliberately small: a pathname, a normalized click point, the viewport size and an
 * optional token the site itself placed in `data-qa-anchor`. Nothing here can carry page text,
 * markup, input values, screenshots or a selector the panel invented, because a production page
 * holds real customers' data. Objects are strict so an extra field is a rejection, not a leak.
 */
import { z } from "zod";
export const WEB_QA_LIMITS = {
    comments: 20,
    textChars: 2000,
    pathChars: 2048,
    anchorChars: 64,
    viewportMax: 16384,
    scrollMax: 1_000_000,
};
/** An explicit `data-qa-anchor` value: a short, opaque identifier the site chose to expose. */
export const WEB_QA_ANCHOR = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
// C0 controls (which include ESC), DEL and C1 controls. Raw or percent-escaped, these can rewrite a
// terminal or log line the agent later reads, so a path containing one is refused rather than cleaned.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
/**
 * Why a path is not a plain pathname, or null when it is one. A path must be what
 * `location.pathname` yields: absolute, no query or fragment, no backslash (some servers treat it
 * as a separator), no leading `//` (a protocol-relative URL), no dot segments, and no control
 * character either raw or percent-escaped.
 */
export function webQaPathIssue(path) {
    if (!path.startsWith("/"))
        return "must start with /";
    if (path.startsWith("//"))
        return "must not start with //";
    if (path.length > WEB_QA_LIMITS.pathChars)
        return `must be at most ${WEB_QA_LIMITS.pathChars} characters`;
    if (path.includes("?") || path.includes("#"))
        return "must not include a query or fragment";
    if (path.includes("\\"))
        return "must not include a backslash";
    if (CONTROL.test(path))
        return "must not include control characters";
    let decoded;
    try {
        decoded = decodeURIComponent(path);
    }
    catch {
        return "has a malformed percent escape";
    }
    if (CONTROL.test(decoded) || decoded.includes("\\"))
        return "must not escape control characters or backslashes";
    if (decoded.split("/").some(segment => segment === "." || segment === ".."))
        return "must not include dot segments";
    return null;
}
const Path = z.string().superRefine((path, ctx) => {
    const issue = webQaPathIssue(path);
    if (issue)
        ctx.addIssue({ code: "custom", message: `path ${issue}` });
});
const Unit = z.number().min(0).max(1);
const Viewport = z.number().int().min(1).max(WEB_QA_LIMITS.viewportMax);
const Scroll = z.number().int().min(0).max(WEB_QA_LIMITS.scrollMax);
export const WebQaScope = z.enum(["element", "view", "page"]);
export const WebQaComment = z.strictObject({
    text: z.string().trim().min(1).max(WEB_QA_LIMITS.textChars),
    path: Path,
    scope: WebQaScope,
    x: Unit,
    y: Unit,
    viewportWidth: Viewport,
    viewportHeight: Viewport,
    scrollX: Scroll.optional(),
    scrollY: Scroll.optional(),
    anchor: z.string().max(WEB_QA_LIMITS.anchorChars).regex(WEB_QA_ANCHOR).optional(),
});
export const WebQaBatch = z.strictObject({
    batchId: z.uuid(),
    comments: z.array(WebQaComment).min(1).max(WEB_QA_LIMITS.comments),
    buildAndDeploy: z.boolean(),
    makeFeatureFlag: z.boolean(),
}).refine(batch => batch.buildAndDeploy || !batch.makeFeatureFlag, {
    message: "makeFeatureFlag requires buildAndDeploy",
    path: ["makeFeatureFlag"],
});
export const WebQaReceipt = z.strictObject({
    batchId: z.uuid(),
    factory: z.enum(["not-requested", "queued", "retry"]),
});
/**
 * Validate an untrusted request body. The schema checks shape only: the site's route must still
 * authenticate the caller, authorize QA for that account, and decide whether each `path` is a page
 * this account may comment on. Resubmitting a `batchId` is a retry and must not create a second
 * batch or a second build request.
 */
export function parseWebQaBatch(value) {
    return WebQaBatch.safeParse(value);
}
export function parseWebQaReceipt(value) {
    return WebQaReceipt.safeParse(value);
}
//# sourceMappingURL=schema.js.map