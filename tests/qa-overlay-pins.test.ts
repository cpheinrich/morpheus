// @ts-expect-error jsdom does not ship declarations in this package set
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { pageHtml } from "../src/qa/overlay-page.js";
import { QaScreenIdentity, qaAxSnapshotFromTree, screenIdFromAxTree } from "../src/qa/screen-id.js";

describe("iOS QA pins", () => {
  function overlay(axPath: string | null = "/api/ax") {
    let emitAx: ((snapshot: unknown) => void) | undefined;
    let pixels = "data:image/png;base64,QQ==";
    let posted: Record<string, unknown> | null = null;
    const calls: string[] = [];
    const dom = new JSDOM(pageHtml({
      previewUrl: "http://127.0.0.1:3427/", streamPath: "/proxy/stream.mjpeg", axPath, project: "evo",
    }), {
      url: "http://127.0.0.1:3683/", runScripts: "dangerously", pretendToBeVisual: true,
      beforeParse(window: Window & typeof globalThis) {
        Object.defineProperty(window.HTMLImageElement.prototype, "naturalWidth", { get: () => 390 });
        Object.defineProperty(window.HTMLImageElement.prototype, "naturalHeight", { get: () => 844 });
        window.HTMLCanvasElement.prototype.getContext = (() => ({ drawImage() {} })) as unknown as typeof window.HTMLCanvasElement.prototype.getContext;
        window.HTMLCanvasElement.prototype.toDataURL = () => pixels;
        window.HTMLElement.prototype.getBoundingClientRect = function () {
          return { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844, x: 0, y: 0, toJSON() {} };
        };
        class FakeEventSource {
          onmessage?: (event: { data: string }) => void;
          constructor() { emitAx = (snapshot) => this.onmessage?.({ data: JSON.stringify(snapshot) }); }
        }
        Object.defineProperty(window, "EventSource", { value: FakeEventSource });
        Object.defineProperty(window, "fetch", { value: async (url: string, init: { body: string }) => {
          calls.push(url);
          if (url !== "/api/batches") throw new Error("Unexpected request: " + url);
          posted = JSON.parse(init.body) as Record<string, unknown>;
          return { ok: true, json: async () => ({ id: "batch-1", pendingCount: 1 }) };
        } });
      },
    });
    const stage = dom.window.document.getElementById("stage")!;
    const editor = dom.window.document.querySelector<HTMLTextAreaElement>("#text")!;
    return {
      dom, stage, editor, calls,
      emit(snapshot: unknown) { emitAx?.(snapshot); },
      pixels(value: string) { pixels = value; },
      pin(x: number, y: number) {
        stage.dispatchEvent(new dom.window.MouseEvent("contextmenu", {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
        }));
      },
      comment(value: string) {
        editor.value = value;
        editor.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      },
      async send() {
        dom.window.document.querySelector<HTMLButtonElement>("#send")!.click();
        for (let i = 0; i < 20 && !posted; i++) await new Promise((resolve) => setTimeout(resolve, 0));
        return posted as Record<string, unknown> | null;
      },
    };
  }

  const snapshot = (screenId: string, y: number, id = "chart") => ({
    screen: { width: 390, height: 844 }, screenId, errors: [],
    elements: [{ id, path: "0.1", label: id, frame: { x: 0, y, width: 390, height: 100 } }],
  });

  it("saves two distinct click frames across scrolling and navigation, then sends both", async () => {
    const qa = overlay();
    try {
      qa.emit(snapshot("trendsScreen", 100));
      qa.pin(195, 150);
      qa.comment("First chart");
      qa.pixels("data:image/png;base64,Qg==");
      qa.emit(snapshot("trendsScreen", 40));
      expect(qa.dom.window.document.querySelector<HTMLElement>(".pin")?.style.top).toBe("90px");
      qa.emit(snapshot("trackScreen", 100, "other"));
      expect(qa.dom.window.document.querySelectorAll(".pin")).toHaveLength(0);
      qa.pin(195, 150);
      qa.comment("Second chart");
      expect(qa.dom.window.document.querySelectorAll(".pin")).toHaveLength(1);
      const batch = await qa.send();
      expect(qa.calls).toEqual(["/api/batches"]);
      expect(batch).not.toBeNull();
      expect((batch!.comments as Array<Record<string, unknown>>)).toMatchObject([
        { text: "First chart", screenId: "trendsScreen", frame: { dataUrl: "data:image/png;base64,QQ==" } },
        { text: "Second chart", screenId: "trackScreen", frame: { dataUrl: "data:image/png;base64,Qg==" } },
      ]);
      expect(qa.dom.window.document.getElementById("status")!.textContent).toContain("Queued batch-1");
    } finally { qa.dom.window.close(); }
  });

  it("uses the click frame even when accessibility is unavailable", async () => {
    const qa = overlay();
    try {
      qa.pin(195, 150);
      qa.comment("Still send this");
      expect((await qa.send())?.comments).toMatchObject([
        { text: "Still send this", frame: { dataUrl: "data:image/png;base64,QQ==" } },
      ]);
    } finally { qa.dom.window.close(); }
  });

  it("keeps an unnamed pin visible on its screen and hides it after navigation", () => {
    const qa = overlay();
    try {
      qa.emit(snapshot("trendsScreen", 100, "_TtUnnamed"));
      qa.pin(195, 150);
      expect(qa.dom.window.document.querySelectorAll(".pin")).toHaveLength(1);
      qa.emit(snapshot("trendsScreen", 90, "_TtUnnamed"));
      expect(qa.dom.window.document.querySelectorAll(".pin")).toHaveLength(1);
      qa.emit(snapshot("trackScreen", 100, "_TtUnnamed"));
      expect(qa.dom.window.document.querySelectorAll(".pin")).toHaveLength(0);
      qa.emit(snapshot("trendsScreen", 100, "_TtUnnamed"));
      expect(qa.dom.window.document.querySelectorAll(".pin")).toHaveLength(0);
    } finally { qa.dom.window.close(); }
  });

  it("does not create an unsendable pin before the image stream is ready", () => {
    const qa = overlay(null);
    try {
      Object.defineProperty(qa.dom.window.document.querySelector("#stream"), "naturalWidth", { get: () => 0 });
      qa.pin(195, 150);
      expect(qa.dom.window.document.querySelectorAll("aside li")).toHaveLength(0);
      expect(qa.dom.window.document.getElementById("status")!.textContent).toContain("Wait for the stream");
    } finally { qa.dom.window.close(); }
  });

  it("refuses to send a restored pin whose placement image was lost", async () => {
    const previewUrl = "http://127.0.0.1:3427/";
    let posted = false;
    const dom = new JSDOM(pageHtml({ previewUrl, streamPath: "/proxy/stream.mjpeg", axPath: null, project: "evo" }), {
      url: "http://127.0.0.1:3683/", runScripts: "dangerously", pretendToBeVisual: true,
      beforeParse(window: Window & typeof globalThis) {
        window.sessionStorage.setItem("morpheus-qa-comments:evo:" + previewUrl, JSON.stringify({
          pins: [{ id: "p1", n: 1, normX: 0.5, normY: 0.5, text: "Keep this frame",
            createdAt: new Date().toISOString(), frame: { width: 390, height: 844, capturedAt: new Date().toISOString() } }],
          nextN: 2,
        }));
        Object.defineProperty(window.HTMLImageElement.prototype, "naturalWidth", { get: () => 390 });
        Object.defineProperty(window.HTMLImageElement.prototype, "naturalHeight", { get: () => 844 });
        window.HTMLCanvasElement.prototype.getContext = (() => ({ drawImage() {} })) as unknown as typeof window.HTMLCanvasElement.prototype.getContext;
        window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,bGF0ZXI=";
        window.HTMLElement.prototype.getBoundingClientRect = function () {
          return { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844, x: 0, y: 0, toJSON() {} };
        };
        Object.defineProperty(window, "fetch", { value: async () => { posted = true; return { ok: true, json: async () => ({ id: "batch-1" }) }; } });
      },
    });
    try {
      dom.window.document.querySelector<HTMLButtonElement>("#send")!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(posted).toBe(false);
      expect(dom.window.document.getElementById("status")!.textContent).toContain("lost its placement image");
    } finally { dom.window.close(); }
  });

  it("takes the app's screen ID from the raw tree before any shared navigation landmark", () => {
    expect(screenIdFromAxTree([{
      frame: { x: 0, y: 0, width: 402, height: 874 },
      children: [
        { AXUniqueId: "mainNavigationVisualBounds", frame: { x: 0, y: 774, width: 402, height: 62 } },
        { AXUniqueId: "todayScreen", frame: { x: 0, y: 0, width: 402, height: 874 } },
      ],
    }])).toBe("todayScreen");
    expect(screenIdFromAxTree([{
      frame: { x: 0, y: 0, width: 402, height: 874 },
      children: [
        { AXUniqueId: "mealReviewImage", frame: { x: 0, y: -600, width: 402, height: 402 } },
        { AXUniqueId: "addRemainingPortionPhotoButton", frame: { x: 20, y: 500, width: 362, height: 50 } },
      ],
    }])).toMatch(/^ax:mealReviewImage:[a-f0-9]{12}$/);
  });

  it("distinguishes fallback screens with a shared first landmark and ignores scroll frames", () => {
    const tree = (id: string, y: number) => [{
      frame: { x: 0, y: 0, width: 402, height: 874 },
      children: [
        { AXUniqueId: "sharedHeading", frame: { x: 20, y, width: 360, height: 50 } },
        { AXUniqueId: id, frame: { x: 20, y: y + 60, width: 360, height: 50 } },
      ],
    }];
    expect(screenIdFromAxTree(tree("screenAContent", 100))).toBe(screenIdFromAxTree(tree("screenAContent", 40)));
    expect(screenIdFromAxTree(tree("screenAContent", 100))).not.toBe(screenIdFromAxTree(tree("screenBContent", 100)));
    const withLazyRow = tree("screenAContent", 40);
    withLazyRow[0]!.children!.push({ AXUniqueId: "lazyRow2", frame: { x: 20, y: 160, width: 360, height: 50 } });
    expect(screenIdFromAxTree(tree("screenAContent", 100))).toBe(screenIdFromAxTree(withLazyRow));
  });

  it("holds a fallback screen ID while a native drag recycles the second row", () => {
    const tree = (row: string) => [{
      frame: { x: 0, y: 0, width: 402, height: 874 },
      children: [
        { AXUniqueId: "sharedHeading", frame: { x: 0, y: 10, width: 300, height: 40 } },
        { AXUniqueId: row, frame: { x: 0, y: 100, width: 300, height: 60 } },
      ],
    }];
    const identity = new QaScreenIdentity();
    const first = identity.observe(qaAxSnapshotFromTree(tree("lazyRowA"))).screenId;
    identity.noteTouch("begin", 0.5, 0.8);
    identity.noteTouch("move", 0.5, 0.3);
    identity.noteTouch("end", 0.5, 0.3);
    expect(identity.observe(qaAxSnapshotFromTree(tree("lazyRowB"))).screenId).toBe(first);
    identity.noteTouch("begin", 0.5, 0.5);
    identity.noteTouch("end", 0.5, 0.5);
    expect(identity.observe(qaAxSnapshotFromTree(tree("otherScreenContent"))).screenId)
      .toBe(screenIdFromAxTree(tree("otherScreenContent")));
    expect(screenIdFromAxTree(tree("otherScreenContent"))).not.toBe(first);

    const named = new QaScreenIdentity();
    named.observe({ ...qaAxSnapshotFromTree(tree("lazyRowA")), screenId: "mealReviewScreen" });
    named.noteTouch("begin", 0.5, 0.8);
    named.noteTouch("move", 0.5, 0.3);
    named.noteTouch("end", 0.5, 0.3);
    expect(named.observe(qaAxSnapshotFromTree(tree("lazyRowB"))).screenId).toBe("mealReviewScreen");
  });

  it("emits screen identity and scrolling elements from one native tree", () => {
    const snapshot = qaAxSnapshotFromTree([{
      frame: { x: 0, y: 0, width: 402, height: 874 },
      children: [{
        AXUniqueId: "todayScreen",
        frame: { x: 0, y: 0, width: 402, height: 874 },
        children: [{
          AXUniqueId: "sharedHeading",
          AXValue: "30%",
          frame: { x: 10, y: 20, width: 100, height: 40 },
        }],
      }],
    }]);
    expect(snapshot.screenId).toBe("todayScreen");
    expect(snapshot.elements).toMatchObject([{
      id: "sharedHeading",
      path: "0.0.0",
      value: "30%",
      frame: { x: 10, y: 20, width: 100, height: 40 },
    }]);
  });
});
