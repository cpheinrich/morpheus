/**
 * The production web QA contract (MO-26-11-15-18.52.12), shared by the browser panel
 * (`morpheus-kit/qa/web`) and a site's own server route (`morpheus-kit/qa/web/schema`).
 *
 * The payload is deliberately small: a pathname, a normalized click point, the viewport size and an
 * optional token the site itself placed in `data-qa-anchor`. Opted-in clients can attach a
 * redacted JPEG and bounded diagnostics. Objects are strict: no markup, raw logs or selectors.
 */
import { z } from "zod";
import { QaNotes, QA_NOTES_MAX_CHARS } from "../notes.js";

export const WEB_QA_LIMITS = {
  comments: 20,
  textChars: 2000,
  notesChars: QA_NOTES_MAX_CHARS,
  pathChars: 2048,
  anchorChars: 64,
  viewportMax: 16384,
  scrollMax: 1_000_000,
} as const;

export const WEB_QA_MAX_BODY_BYTES = 3 * 1024 * 1024;
export const WEB_QA_JPEG_MAX_CHARS = 100_000;
export const WEB_QA_JPEG_MAX_EDGE = 1280;
export const WEB_QA_COUNT_MAX = 4096;

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
export function webQaPathIssue(path: string): string | null {
  if (!path.startsWith("/")) return "must start with /";
  if (path.startsWith("//")) return "must not start with //";
  if (path.length > WEB_QA_LIMITS.pathChars) return `must be at most ${WEB_QA_LIMITS.pathChars} characters`;
  if (path.includes("?") || path.includes("#")) return "must not include a query or fragment";
  if (path.includes("\\")) return "must not include a backslash";
  if (CONTROL.test(path)) return "must not include control characters";
  let decoded: string;
  try { decoded = decodeURIComponent(path); } catch { return "has a malformed percent escape"; }
  if (CONTROL.test(decoded) || decoded.includes("\\")) return "must not escape control characters or backslashes";
  if (decoded.split("/").some(segment => segment === "." || segment === "..")) return "must not include dot segments";
  return null;
}

const Path = z.string().superRefine((path, ctx) => {
  const issue = webQaPathIssue(path);
  if (issue) ctx.addIssue({ code: "custom", message: `path ${issue}` });
});
const Unit = z.number().min(0).max(1);
const Viewport = z.number().int().min(1).max(WEB_QA_LIMITS.viewportMax);
const Scroll = z.number().int().min(0).max(WEB_QA_LIMITS.scrollMax);

export const WebQaScope = z.enum(["element", "view", "page"]);
export type WebQaScope = z.infer<typeof WebQaScope>;

export const WebQaEvidenceInput = z.enum(["left-click", "right-click", "keyboard", "page"]);
export type WebQaEvidenceInput = z.infer<typeof WebQaEvidenceInput>;
export const WebQaEvidenceReason = z.enum(["interrupted", "snapshot-limit", "unsupported", "render-failed", "image-too-large", "storage-unavailable"]);
const Family = z.enum(["Chromium", "Chrome", "Edge", "Firefox", "Safari", "Opera", "Samsung Internet", "Unknown"]);
const Browser = z.discriminatedUnion("versionSource", [
  z.strictObject({ family: Family, versionSource: z.literal("user-agent"), version: z.string().max(23).regex(/^\d{1,5}(?:\.\d{1,5}){0,3}$/) }),
  z.strictObject({ family: Family, versionSource: z.literal("unavailable") }),
]);
export const WebQaEvidenceElement = z.strictObject({
  tag: z.enum(["a", "article", "aside", "body", "button", "details", "dialog", "div", "footer", "form", "h1", "h2", "h3", "header", "img", "label", "li", "main", "nav", "ol", "p", "section", "span", "summary", "table", "td", "ul", "other"]),
  role: z.enum(["button", "checkbox", "dialog", "heading", "link", "list", "listitem", "main", "menu", "menuitem", "navigation", "region", "status", "switch", "tab", "tablist", "tabpanel"]).optional(),
  expanded: z.boolean().optional(),
  pressed: z.enum(["true", "false", "mixed"]).optional(),
  selected: z.boolean().optional(),
  position: z.enum(["static", "relative", "absolute", "fixed", "sticky"]),
  width: z.number().int().min(0).max(WEB_QA_LIMITS.viewportMax),
  height: z.number().int().min(0).max(WEB_QA_LIMITS.viewportMax),
  scrollLeft: z.number().int().min(-WEB_QA_LIMITS.scrollMax).max(WEB_QA_LIMITS.scrollMax).optional(),
  scrollTop: Scroll.optional(),
});
const Count = z.number().int().min(0).max(WEB_QA_COUNT_MAX);
const ImageEdge = z.number().int().min(1).max(WEB_QA_JPEG_MAX_EDGE);
const Base64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=|[A-Za-z0-9+/][AQgw]==)?$/;

type JpegImage = { jpegBase64: string; width: number; height: number };
const JPEG_HEADER_MARKERS = new Set([0xc4, 0xdb, 0xdd, 0xfe, ...Array.from({ length: 16 }, (_, index) => 0xe0 + index)]);

function jpegWord(bytes: string, offset: number): number {
  return bytes.charCodeAt(offset) * 256 + bytes.charCodeAt(offset + 1);
}

function jpegFrameMatches(bytes: string, index: number, length: number, image: JpegImage): boolean {
  const components = bytes.charCodeAt(index + 7);
  return (components === 1 || components === 3)
    && length === 8 + 3 * components
    && bytes.charCodeAt(index + 2) === 8
    && jpegWord(bytes, index + 3) === image.height
    && jpegWord(bytes, index + 5) === image.width;
}

function jpegMatches(value: JpegImage): boolean {
  if (value.jpegBase64.length > WEB_QA_JPEG_MAX_CHARS || !Base64.test(value.jpegBase64)) return false;
  const bytes = atob(value.jpegBase64);
  const end = bytes.length - 2;
  return jpegWord(bytes, 0) === 0xffd8 && jpegWord(bytes, end) === 0xffd9 && jpegScanMatches(bytes, end, value);
}

function jpegScanMatches(bytes: string, end: number, value: JpegImage): boolean {
  let dimensions = false;
  for (let index = 2; index + 4 <= end;) {
    if (bytes.charCodeAt(index++) !== 0xff) return false;
    while (bytes.charCodeAt(index) === 0xff) index++;
    const marker = bytes.charCodeAt(index++);
    const length = jpegWord(bytes, index);
    const next = index + length;
    if (!(length >= 2 && next <= end)) return false;
    if (marker === 0xda) return dimensions && length >= 6 && next < end;
    if (marker >= 0xc0 && marker <= 0xc2) {
      if (dimensions || !jpegFrameMatches(bytes, index, length, value)) return false;
      dimensions = true;
    } else if (!JPEG_HEADER_MARKERS.has(marker)) return false;
    index = next;
  }
  return false;
}

export const WebQaEvidenceStatus = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("captured"), jpegBase64: z.string().min(1).max(WEB_QA_JPEG_MAX_CHARS), width: ImageEdge, height: ImageEdge }),
  z.strictObject({ kind: z.literal("unavailable"), reason: WebQaEvidenceReason }),
]).refine(status => status.kind !== "captured" || jpegMatches(status), { message: "Invalid viewport JPEG or dimensions" });

export const WebQaEvidence = z.strictObject({
  schemaVersion: z.literal(1),
  capturedAt: z.iso.datetime({ precision: 3 }).max(24),
  input: WebQaEvidenceInput,
  browser: Browser,
  os: z.enum(["Android", "iOS", "macOS", "Windows", "ChromeOS", "Linux", "Unknown"]),
  dpr: z.number().min(0.1).max(32).optional(),
  theme: z.enum(["light", "dark"]),
  elements: z.array(WebQaEvidenceElement).max(4).optional(),
  resources: Count.optional(),
  errorsSinceMount: Count.optional(),
  status: WebQaEvidenceStatus,
});
export type WebQaEvidence = z.infer<typeof WebQaEvidence>;

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
  evidence: WebQaEvidence.optional(),
});
export type WebQaComment = z.infer<typeof WebQaComment>;

export const WebQaBatch = z.strictObject({
  batchId: z.uuid(),
  notes: QaNotes,
  comments: z.array(WebQaComment).min(1).max(WEB_QA_LIMITS.comments),
  buildAndDeploy: z.boolean(),
  makeFeatureFlag: z.boolean(),
}).refine(batch => batch.buildAndDeploy || !batch.makeFeatureFlag, {
  message: "makeFeatureFlag requires buildAndDeploy",
  path: ["makeFeatureFlag"],
});
export type WebQaBatch = z.infer<typeof WebQaBatch>;

export const WebQaReceipt = z.strictObject({
  batchId: z.uuid(),
  factory: z.enum(["not-requested", "queued", "retry"]),
});
export type WebQaReceipt = z.infer<typeof WebQaReceipt>;

/**
 * Validate an untrusted request body. The schema checks shape only: the site's route must still
 * authenticate the caller, authorize QA for that account, and decide whether each `path` is a page
 * this account may comment on. Resubmitting a `batchId` is a retry and must not create a second
 * batch or a second build request.
 */
export function parseWebQaBatch(value: unknown) {
  return WebQaBatch.safeParse(value);
}

export function parseWebQaReceipt(value: unknown) {
  return WebQaReceipt.safeParse(value);
}
