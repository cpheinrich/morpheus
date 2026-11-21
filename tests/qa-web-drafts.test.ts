// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  blockedReason, canPin, emptySession, freeze, loadSession, markerPoint, outcomeMessage, pinAt,
  reopenPending, saveSession, sessionKey, settle, skipBuild, type WebQaDraft, type WebQaSession,
} from "../src/qa/web/drafts.js";

const ID = "6f1c1b2e-6a3b-4c1d-9e2f-0a1b2c3d4e5f";
const win = (path = "/a", scrollX = 0, scrollY = 0) => ({ innerWidth: 1000, innerHeight: 500, scrollX, scrollY, location: { pathname: path } });
const draft = (over: Partial<WebQaDraft> = {}): WebQaDraft => ({
  id: "d1", text: "Fix", path: "/a", scope: "element", x: 0.1, y: 0.2, viewportWidth: 1000, viewportHeight: 500, pageX: 100, pageY: 100, ...over,
});
const withDrafts = (...drafts: WebQaDraft[]): WebQaSession => ({ ...emptySession(), drafts });

afterEach(() => { document.body.replaceChildren(); });

describe("pinAt", () => {
  it("records only pathname, normalized point, viewport and an explicit anchor", () => {
    document.body.innerHTML = `<section data-qa-anchor="plan-card"><p>Card for Jane Doe <input value="SECRET_VALUE"></p></section>`;
    const p = document.querySelector("p")!;
    const result = pinAt(win("/billing", 0, 300), p, 250, 125, "id1");
    expect(result).toEqual({ draft: {
      id: "id1", text: "", path: "/billing", scope: "element", x: 0.25, y: 0.25, viewportWidth: 1000, viewportHeight: 500,
      anchor: "plan-card", anchorX: 0.5, anchorY: 0.5, pageX: 250, pageY: 425, scrollX: 0, scrollY: 300,
    } });
    expect(JSON.stringify(result)).not.toMatch(/Jane|SECRET_VALUE|<p>/);
  });

  it("clamps the point to the viewport and rounds to four places", () => {
    const result = pinAt(win(), document.body, 1500, 1 / 3, "id");
    expect("draft" in result && [result.draft.x, result.draft.y]).toEqual([1, 0.0007]);
  });

  it("ignores an anchor that is not a plain token", () => {
    document.body.innerHTML = `<div data-qa-anchor="a b"><span>x</span></div>`;
    const result = pinAt(win(), document.querySelector("span")!, 1, 1, "id");
    expect("draft" in result && result.draft.anchor).toBeUndefined();
  });

  it("refuses a page whose pathname cannot be recorded", () => {
    expect(pinAt(win("/a%5Cb"), document.body, 1, 1, "id")).toEqual({ error: "This page's address cannot be recorded." });
  });
});

describe("blockedReason", () => {
  it.each([
    [`<div data-qa-private><span id=t>x</span></div>`, "private"],
    [`<input id=t type=password>`, "field"],
    [`<input id=t type=FILE>`, "field"],
    [`<input id=t type=hidden>`, "field"],
    [`<input id=t autocomplete="section-pay cc-number">`, "field"],
    [`<input id=t autocomplete="one-time-code">`, "field"],
    [`<textarea id=t autocomplete="new-password"></textarea>`, "field"],
    [`<input id=t type=text autocomplete=name>`, null],
    [`<button id=t>Save</button>`, null],
  ])("%s → %s", (html, kind) => {
    document.body.innerHTML = html;
    const reason = blockedReason(document.getElementById("t")!);
    if (kind === null) expect(reason).toBeNull();
    else expect(reason).toMatch(kind === "private" ? /private/ : /cannot be placed on this field/);
  });
});

describe("markerPoint", () => {
  it("follows page scroll and hides on another path or off screen", () => {
    expect(markerPoint(draft(), win("/a", 0, 40), document)).toEqual({ x: 100, y: 60 });
    expect(markerPoint(draft(), win("/b"), document)).toBeNull();
    expect(markerPoint(draft(), win("/a", 0, 101), document)).toBeNull();
    expect(markerPoint(draft({ pageY: 500 }), win("/a"), document)).toEqual({ x: 100, y: 500 });
    expect(markerPoint(draft({ pageY: 501 }), win("/a"), document)).toBeNull();
  });

  it("follows a visible anchor element", () => {
    document.body.innerHTML = `<div data-qa-anchor="card"></div>`;
    const el = document.querySelector("div")!;
    el.getBoundingClientRect = () => ({ left: 200, top: 50, width: 100, height: 40 }) as DOMRect;
    expect(markerPoint(draft({ anchor: "card", anchorX: 0.25, anchorY: 0.5 }), win(), document)).toEqual({ x: 225, y: 70 });
  });
});

describe("storage", () => {
  it("keys drafts by project, account and origin", () => {
    expect(sessionKey("p", "u:1", "https://site.test")).toBe("morpheus-qa-web:v1:p:u%3A1:https%3A%2F%2Fsite.test");
    expect(sessionKey("p", "u2", "o")).not.toBe(sessionKey("p", "u1", "o"));
  });

  it("round-trips and discards stored values that are not a session", () => {
    const s = withDrafts(draft());
    saveSession(sessionStorage, "k", s);
    expect(loadSession(sessionStorage, "k")).toEqual(s);
    sessionStorage.setItem("k", JSON.stringify({ version: 1, drafts: [draft({ path: "/a?q=1" })], buildAndDeploy: false, makeFeatureFlag: false, pending: null }));
    expect(loadSession(sessionStorage, "k")).toEqual(emptySession());
    sessionStorage.setItem("k", "{");
    expect(loadSession(sessionStorage, "k")).toEqual(emptySession());
  });

  it("reports a refused write instead of throwing", () => {
    expect(saveSession({ setItem: () => { throw new Error("quota"); } }, "k", emptySession())).toBe(false);
    expect(saveSession(null, "k", emptySession())).toBe(false);
  });
});

describe("freeze and settle", () => {
  it("persists one copy of each pending attachment and restores it for retry or reopening", () => {
    const evidence = {
      schemaVersion: 1, capturedAt: "2026-11-21T08:00:00.000Z", input: "page",
      browser: { family: "Safari", versionSource: "unavailable" }, os: "macOS", theme: "light",
      status: { kind: "unavailable", reason: "snapshot-limit" },
    } as const;
    const frozen = freeze(withDrafts(draft({ evidence })), ID, false);
    if ("error" in frozen) throw new Error(frozen.error);
    let stored = "";
    const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
    expect(saveSession(storage, "draft", frozen.session)).toBe(true);
    expect(stored.match(/"evidence":/g)).toEqual(['"evidence":']);
    const reloaded = loadSession(storage, "draft");
    expect(freeze(reloaded, "other", false)).toEqual({ session: reloaded, batch: frozen.batch });
    const rejected = { ...reloaded, pending: { ...reloaded.pending!, state: "rejected" as const } };
    expect(reopenPending(rejected).drafts[0]?.evidence).toEqual(evidence);
  });

  it("freezes only drafts with text and leaves the rest editable", () => {
    const empty = draft({ id: "d2", text: "  " });
    const frozen = freeze(withDrafts(draft({ text: " Fix " }), empty), ID, false);
    if ("error" in frozen) throw new Error(frozen.error);
    expect(frozen.batch).toEqual({ batchId: ID, buildAndDeploy: false, makeFeatureFlag: false, comments: [
      { text: "Fix", path: "/a", scope: "element", x: 0.1, y: 0.2, viewportWidth: 1000, viewportHeight: 500 },
    ] });
    expect(frozen.session.drafts).toEqual([empty]);
    expect(frozen.session.pending?.state).toBe("unconfirmed");
  });

  it("reuses the pending batch instead of minting a new UUID", () => {
    const first = freeze(withDrafts(draft()), ID, false);
    if ("error" in first) throw new Error(first.error);
    const again = freeze({ ...first.session, drafts: [draft({ id: "new", text: "later" })] }, "11111111-1111-4111-8111-111111111111", false);
    if ("error" in again) throw new Error(again.error);
    expect(again.batch).toBe(first.batch);
  });

  it("sends build options only when the host allows building, and a flag only with build", () => {
    const s = { ...withDrafts(draft()), buildAndDeploy: true, makeFeatureFlag: true };
    const allowed = freeze(s, ID, true), denied = freeze(s, ID, false);
    expect("batch" in allowed && [allowed.batch.buildAndDeploy, allowed.batch.makeFeatureFlag]).toEqual([true, true]);
    expect("batch" in denied && [denied.batch.buildAndDeploy, denied.batch.makeFeatureFlag]).toEqual([false, false]);
    const noBuild = freeze({ ...s, buildAndDeploy: false }, ID, true);
    expect("batch" in noBuild && noBuild.batch.makeFeatureFlag).toBe(false);
  });

  it("refuses an empty send", () => {
    expect(freeze(withDrafts(draft({ text: "" })), ID, false)).toEqual({ error: "Write a comment before sending." });
  });

  it("maps each receipt to its outcome and keeps the batch only when a retry is needed", () => {
    const frozen = freeze(withDrafts(draft()), ID, true);
    if ("error" in frozen) throw new Error(frozen.error);
    const s = frozen.session;
    expect(settle(s, { batchId: ID, factory: "not-requested" })).toEqual({ session: { ...s, pending: null }, outcome: "saved" });
    expect(settle(s, { batchId: ID, factory: "queued" }).outcome).toBe("queued");
    const retry = settle(s, { batchId: ID, factory: "retry" });
    expect([retry.outcome, retry.session.pending?.state, retry.session.pending?.batch]).toEqual(["build-retry", "build-retry", frozen.batch]);
    for (const bad of [undefined, { batchId: "11111111-1111-4111-8111-111111111111", factory: "queued" }, { ok: true }]) {
      const r = settle(s, bad);
      expect([r.outcome, r.session.pending?.batch]).toEqual(["unconfirmed", frozen.batch]);
    }
  });

  it("restores the original notes when the submitter reopens a rejected batch", () => {
    const frozen = freeze({ ...withDrafts(draft()), notes: "  Shared guidance  " }, ID, true);
    if ("error" in frozen) throw new Error(frozen.error);
    const rejected = { ...frozen.session, pending: { ...frozen.session.pending!, state: "rejected" as const } };
    expect(reopenPending(rejected).notes).toBe("Shared guidance");
  });

  it("only edits a rejected batch, or drops a failing build request", () => {
    const frozen = freeze(withDrafts(draft()), ID, true);
    if ("error" in frozen) throw new Error(frozen.error);
    expect(reopenPending(frozen.session)).toBe(frozen.session);
    const rejected = { ...frozen.session, pending: { ...frozen.session.pending!, state: "rejected" as const } };
    expect(reopenPending(rejected)).toEqual({ ...frozen.session, drafts: [draft()], pending: null });
    expect(skipBuild(frozen.session)).toBe(frozen.session);
    const retry = settle(frozen.session, { batchId: ID, factory: "retry" }).session;
    expect(reopenPending(retry)).toBe(retry);
    expect(skipBuild(retry).pending).toBeNull();
  });

  it("caps drafts plus the pending batch at 20 together", () => {
    const drafts = Array.from({ length: 19 }, (_, i) => draft({ id: `d${i}` }));
    expect(canPin(withDrafts(...drafts))).toBe(true);
    expect(canPin(withDrafts(...drafts, draft({ id: "last" })))).toBe(false);
    const frozen = freeze(withDrafts(...drafts.slice(0, 10)), ID, false);
    if ("error" in frozen) throw new Error(frozen.error);
    expect(canPin({ ...frozen.session, drafts: drafts.slice(0, 9) })).toBe(true);
    expect(canPin({ ...frozen.session, drafts: drafts.slice(0, 10) })).toBe(false);
  });

  it("words each outcome distinctly", () => {
    expect(outcomeMessage("saved", 1)).toBe("Saved 1 comment.");
    expect(outcomeMessage("queued", 2)).toBe("Saved 2 comments; build and deploy queued.");
    expect(outcomeMessage("build-retry", 2)).toMatch(/^Saved 2 comments, but the build request did not queue/);
    expect(outcomeMessage("unconfirmed", 2)).toMatch(/^Send not confirmed/);
  });
});
