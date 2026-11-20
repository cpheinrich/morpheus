// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountWebQa, WebQaRejectedError, type WebQaBatch, type WebQaReceipt, type WebQaMountOptions } from "../src/qa/web/mount.js";

const pageClicks = vi.fn();
let unmount: (() => void) | null = null;

function page(): void {
  document.body.innerHTML = `<main>
    <a id=link href="#next">Next</a>
    <section data-qa-anchor="plan-card"><p id=card>Plan for Jane Doe</p><input id=name value="SECRET_VALUE"></section>
    <div data-qa-private><span id=private>Account 1234</span></div>
    <input id=password type=password>
  </main>`;
  document.body.addEventListener("click", pageClicks);
}

function mount(over: Partial<WebQaMountOptions> = {}) {
  const submit = vi.fn<(batch: WebQaBatch) => Promise<WebQaReceipt>>(async batch => ({ batchId: batch.batchId, factory: "not-requested" }));
  const onClose = vi.fn();
  unmount = mountWebQa({ project: "demo", accountKey: "user-1", canBuild: false, submit, onClose, ...over });
  return { submit: (over.submit as typeof submit | undefined) ?? submit, onClose };
}

const root = () => document.querySelector("morpheus-web-qa")?.shadowRoot ?? null;
const q = <T extends Element = HTMLElement>(sel: string) => root()!.querySelector(sel) as T;
const button = (label: string) => Array.from(root()!.querySelectorAll("button")).find(b => b.textContent === label)!;
const status = () => q(".status").textContent;
const click = (el: Element, init: MouseEventInit = {}) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, clientX: 256, clientY: 192, ...init }));
const type = (text: string) => { const t = q<HTMLTextAreaElement>("textarea[aria-label=Comment]"); t.value = text; t.dispatchEvent(new Event("input")); };
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, composed: true, ...init }));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const stored = () => JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(k => k.startsWith("morpheus-qa-web"))!)!);

beforeEach(() => { sessionStorage.clear(); pageClicks.mockClear(); page(); history.replaceState(null, "", "/billing"); });
afterEach(() => { unmount?.(); unmount = null; document.body.removeEventListener("click", pageClicks); });

describe("mountWebQa", () => {
  it("opens in Pin mode and pins instead of letting the page handle the click", () => {
    mount();
    expect(button("Pin").getAttribute("aria-pressed")).toBe("true");
    const link = document.getElementById("link")!;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 256, clientY: 192 });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(pageClicks).not.toHaveBeenCalled();
    expect(status()).toBe("Pin 1 placed; type a comment.");
    expect(stored().drafts[0]).toMatchObject({ path: "/billing", scope: "element", x: 0.25, y: 0.25, viewportWidth: 1024, viewportHeight: 768 });
  });

  it("leaves the page alone in Browse mode and after unmount", () => {
    mount();
    click(button("Browse"));
    pageClicks.mockClear(); // the panel's own clicks reach the page like any shadow host's
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.getElementById("link")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(pageClicks).toHaveBeenCalledTimes(1);
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.getElementById("card")!.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(false);

    click(button("Pin"));
    expect(document.documentElement.style.cursor).toBe("crosshair");
    unmount!(); unmount = null;
    expect(document.querySelector("morpheus-web-qa")).toBeNull();
    expect(document.documentElement.style.cursor).toBe("");
    const after = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.getElementById("link")!.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
    expect(pageClicks).toHaveBeenCalledTimes(3);
  });

  it("Escape on the page returns to Browse; Shift+right-click keeps the browser menu", () => {
    mount();
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, shiftKey: true });
    document.getElementById("card")!.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(false);
    key(document.body, "Escape");
    expect(button("Browse").getAttribute("aria-pressed")).toBe("true");
  });

  it("sends exactly the contract: pathname, point, viewport and anchor, never page text or values", async () => {
    const { submit } = mount();
    click(document.getElementById("card")!);
    type("  Price is cut off  ");
    q<HTMLSelectElement>("select").value = "view";
    q("select").dispatchEvent(new Event("change"));
    click(button("Send"));
    await flush();
    expect(submit).toHaveBeenCalledTimes(1);
    const batch = submit.mock.calls[0]![0];
    expect(batch).toEqual({
      batchId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      buildAndDeploy: false, makeFeatureFlag: false,
      comments: [{ text: "Price is cut off", path: "/billing", scope: "view", x: 0.25, y: 0.25, viewportWidth: 1024, viewportHeight: 768, scrollX: 0, scrollY: 0, anchor: "plan-card" }],
    });
    expect(JSON.stringify(batch)).not.toMatch(/Jane|SECRET_VALUE|Plan for|<|"id"/);
    expect(status()).toBe("Saved 1 comment.");
    expect(stored().drafts).toEqual([]);
    expect(stored().pending).toBeNull();
  });

  it("passes launcher clicks in Pin mode so the host can close the panel", () => {
    mount();
    const launcher = document.createElement("button");
    launcher.setAttribute("data-qa-chrome", "");
    const close = vi.fn();
    launcher.addEventListener("click", close);
    document.body.append(launcher);
    launcher.click();
    expect(close).toHaveBeenCalledTimes(1);
    expect(q("ol li").textContent).toBe("No comments yet.");
  });

  it("allows correcting a first explicit rejection and preserves an ambiguous pending batch", async () => {
    const submit = vi.fn(async (_batch: WebQaBatch): Promise<WebQaReceipt> => {
      throw new WebQaRejectedError("Batch is too long.");
    });
    mount({ submit });
    click(document.getElementById("card")!);
    type("Please move the navigation");
    click(button("Send"));
    await flush();
    expect(status()).toBe("Batch is too long.");
    expect(stored().pending.state).toBe("rejected");
    click(button("Edit again"));
    expect(stored().pending).toBeNull();
    expect(stored().drafts[0].text).toBe("Please move the navigation");
  });

  it("marks a rejected retry unconfirmed before sending, including across remount", async () => {
    const submit = vi.fn<(batch: WebQaBatch) => Promise<WebQaReceipt>>()
      .mockRejectedValueOnce(new WebQaRejectedError("Too long"))
      .mockImplementationOnce(() => new Promise(() => {}));
    mount({ submit });
    click(document.getElementById("card")!);
    type("Fix the tab order");
    click(button("Send"));
    await flush();
    expect(button("Edit again")).toBeDefined();
    click(button("Retry"));
    expect(stored().pending.state).toBe("unconfirmed");
    unmount!(); unmount = null;
    mount();
    expect(button("Edit again")).toBeUndefined();
    expect(submit.mock.calls[1]![0].batchId).toEqual(submit.mock.calls[0]![0].batchId);
  });

  it("keeps the current draft editable when storage cannot freeze its retry identity", () => {
    const real = window.sessionStorage;
    const own = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
    let quota = false;
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: {
      getItem: (key: string) => real.getItem(key),
      setItem: (key: string, value: string) => {
        if (quota) throw new DOMException("Storage full", "QuotaExceededError");
        real.setItem(key, value);
      },
    } });
    try {
      const { submit } = mount();
      click(document.getElementById("card")!);
      type("Spacing issue");
      quota = true;
      click(button("Send"));
      expect(submit).not.toHaveBeenCalled();
      expect(status()).toMatch(/Browser storage could not keep this batch safe to retry/);
      const snapshot = JSON.parse(real.getItem(Object.keys(real)[0]!)!);
      expect(snapshot.drafts[0].text).toBe("Spacing issue");
      expect(snapshot.pending).toBeNull();
      quota = false;
      type("Still editable");
      expect(q<HTMLTextAreaElement>("textarea[aria-label=Comment]").value).toBe("Still editable");
    } finally { Object.defineProperty(window, "sessionStorage", own); }
  });

  it("checks the composed target and private ancestors of an open shadow root", () => {
    mount();
    const parent = document.createElement("div");
    parent.setAttribute("data-qa-private", "");
    document.body.append(parent);
    const host = parent.appendChild(document.createElement("div"));
    host.setAttribute("data-qa-anchor", "public-component");
    const shadow = host.attachShadow({ mode: "open" });
    const input = shadow.appendChild(document.createElement("input"));
    input.type = "password";
    click(input);
    expect(status()).toContain("This area is private");
    parent.removeAttribute("data-qa-private");
    input.focus();
    key(input, "Enter");
    expect(status()).toContain("Pins cannot be placed on this field");
    expect(q("ol li").textContent).toBe("No comments yet.");
  });

  it("refuses pointer and keyboard pins inside a private shadow slot", () => {
    mount();
    const host = document.body.appendChild(document.createElement("div"));
    const trigger = host.appendChild(document.createElement("button"));
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "<div data-qa-private><slot></slot></div>";
    click(trigger);
    expect(status()).toContain("This area is private");
    trigger.focus();
    expect(key(trigger, "Enter")).toBe(false);
    expect(status()).toContain("This area is private");
    expect(q("ol li").textContent).toBe("No comments yet.");
  });

  it("does not delete a draft on Escape repeat or carry deletion to another pin", () => {
    mount();
    click(document.getElementById("card")!);
    type("First");
    key(q("textarea[aria-label=Comment]"), "Escape");
    key(button("Send"), "Escape", { repeat: true });
    expect(stored().drafts).toHaveLength(1);

    click(document.getElementById("link")!);
    type("Second");
    key(q("textarea[aria-label=Comment]"), "Escape");
    expect(stored().drafts.map((item: WebQaBatch["comments"][number]) => item.text)).toEqual(["First", "Second"]);
    key(button("Send"), "Escape");
    expect(stored().drafts.map((item: WebQaBatch["comments"][number]) => item.text)).toEqual(["First"]);
  });

  it("refuses pins on private areas and blocked fields", () => {
    mount();
    click(document.getElementById("private")!);
    expect(status()).toMatch(/private/);
    click(document.getElementById("password")!);
    expect(status()).toMatch(/cannot be placed on this field/);
    expect(root()!.querySelectorAll("ol li.none")).toHaveLength(1);
  });

  it("keeps a lost send pending and retries it with the same UUID and content", async () => {
    let fail = true;
    const submit = vi.fn(async (batch: WebQaBatch): Promise<WebQaReceipt> => {
      if (fail) throw new Error("network");
      return { batchId: batch.batchId, factory: "not-requested" };
    });
    mount({ submit });
    click(document.getElementById("card")!);
    type("First");
    click(button("Send"));
    await flush();
    expect(status()).toMatch(/^Send not confirmed/);
    expect(button("Retry").disabled).toBe(false);
    expect(button("Edit again")).toBeUndefined();
    expect(q(".pending-box").textContent).toMatch(/1 comment not confirmed/);

    // A newer draft does not join the pending batch.
    click(document.getElementById("link")!);
    type("Second");
    fail = false;
    click(button("Retry"));
    await flush();
    expect(submit.mock.calls[1]![0]).toEqual(submit.mock.calls[0]![0]);
    expect(submit.mock.calls[1]![0].comments.map(c => c.text)).toEqual(["First"]);
    expect(status()).toBe("Saved 1 comment.");
    expect(stored().drafts.map((d: { text: string }) => d.text)).toEqual(["Second"]);
  });

  it("survives a reload mid-request and retries the stored batch", async () => {
    const hang = vi.fn((_batch: WebQaBatch): Promise<WebQaReceipt> => new Promise(() => {}));
    mount({ submit: hang });
    click(document.getElementById("card")!);
    type("Before reload");
    const notes = q<HTMLTextAreaElement>("textarea[aria-label=Notes]");
    notes.value = "  Treat this as one change.  ";
    notes.dispatchEvent(new Event("input"));
    click(button("Sending…") ?? button("Send"));
    await flush();
    unmount!(); unmount = null;

    const { submit } = mount();
    expect(status()).toMatch(/^Send not confirmed/);
    expect(q<HTMLTextAreaElement>("textarea[aria-label=Notes]")).toMatchObject({ value: "Treat this as one change.", disabled: true });
    click(button("Retry"));
    await flush();
    expect(submit.mock.calls[0]![0]).toEqual(hang.mock.calls[0]![0]);
    expect(submit.mock.calls[0]![0].notes).toBe("Treat this as one change.");
  });

  it("shows build controls only when allowed, the flag only with build, and keeps a failed build request retryable", async () => {
    mount();
    expect(q("input[type=checkbox]").closest("div")!.hidden).toBe(true);
    unmount!(); unmount = null;

    const replies: WebQaReceipt["factory"][] = ["retry", "queued"];
    const submit = vi.fn(async (batch: WebQaBatch): Promise<WebQaReceipt> => ({ batchId: batch.batchId, factory: replies.shift()! }));
    mount({ canBuild: true, submit });
    const [build, flag] = Array.from(root()!.querySelectorAll<HTMLInputElement>("input[type=checkbox]"));
    expect([build!.checked, flag!.closest("label")!.hidden]).toEqual([false, true]);
    build!.checked = true; build!.dispatchEvent(new Event("change"));
    expect(flag!.closest("label")!.hidden).toBe(false);
    flag!.checked = true; flag!.dispatchEvent(new Event("change"));

    click(document.getElementById("card")!);
    type("Ship it");
    click(button("Send"));
    await flush();
    expect(status()).toMatch(/^Saved 1 comment, but the build request did not queue/);
    expect(q(".pending-box").textContent).toMatch(/Build and deploy behind a feature flag/);
    click(button("Retry"));
    await flush();
    expect(submit.mock.calls[1]![0]).toEqual(submit.mock.calls[0]![0]);
    expect(submit.mock.calls[0]![0]).toMatchObject({ buildAndDeploy: true, makeFeatureFlag: true });
    expect(status()).toBe("Saved 1 comment; build and deploy queued.");
    expect(build!.checked).toBe(false);

    build!.checked = false; build!.dispatchEvent(new Event("change"));
    expect([stored().buildAndDeploy, stored().makeFeatureFlag, flag!.closest("label")!.hidden]).toEqual([false, false, true]);
  });

  it("keeps drafts per account across remounts", () => {
    mount();
    click(document.getElementById("card")!);
    type("Mine");
    unmount!(); unmount = null;
    mount({ accountKey: "user-2" });
    expect(root()!.querySelector("ol li.none")).not.toBeNull();
    unmount!(); unmount = null;
    mount();
    expect(root()!.querySelector("ol .open")!.textContent).toMatch(/^Mine/);
  });

  it("Enter saves and clears the composer, Esc Esc deletes, and ⌘Enter sends", async () => {
    const { submit } = mount();
    click(document.getElementById("card")!);
    type("Keep");
    key(q("textarea[aria-label=Comment]"), "Enter");
    expect(q<HTMLTextAreaElement>("textarea[aria-label=Comment]").disabled).toBe(true);
    expect(status()).toBe("Saved. Send when ready.");

    click(document.getElementById("link")!);
    type("Drop");
    key(q("textarea[aria-label=Comment]"), "Escape");
    expect(status()).toBe("Press Esc again to delete pin 2.");
    key(button("Send"), "Escape");
    expect(stored().drafts.map((d: { text: string }) => d.text)).toEqual(["Keep"]);

    click(root()!.querySelector("ol .open")!);
    key(q("textarea[aria-label=Comment]"), "Enter", { metaKey: true });
    await flush();
    expect(submit.mock.calls[0]![0].comments.map(c => c.text)).toEqual(["Keep"]);
  });

  it("pins the focused element from the keyboard and adds a page comment without a pointer", () => {
    mount();
    const link = document.getElementById("link")!;
    link.focus();
    key(link, "Enter");
    expect(stored().drafts).toHaveLength(1);
    click(button("Comment on this page"));
    expect(stored().drafts[1]).toMatchObject({ scope: "page", x: 0.5, y: 0.5 });
  });

  it("stops at 20 comments per batch", () => {
    mount();
    for (let i = 0; i < 21; i++) click(document.getElementById("card")!);
    expect(stored().drafts).toHaveLength(20);
    expect(status()).toBe("At most 20 comments per batch; send these first.");
  });

  it("draws markers only on their own path", async () => {
    mount();
    click(document.getElementById("card")!);
    expect(root()!.querySelectorAll(".pin")).toHaveLength(1);
    expect(q(".pin").style.left).toBe("256px");
    history.pushState(null, "", "/other");
    await new Promise(resolve => setTimeout(resolve, 600));
    expect(root()!.querySelectorAll(".pin")).toHaveLength(0);
    expect(root()!.querySelectorAll("ol .open")).toHaveLength(1);
  });

  it("Close unmounts and tells the host", () => {
    const { onClose } = mount();
    click(q("button[aria-label='Close QA']"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector("morpheus-web-qa")).toBeNull();
    unmount!();
  });
});
