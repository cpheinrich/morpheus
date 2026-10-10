// jsdom is an existing test dependency; this test uses only its browser runtime.
// @ts-expect-error jsdom does not ship declarations in this package set
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { pageHtml } from "../src/qa/overlay-page.js";
import { qaAxSnapshotFromTree, screenIdFromAxTree } from "../src/qa/screen-id.js";

describe("iOS QA pins", () => {
  it.each([
    { scenario: "distinct screen landmarks", axIdA: "screenAScreen", axIdB: "screenBScreen" },
    { scenario: "a shared screen landmark", axIdA: "sharedHeading", axIdB: "sharedHeading" },
  ])("hides a pin on navigation with $scenario", async ({ axIdA, axIdB }) => {
    let emitAx: ((snapshot: unknown) => void) | undefined;
    let frame = "data:image/png;base64,QQ==";
    let posted: Record<string, unknown> | null = null;
    const dom = new JSDOM(pageHtml({
      previewUrl: "http://127.0.0.1:3427/",
      streamPath: "/proxy/stream.mjpeg",
      axPath: "/proxy/ax",
      project: "evo",
    }), {
      url: "http://127.0.0.1:3683/",
      runScripts: "dangerously",
      pretendToBeVisual: true,
      beforeParse(window: Window & typeof globalThis) {
        Object.defineProperty(window.HTMLImageElement.prototype, "naturalWidth", { get: () => 390 });
        Object.defineProperty(window.HTMLImageElement.prototype, "naturalHeight", { get: () => 844 });
        window.HTMLCanvasElement.prototype.getContext = (() => ({ drawImage() {} })) as unknown as typeof window.HTMLCanvasElement.prototype.getContext;
        window.HTMLCanvasElement.prototype.toDataURL = () => frame;
        window.HTMLElement.prototype.getBoundingClientRect = function () {
          return { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844, x: 0, y: 0, toJSON() {} };
        };
        class FakeEventSource {
          onmessage?: (event: { data: string }) => void;
          constructor() { emitAx = (snapshot) => this.onmessage?.({ data: JSON.stringify(snapshot) }); }
        }
        Object.defineProperty(window, "EventSource", { value: FakeEventSource });
        Object.defineProperty(window, "fetch", { value: (url: string, init: { body: string }) => {
          if (url !== "/api/batches") throw new Error("Unexpected request");
          posted = JSON.parse(init.body) as Record<string, unknown>;
          return Promise.resolve({ ok: true, json: async () => ({ id: "batch-1", pendingCount: 1 }) });
        } });
      },
    });
    try {
      const snapshot = (id: string, screenId: string, value = "") => ({
        screen: { width: 390, height: 844 },
        screenId,
        elements: [{ id, path: "0.1", value, frame: { x: 10, y: 10, width: 50, height: 50 } }],
        errors: [],
      });
      emitAx?.(snapshot(axIdA, "screenAScreen", "20%"));
      dom.window.document.getElementById("stage")!.dispatchEvent(new dom.window.MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, clientX: 195, clientY: 700,
      }));
      expect(dom.window.document.querySelector(".pin")).not.toBeNull();
      const editor = dom.window.document.querySelector<HTMLTextAreaElement>("#text")!;
      editor.value = "Screen A only";
      frame = "data:image/png;base64,UHJvZ3Jlc3M=";
      emitAx?.(snapshot(axIdA, "screenAScreen", "30%"));
      expect(dom.window.document.querySelector(".pin")).not.toBeNull();
      emitAx?.({ screen: { width: 1, height: 1 }, screenId: null, elements: [], errors: ["Accessibility unavailable"] });
      expect(dom.window.document.querySelector(".pin")).toBeNull();
      emitAx?.(snapshot(axIdA, "screenAScreen", "30%"));
      expect(dom.window.document.querySelector(".pin")).not.toBeNull();
      frame = "data:image/png;base64,Qg==";
      emitAx?.(snapshot(axIdB, "screenBScreen"));
      expect(dom.window.document.querySelector(".pin")).toBeNull();
      editor.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      dom.window.document.querySelector<HTMLButtonElement>("#send")!.click();
      for (let i = 0; i < 20 && !posted; i++) await new Promise((resolve) => setTimeout(resolve, 0));
      expect(posted, dom.window.document.getElementById("status")!.textContent || "no status").not.toBeNull();
      const comment = (posted!.comments as Array<Record<string, unknown>>)[0]!;
      expect(comment.screenId).toBe("screenAScreen");
      expect(comment.frame).toMatchObject({ dataUrl: "data:image/png;base64,QQ==" });
    } finally {
      dom.window.close();
    }
  });

  it("opens the editor immediately and tracks scrolling from each native snapshot", () => {
    let emitAx: ((snapshot: unknown) => void) | undefined;
    const dom = new JSDOM(pageHtml({
      previewUrl: "http://127.0.0.1:3427/",
      streamPath: "/proxy/stream.mjpeg",
      axPath: "/proxy/ax",
      project: "evo",
    }), {
      url: "http://127.0.0.1:3683/",
      runScripts: "dangerously",
      beforeParse(window: Window & typeof globalThis) {
        Object.defineProperty(window.HTMLImageElement.prototype, "naturalWidth", { get: () => 390 });
        Object.defineProperty(window.HTMLImageElement.prototype, "naturalHeight", { get: () => 844 });
        window.HTMLCanvasElement.prototype.getContext = (() => ({ drawImage() {} })) as unknown as typeof window.HTMLCanvasElement.prototype.getContext;
        window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,Zmlyc3Q=";
        window.HTMLElement.prototype.getBoundingClientRect = function () {
          return { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844, x: 0, y: 0, toJSON() {} };
        };
        class FakeEventSource {
          onmessage?: (event: { data: string }) => void;
          constructor() { emitAx = (snapshot) => this.onmessage?.({ data: JSON.stringify(snapshot) }); }
        }
        Object.defineProperty(window, "EventSource", { value: FakeEventSource });
        Object.defineProperty(window, "fetch", { value: () => { throw new Error("Unexpected request"); } });
      },
    });
    try {
      const snapshot = (y: number) => ({
        screen: { width: 390, height: 844 },
        screenId: "mealReviewScreen",
        elements: [{ id: "mealReviewImage", path: "0.1.0", frame: { x: 0, y, width: 390, height: 100 } }],
        errors: [],
      });
      emitAx?.(snapshot(100));
      dom.window.document.getElementById("stage")!.dispatchEvent(new dom.window.MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, clientX: 195, clientY: 150,
      }));
      expect(dom.window.document.querySelector<HTMLElement>(".pin")?.style.top).toBe("150px");
      expect(dom.window.document.activeElement).toBe(dom.window.document.getElementById("text"));
      emitAx?.(snapshot(40));
      expect(dom.window.document.querySelector<HTMLElement>(".pin")?.style.top).toBe("90px");
    } finally {
      dom.window.close();
    }
  });

  it("refuses to send a restored pin whose placement image was lost", async () => {
    let posted = false;
    const previewUrl = "http://127.0.0.1:3427/";
    const dom = new JSDOM(pageHtml({ previewUrl, streamPath: "/proxy/stream.mjpeg", axPath: null, project: "evo" }), {
      url: "http://127.0.0.1:3683/",
      runScripts: "dangerously",
      beforeParse(window: Window & typeof globalThis) {
        window.sessionStorage.setItem("morpheus-qa-comments:evo:" + previewUrl, JSON.stringify({
          pins: [{ id: "p1", n: 1, normX: 0.5, normY: 0.5, text: "Keep this exact frame", createdAt: new Date().toISOString(), screenId: "todayScreen", frame: { width: 390, height: 844, capturedAt: new Date().toISOString() } }],
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
      expect(dom.window.document.querySelector<HTMLButtonElement>("#send")!.disabled).toBe(false);
    } finally {
      dom.window.close();
    }
  });

  it("moves a marker with native scrolling while sending its placement frame, coordinates, and screen ID", async () => {
    let emitAx: ((snapshot: unknown) => void) | undefined;
    let frame = "data:image/png;base64,Zmlyc3Q=";
    let posted: Record<string, unknown> | null = null;
    const dom = new JSDOM(pageHtml({
      previewUrl: "http://127.0.0.1:3427/",
      streamPath: "/proxy/stream.mjpeg",
      axPath: "/proxy/ax",
      project: "evo",
    }), {
      url: "http://127.0.0.1:3683/",
      runScripts: "dangerously",
      pretendToBeVisual: true,
      beforeParse(window: Window & typeof globalThis) {
        Object.defineProperty(window.HTMLImageElement.prototype, "naturalWidth", { get: () => 390 });
        Object.defineProperty(window.HTMLImageElement.prototype, "naturalHeight", { get: () => 844 });
        window.HTMLCanvasElement.prototype.getContext = (() => ({ drawImage() {} })) as unknown as typeof window.HTMLCanvasElement.prototype.getContext;
        window.HTMLCanvasElement.prototype.toDataURL = () => frame;
        window.HTMLElement.prototype.getBoundingClientRect = function () {
          return { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844, x: 0, y: 0, toJSON() {} };
        };
        class FakeEventSource {
          onmessage?: (event: { data: string }) => void;
          constructor() { emitAx = (snapshot) => this.onmessage?.({ data: JSON.stringify(snapshot) }); }
        }
        Object.defineProperty(window, "EventSource", { value: FakeEventSource });
        Object.defineProperty(window, "fetch", { value: async (_url: string, init: { body: string }) => {
          posted = JSON.parse(init.body) as Record<string, unknown>;
          return { ok: true, json: async () => ({ id: "batch-1", pendingCount: 1 }) };
        } });
      },
    });
    try {
      const snapshot = (y: number) => ({
        screen: { width: 390, height: 844 },
        screenId: "mealReviewScreen",
        elements: [{ id: "mealReviewImage", path: "0.1.0", frame: { x: 0, y, width: 390, height: 100 } }],
        errors: [],
      });
      emitAx?.(snapshot(100));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const stage = dom.window.document.getElementById("stage")!;
      stage.dispatchEvent(new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 195, clientY: 150 }));
      for (let i = 0; i < 20 && !dom.window.document.querySelector(".pin"); i++) await new Promise((resolve) => setTimeout(resolve, 0));
      expect(dom.window.document.querySelector<HTMLElement>(".pin")?.style.top).toBe("150px");

      frame = "data:image/png;base64,c2Vjb25k";
      emitAx?.(snapshot(40));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(dom.window.document.querySelector<HTMLElement>(".pin")?.style.top).toBe("90px");
      emitAx?.(snapshot(-200));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(dom.window.document.querySelector(".pin")).toBeNull();

      const editor = dom.window.document.querySelector<HTMLTextAreaElement>("#text")!;
      editor.value = "Scrolled content is clipped";
      editor.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      dom.window.document.querySelector<HTMLButtonElement>("#send")!.click();
      for (let i = 0; i < 20 && !posted; i++) await new Promise((resolve) => setTimeout(resolve, 0));
      expect(posted).not.toBeNull();
      const comment = (posted!.comments as Array<Record<string, unknown>>)[0]!;
      expect(comment.screenId).toBe("mealReviewScreen");
      expect(comment.anchor).toEqual({ normX: 0.5, normY: 150 / 844 });
      expect(comment.frame).toMatchObject({ dataUrl: "data:image/png;base64,Zmlyc3Q=", width: 390, height: 844 });
    } finally {
      dom.window.close();
    }
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
    }])).toBe("ax:mealReviewImage");
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
