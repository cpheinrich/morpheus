// jsdom is an existing test dependency; this test uses only its browser runtime.
// @ts-expect-error jsdom does not ship declarations in this package set
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { pageHtml } from "../src/qa/overlay-page.js";
import { screenIdFromAxTree } from "../src/qa/screen-id.js";

describe("iOS QA pins", () => {
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
        Object.defineProperty(window, "fetch", { value: async (url: string, init: { body: string }) => {
          if (url === "/api/screen") return { ok: true, json: async () => ({ screenId: "mealReviewScreen" }) };
          posted = JSON.parse(init.body) as Record<string, unknown>;
          return { ok: true, json: async () => ({ id: "batch-1", pendingCount: 1 }) };
        } });
      },
    });
    try {
      const snapshot = (y: number) => ({
        screen: { width: 390, height: 844 },
        elements: [{ id: "mealReviewImage", path: "0.1.0", frame: { x: 0, y, width: 390, height: 100 } }],
        errors: [],
      });
      emitAx?.(snapshot(100));
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
});
