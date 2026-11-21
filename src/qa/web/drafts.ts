/**
 * The production web QA panel's state, without DOM rendering: what one pin records, how drafts
 * survive navigation and reload, and how Send stays safe to retry. `mount.ts` draws it.
 *
 * Retry safety. Send freezes the batch (UUID, comments and options) into `pending` and writes it
 * to sessionStorage *before* calling the host, so a lost response, a reload mid-request or a
 * "saved, but the build request did not queue" receipt all resend exactly the same batch. The host
 * server treats a repeated `batchId` as the same batch.
 */
import { z } from "zod";
import {
  WEB_QA_ANCHOR, WEB_QA_LIMITS, WebQaBatch, WebQaEvidence, WebQaScope, parseWebQaReceipt, webQaPathIssue,
  type WebQaComment, type WebQaReceipt,
} from "./schema.js";

const Unit = z.number().min(0).max(1);
const WebQaDraft = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(WEB_QA_LIMITS.textChars),
  path: z.string().refine(path => webQaPathIssue(path) === null),
  scope: WebQaScope,
  x: Unit,
  y: Unit,
  viewportWidth: z.number().int().min(1).max(WEB_QA_LIMITS.viewportMax),
  viewportHeight: z.number().int().min(1).max(WEB_QA_LIMITS.viewportMax),
  scrollX: z.number().int().min(0).max(WEB_QA_LIMITS.scrollMax).optional(),
  scrollY: z.number().int().min(0).max(WEB_QA_LIMITS.scrollMax).optional(),
  anchor: z.string().max(WEB_QA_LIMITS.anchorChars).regex(WEB_QA_ANCHOR).optional(),
  evidence: WebQaEvidence.optional(),
  // Local-only, never sent: where to redraw the marker after scrolling.
  pageX: z.number().finite(),
  pageY: z.number().finite(),
  anchorX: Unit.optional(),
  anchorY: Unit.optional(),
});
export type WebQaDraft = z.infer<typeof WebQaDraft>;

const WebQaSession = z.object({
  version: z.literal(1),
  drafts: z.array(WebQaDraft).max(WEB_QA_LIMITS.comments),
  notes: z.string().max(WEB_QA_LIMITS.notesChars).optional(),
  buildAndDeploy: z.boolean(),
  makeFeatureFlag: z.boolean(),
  pending: z.object({
    batch: WebQaBatch,
    drafts: z.array(WebQaDraft).max(WEB_QA_LIMITS.comments),
    // unconfirmed: no receipt yet (lost response, reload, failure). build-retry: comments saved,
    // build request not queued.
    state: z.enum(["unconfirmed", "build-retry", "rejected"]),
  }).nullable(),
});
export type WebQaSession = z.infer<typeof WebQaSession>;

export function emptySession(): WebQaSession {
  return { version: 1, drafts: [], buildAndDeploy: false, makeFeatureFlag: false, pending: null };
}

/** One tab's drafts per project, signed-in account and site origin. */
export function sessionKey(project: string, accountKey: string, origin: string): string {
  return ["morpheus-qa-web", "v1", project, accountKey, origin].map(encodeURIComponent).join(":");
}

/** A stored session, or a fresh one when storage is unavailable or holds something else. */
export function loadSession(storage: Pick<Storage, "getItem"> | null, key: string): WebQaSession {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return emptySession();
    const parsed = WebQaSession.safeParse(JSON.parse(raw));
    if (!parsed.success) return emptySession();
    const { pending } = parsed.data;
    if (pending) pending.drafts = pending.drafts.map((draft, index) => ({ ...draft, evidence: pending.batch.comments[index]?.evidence }));
    return parsed.data;
  } catch {
    return emptySession();
  }
}

/** False when the browser refused the write (quota, private mode); the caller warns. */
export function saveSession(storage: Pick<Storage, "setItem"> | null, key: string, session: WebQaSession): boolean {
  try {
    if (!storage) return false;
    const pending = session.pending && {
      ...session.pending,
      drafts: session.pending.drafts.map(draft => ({ ...draft, evidence: undefined })),
    };
    storage.setItem(key, JSON.stringify({ ...session, pending }));
    return true;
  } catch {
    return false;
  }
}

// Autocomplete tokens for credentials and payment data. The panel never reads values, but a pin on
// such a field tells the reader where a secret was typed, so these fields refuse pins outright.
const SECRET_AUTOCOMPLETE = /^(cc-.*|one-time-code|current-password|new-password)$/;
const SECRET_INPUT_TYPES = new Set(["password", "file", "hidden"]);

function closestAcrossShadows(element: Element, selector: string): Element | null {
  let current: Element | null = element;
  while (current) {
    const match = current.closest(selector);
    if (match) return match;
    const root: Node = current.getRootNode();
    current = root instanceof ShadowRoot ? root.host : null;
  }
  return null;
}

/** Why a pin may not be placed on this element, or null when it may. */
export function blockedReason(el: Element): string | null {
  if (closestAcrossShadows(el, "[data-qa-private]")) return "This area is private; pin something nearby instead.";
  const field = closestAcrossShadows(el, "input, textarea, select");
  if (!field) return null;
  const type = (field.getAttribute("type") || "").toLowerCase();
  if (field.tagName === "INPUT" && SECRET_INPUT_TYPES.has(type)) return "Pins cannot be placed on this field.";
  const tokens = (field.getAttribute("autocomplete") || "").toLowerCase().split(/\s+/);
  if (tokens.some(token => SECRET_AUTOCOMPLETE.test(token))) return "Pins cannot be placed on this field.";
  return null;
}

/** The nearest explicit `data-qa-anchor` token, when it is a valid one. */
export function anchorFor(el: Element): { token: string; el: Element } | null {
  const host = closestAcrossShadows(el, "[data-qa-anchor]");
  const token = host?.getAttribute("data-qa-anchor") ?? "";
  if (!host || token.length > WEB_QA_LIMITS.anchorChars || !WEB_QA_ANCHOR.test(token)) return null;
  return { token, el: host };
}

/** Drafts and the pending batch together stay within one batch, so reopening a batch never overflows. */
export function canPin(session: WebQaSession): boolean {
  return session.drafts.length + (session.pending?.drafts.length ?? 0) < WEB_QA_LIMITS.comments;
}

const round = (n: number) => Math.round(n * 10000) / 10000;
const unit = (n: number) => round(Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0)));
const scroll = (n: number) => Math.min(WEB_QA_LIMITS.scrollMax, Math.max(0, Math.round(n) || 0));
const viewport = (n: number) => Math.min(WEB_QA_LIMITS.viewportMax, Math.max(1, Math.round(n) || 1));

type PinWindow = Pick<Window, "innerWidth" | "innerHeight" | "scrollX" | "scrollY"> & { location: Pick<Location, "pathname"> };

/**
 * A new draft for a click on `target`, or the reason none is allowed. Reads only the pathname,
 * the viewport, the click point and an explicit anchor token — never text, values or markup.
 */
export function pinAt(win: PinWindow, target: Element, clientX: number, clientY: number, id: string):
  { draft: WebQaDraft } | { error: string } {
  const path = win.location.pathname;
  if (webQaPathIssue(path)) return { error: "This page's address cannot be recorded." };
  const blocked = blockedReason(target);
  if (blocked) return { error: blocked };
  const draft: WebQaDraft = {
    id, text: "", path, scope: "element",
    x: unit(clientX / win.innerWidth), y: unit(clientY / win.innerHeight),
    viewportWidth: viewport(win.innerWidth), viewportHeight: viewport(win.innerHeight),
    scrollX: scroll(win.scrollX), scrollY: scroll(win.scrollY),
    pageX: clientX + win.scrollX, pageY: clientY + win.scrollY,
  };
  const anchor = anchorFor(target);
  if (anchor) {
    const r = anchor.el.getBoundingClientRect();
    draft.anchor = anchor.token;
    draft.anchorX = unit(r.width ? (clientX - r.left) / r.width : 0.5);
    draft.anchorY = unit(r.height ? (clientY - r.top) / r.height : 0.5);
  }
  return { draft };
}

/** Viewport point for a draft's marker on the current page, or null when it belongs elsewhere or is off screen. */
export function markerPoint(draft: WebQaDraft, win: PinWindow, doc: Pick<Document, "querySelector">): { x: number; y: number } | null {
  if (draft.path !== win.location.pathname) return null;
  let x = draft.pageX - win.scrollX, y = draft.pageY - win.scrollY;
  // The token's character set excludes quotes and backslashes, so it is safe inside the selector.
  const el = draft.anchor ? doc.querySelector(`[data-qa-anchor="${draft.anchor}"]`) : null;
  const r = el?.getBoundingClientRect();
  if (r && (r.width || r.height)) {
    x = r.left + (draft.anchorX ?? 0.5) * r.width;
    y = r.top + (draft.anchorY ?? 0.5) * r.height;
  }
  if (x < 0 || y < 0 || x > win.innerWidth || y > win.innerHeight) return null;
  return { x, y };
}

function comment(draft: WebQaDraft): WebQaComment {
  const { text, path, scope, x, y, viewportWidth, viewportHeight, scrollX, scrollY, anchor, evidence } = draft;
  return { text: text.trim(), path, scope, x, y, viewportWidth, viewportHeight, scrollX, scrollY, ...(anchor ? { anchor } : {}), ...(evidence ? { evidence } : {}) };
}

/**
 * Freeze the drafts that have text into a pending batch. Returns the existing pending batch
 * untouched when one is waiting, so a retry can never mint a second UUID for the same comments.
 */
export function freeze(session: WebQaSession, batchId: string, canBuild: boolean):
  { session: WebQaSession; batch: WebQaBatch } | { error: string } {
  if (session.pending) return { session, batch: session.pending.batch };
  const ready = session.drafts.filter(d => d.text.trim());
  if (!ready.length) return { error: "Write a comment before sending." };
  const buildAndDeploy = canBuild && session.buildAndDeploy;
  const notes = session.notes?.trim();
  const parsed = WebQaBatch.safeParse({
    batchId, comments: ready.map(comment), buildAndDeploy, makeFeatureFlag: buildAndDeploy && session.makeFeatureFlag,
    ...(notes ? { notes } : {}),
  });
  if (!parsed.success) return { error: "These comments cannot be sent: " + (parsed.error.issues[0]?.message ?? "invalid") };
  return {
    batch: parsed.data,
    session: {
      ...session,
      drafts: session.drafts.filter(d => !ready.includes(d)),
      notes: undefined,
      buildAndDeploy: false,
      makeFeatureFlag: false,
      pending: { batch: parsed.data, drafts: ready, state: "unconfirmed" },
    },
  };
}

export type SendOutcome = "saved" | "queued" | "build-retry" | "unconfirmed";

/** Apply the host's answer (a receipt, or `undefined` when submit threw) to the pending batch. */
export function settle(session: WebQaSession, receipt: unknown): { session: WebQaSession; outcome: SendOutcome } {
  const pending = session.pending;
  if (!pending) return { session, outcome: "unconfirmed" };
  const parsed = parseWebQaReceipt(receipt);
  if (!parsed.success || parsed.data.batchId !== pending.batch.batchId) {
    return { session: { ...session, pending: { ...pending, state: "unconfirmed" } }, outcome: "unconfirmed" };
  }
  const factory: WebQaReceipt["factory"] = parsed.data.factory;
  if (factory === "retry") return { session: { ...session, pending: { ...pending, state: "build-retry" } }, outcome: "build-retry" };
  return { session: { ...session, pending: null }, outcome: factory === "queued" ? "queued" : "saved" };
}

/** A first attempt explicitly rejected by the server may be corrected under a new batch ID. */
export function reopenPending(session: WebQaSession): WebQaSession {
  if (!session.pending || session.pending.state !== "rejected") return session;
  // `canPin` caps drafts plus pending together, so the merge never exceeds one batch.
  return { ...session, notes: session.pending.batch.notes, drafts: [...session.pending.drafts, ...session.drafts], pending: null };
}

/** Drop a build request that keeps failing; the comments themselves were already saved. */
export function skipBuild(session: WebQaSession): WebQaSession {
  if (!session.pending || session.pending.state !== "build-retry") return session;
  return { ...session, pending: null };
}

export function outcomeMessage(outcome: SendOutcome, count: number): string {
  const saved = `Saved ${count} comment${count === 1 ? "" : "s"}`;
  switch (outcome) {
    case "saved": return `${saved}.`;
    case "queued": return `${saved}; build and deploy queued.`;
    case "build-retry": return `${saved}, but the build request did not queue. Retry sends the same batch.`;
    case "unconfirmed": return "Send not confirmed. Comments kept; Retry sends the same batch without duplicating it.";
  }
}
