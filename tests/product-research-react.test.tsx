// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseAppeekySnapshot, parseAppResearchStudy } from "../src/product-research/index.js";
import { AppStoreSignals, ProductResearchViewer } from "../src/product-research/react.js";
import { asset, FILES, sha, syntheticStudy } from "./fixtures/product-research-study.js";

vi.mock("../src/product-research/navigation-graph.js", async (loadOriginal) => {
  const { default: Graph } = await loadOriginal<typeof import("../src/product-research/navigation-graph.js")>();
  return { default: (props: Parameters<typeof Graph>[0]) => {
    if (props.app.slug === "unavailable-fixture") throw new Error("Graph fixture cannot render");
    return <Graph {...props} />;
  } };
});

const study = parseAppResearchStudy(syntheticStudy());
let created: string[];
let revoked: string[];

beforeEach(() => {
  window.history.replaceState(null, "", "/hq/research");
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  created = [];
  revoked = [];
  let next = 0;
  // jsdom has no object URLs; record their lifecycle instead.
  URL.createObjectURL = vi.fn(() => { const url = `blob:test/${next++}`; created.push(url); return url; });
  URL.revokeObjectURL = vi.fn((url: string) => { revoked.push(url); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

// jsdom's Blob has no arrayBuffer(); browsers and Node do, so serve Node blobs.
const blob = (text: string) => new NodeBlob([text]) as unknown as Blob;
function reader(overrides: Record<string, string> = {}) {
  return vi.fn(async (path: string) => blob(overrides[path] ?? FILES[path] ?? ""));
}

function scopedStudy() {
  const raw = syntheticStudy();
  for (const [id, title] of [["account", "Account"], ["profile", "Profile"], ["camera", "Camera"], ["library", "Library"]] as const) {
    raw.app.screens.push({ id, title, state: "", description: "", elements: [], screenshots: null });
  }
  const transition = raw.app.transitions[0]!;
  raw.app.transitions.push(
    { ...transition, id: "child", from: "settings", to: "account", action: "Open account", status: "source-documented" },
    { ...transition, id: "return", from: "settings", to: "home", action: "Return home", status: "observed" },
    { ...transition, id: "leaf", from: "account", to: "profile", action: "View profile" },
    { ...transition, id: "foreign", from: "home", to: "camera", action: "Open camera" },
    { ...transition, id: "untested", from: "home", to: "library", action: "Open library", status: "untested" },
  );
  const parsed = parseAppResearchStudy(raw);
  return { ...parsed, app: { ...parsed.app, flows: [
    { id: "browse", title: "Browse", entryScreenId: "home", screenIds: ["home", "settings", "library"] },
    { id: "manage", title: "Manage account", entryScreenId: "account", parentFlowId: "browse", screenIds: ["account", "profile"] },
    { id: "capture", title: "Capture", entryScreenId: "camera", screenIds: ["camera"] },
  ] } };
}

describe("ProductResearchViewer", () => {
  it("opens on the entry screen and fetches only its verified screenshot", async () => {
    const readAsset = reader();
    render(<ProductResearchViewer study={study} readAsset={readAsset} />);
    expect(screen.getByRole("heading", { level: 2, name: "Example App" })).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "Screens" })).getByRole("button", { name: /Home/ })
      .getAttribute("aria-current")).toBe("true");
    const image = await screen.findByRole("img", { name: "Home screenshot" });
    expect(image.getAttribute("src")).toBe("blob:test/0");
    expect(readAsset.mock.calls).toEqual([["screens/home.png"]]);
  });

  it("maps recorded navigation and shares selection with the list, detail and history", async () => {
    const raw = syntheticStudy();
    raw.app.screens.push({ id: "offline", title: "Offline", state: "offline", description: "", elements: [], screenshots: null });
    const verified = raw.app.transitions[0]!;
    raw.app.transitions.push(
      { ...verified, id: "back", from: "settings", to: "home", action: "Go back", status: "observed" },
      { ...verified, id: "unverified", to: "offline", action: "Lose network", status: "untested" },
      { ...verified, id: "documented", to: "offline", action: "Lose network", status: "source-documented" },
    );
    const readAsset = reader();
    const user = userEvent.setup();
    render(<ProductResearchViewer study={parseAppResearchStudy(raw)} readAsset={readAsset}
      screenMetrics={{ settings: { eventCount: 0, replayCount: 2 } }} />);
    const graph = within(screen.getByRole("region", { name: "Navigation graph" }));
    const list = within(screen.getByRole("navigation", { name: "Screens" }));
    const home = await graph.findByRole("button", { name: /Home Entry/ });
    const settings = graph.getByRole("button", { name: /Settings protected Events: 0 · Replays: 2/ });
    const offline = graph.getByRole("button", { name: /Offline offline/ });
    expect(home.getAttribute("aria-current")).toBe("true");
    expect(graph.getByRole("group", { name: "Navigation canvas" }).getAttribute("aria-description"))
      .toBe("Zoom with Cmd / Ctrl + scroll");
    expect(graph.queryByRole("group", { name: "Top-level flows" })).toBeNull();
    expect(graph.getAllByRole("img").filter((edge) => edge.getAttribute("aria-roledescription") === "edge")
      .map((edge) => edge.getAttribute("aria-label"))).toEqual([
      "Home → Settings: Tap Settings", "Settings → Home: Go back",
    ]);
    expect(readAsset.mock.calls).toEqual([["screens/home.png"]]);

    await user.type(list.getByRole("searchbox"), "secure");
    expect(list.queryByRole("button", { name: /Offline/ })).toBeNull();
    offline.focus();
    await user.keyboard("{Enter}");
    expect(window.location.hash).toBe("#screen=offline");
    expect(screen.getByRole("region", { name: "Screen: Offline" }).tagName).toBe("SECTION");
    expect(list.getByRole("button", { name: /Offline/ }).getAttribute("aria-current")).toBe("true");

    await user.click(settings);
    expect(window.location.hash).toBe("#screen=settings");
    expect(list.getByRole("button", { name: /Settings/ }).getAttribute("aria-current")).toBe("true");
    await user.click(list.getByRole("button", { name: /Offline/ }));
    expect(offline.getAttribute("aria-current")).toBe("true");
    window.history.back();
    await waitFor(() => expect(settings.getAttribute("aria-current")).toBe("true"));
    expect(window.location.hash).toBe("#screen=settings");
    expect(readAsset.mock.calls).toEqual([["screens/home.png"]]);
  });

  it("opens roots alone and reveals only immediate in-scope edges, without re-expanding a cycle", async () => {
    const user = userEvent.setup();
    render(<ProductResearchViewer study={scopedStudy()} readAsset={reader()} />);
    const graph = within(screen.getByRole("region", { name: "Navigation graph" }));
    const picker = within(await graph.findByRole("group", { name: "Top-level flows" }));
    const canvas = within(graph.getByRole("group", { name: "Navigation canvas" }));
    const nodes = () => canvas.getAllByRole("button").filter((button) => button.classList.contains("app-research-graph-node"))
      .map((button) => button.querySelector("strong")?.textContent);
    expect(picker.getAllByRole("button").map((button) => button.textContent)).toEqual(["Browse", "Capture"]);
    expect(picker.getByRole("button", { name: "Browse" }).getAttribute("aria-pressed")).toBe("true");
    expect(nodes()).toEqual(["Home"]);

    const home = canvas.getByRole("button", { name: /Home Entry/ });
    home.focus();
    await user.keyboard("[Space]");
    expect(home.getAttribute("aria-expanded")).toBe("true");
    expect(nodes()).toEqual(["Home", "Settings"]);
    expect(canvas.getByRole("img", { name: "Home → Settings: Tap Settings" }).querySelector(".app-research-source-edge")).toBeNull();
    expect(window.location.hash).toBe("");

    await user.click(canvas.getByRole("button", { name: /Settings protected/ }));
    expect(nodes()).toEqual(["Home", "Settings", "Account"]);
    const documented = canvas.getByRole("img", { name: "Settings → Account: Open account (source-documented)" });
    expect(documented.querySelector("path")?.classList.contains("app-research-source-edge")).toBe(true);
    expect(graph.getByText("Documented in release source").tagName).toBe("SPAN");
    await user.click(home);
    expect(nodes()).toEqual(["Home", "Settings", "Account"]);

    await user.click(picker.getByRole("button", { name: "Capture" }));
    expect(nodes()).toEqual(["Camera"]);
    expect(picker.getByRole("button", { name: "Capture" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(graph.getByRole("button", { name: "Back in graph" }));
    expect(nodes()).toEqual(["Home", "Settings", "Account"]);
    expect(canvas.getByRole("button", { name: /Home Entry/ }).getAttribute("aria-current")).toBe("true");
  });

  it("enters child roots by keyboard and restores prior graph and detail selection", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "#screen=home&control=settings-button");
    render(<ProductResearchViewer study={scopedStudy()} readAsset={reader()} />);
    const graph = within(screen.getByRole("region", { name: "Navigation graph" }));
    const canvas = within(await graph.findByRole("group", { name: "Navigation canvas" }));
    expect(canvas.getByRole("button", { name: /Home Entry/ }).closest(".app-research-graph")?.getAttribute("aria-description"))
      .toBe("Zoom with Cmd / Ctrl + scroll");
    await user.click(canvas.getByRole("button", { name: /Home Entry/ }));
    await user.click(canvas.getByRole("button", { name: /Settings protected/ }));
    const child = canvas.getByRole("button", { name: "Account Subflow · Manage account" });
    child.focus();
    await user.keyboard("{Enter}");
    expect(canvas.queryByRole("button", { name: /Home Entry/ })).toBeNull();
    expect(canvas.queryByRole("button", { name: /Settings protected/ })).toBeNull();
    expect(canvas.queryByRole("button", { name: "Profile" })).toBeNull();
    expect(window.location.hash).toBe("#screen=account");

    const root = canvas.getByRole("button", { name: "Account Entry" });
    expect(document.activeElement).toBe(root);
    await user.click(root);
    const profile = canvas.getByRole("button", { name: "Profile" });
    profile.focus();
    await user.keyboard("[Space]");
    expect(profile.getAttribute("aria-current")).toBe("true");
    expect(window.location.hash).toBe("#screen=profile");
    expect(screen.getByRole("region", { name: "Screen: Profile" }).tagName).toBe("SECTION");

    const search = screen.getByRole("searchbox");
    await user.type(search, "secure");
    await user.keyboard("{Escape}");
    expect(profile.getAttribute("aria-current")).toBe("true");
    profile.focus();
    await user.keyboard("{Escape}{Escape}{Escape}");
    const settings = canvas.getByRole("button", { name: /Settings protected/ });
    expect(settings.getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(settings);
    expect(canvas.getByRole("button", { name: "Account Subflow · Manage account" }).getAttribute("aria-current")).toBeNull();
    expect(canvas.queryByRole("button", { name: "Profile" })).toBeNull();
    expect(window.location.hash).toBe("#screen=settings");
    expect(screen.getByRole("region", { name: "Screen: Settings" }).tagName).toBe("SECTION");
  });

  it("keeps screen selection and detail available if the graph fails", async () => {
    const raw = syntheticStudy();
    raw.app.slug = "unavailable-fixture";
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(<ProductResearchViewer study={parseAppResearchStudy(raw)} readAsset={reader()} />);
      await screen.findByText("The graph could not load. Use the screen list below.");
      const list = within(screen.getByRole("navigation", { name: "Screens" }));
      await userEvent.click(list.getByRole("button", { name: /Settings/ }));
      expect(screen.getByRole("region", { name: "Screen: Settings" })).toBeTruthy();
    } finally {
      report.mockRestore();
    }
  });

  it("names both figures and matches compact wireframe controls to the full labels", () => {
    const scrollHeight = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get");
    const clientHeight = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(32);
    let fitLabels: () => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      private watchesWireframe = false;
      constructor(private readonly callback: () => void) {}
      observe(target: Element) {
        if (target.classList.contains("app-research-canvas")) {
          fitLabels = this.callback;
          this.watchesWireframe = true;
        }
      }
      unobserve() {}
      disconnect() { if (this.watchesWireframe) disconnect(); }
    });
    try {
      scrollHeight.mockReturnValue(33);
      const { unmount } = render(<ProductResearchViewer study={study} readAsset={reader()} />);
      expect(screen.getByRole("heading", { level: 4, name: "Wireframe" }).closest("figure")?.className)
        .toBe("app-research-wireframe");
      expect(screen.getByRole("heading", { level: 4, name: "Screenshot" }).closest("figure")?.className)
        .toBe("app-research-capture");

      const region = screen.getByRole("button", { name: "Settings (button)" });
      const row = within(screen.getByRole("region", { name: "Controls" })).getByRole("button", { name: /Settings/ });
      expect(region.getAttribute("title")).toBe("Settings");
      expect(region.hasAttribute("data-compact")).toBe(true);
      expect(region.querySelector(".app-research-region-number")?.textContent).toBe("1");
      expect(row.querySelector(".app-research-control-number")?.textContent).toBe("1");

      scrollHeight.mockReturnValue(32);
      fitLabels();
      expect(region.hasAttribute("data-compact")).toBe(false);
      unmount();
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      scrollHeight.mockRestore();
      clientHeight.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("reveals all captures for a screen and restores a capture deep link", async () => {
    const raw = syntheticStudy();
    const secondCapture = "screens/home-scrolled.png";
    const accessibility = "screens/home-scrolled.ax.json";
    const imageBytes = "synthetic-png-scrolled";
    const accessibilityText = '{"role":"scrollview"}';
    raw.app.screens[0]!.screenshots!.push({
      ...raw.app.screens[0]!.screenshots![0]!, path: secondCapture, sha256: sha(imageBytes), accessibility,
      position: "scrolled",
    });
    Object.assign(raw.assets, {
      [secondCapture]: asset(imageBytes, "image/png"),
      [accessibility]: asset(accessibilityText, "application/json"),
    });
    const studyWithCaptures = parseAppResearchStudy(raw);
    const readAsset = reader({ [secondCapture]: imageBytes, [accessibility]: accessibilityText });
    const view = render(<ProductResearchViewer study={studyWithCaptures} readAsset={readAsset} />);
    await screen.findByRole("img", { name: "Home screenshot" });
    expect(readAsset.mock.calls).toEqual([["screens/home.png"]]);
    const chooser = screen.getByRole("combobox", { name: "Captured screenshot" }) as HTMLSelectElement;
    await userEvent.selectOptions(chooser, screen.getByRole("option", { name: "2. scrolled" }));
    expect(window.location.hash).toBe("#screen=home&capture=screens%2Fhome-scrolled.png");
    await waitFor(() => expect(readAsset.mock.calls).toEqual([["screens/home.png"], [secondCapture]]));
    expect(revoked).toContain("blob:test/0");
    await userEvent.click(screen.getByText("Accessibility snapshot"));
    expect(await screen.findByText(accessibilityText)).toBeTruthy();
    view.unmount();

    render(<ProductResearchViewer study={studyWithCaptures} readAsset={readAsset} />);
    expect((screen.getByRole("combobox", { name: "Captured screenshot" }) as HTMLSelectElement).value).toBe(secondCapture);
  });

  it("filters the screen list by title, state, description or control label", async () => {
    render(<ProductResearchViewer study={study} readAsset={reader()} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search screens" }), "secure");
    const list = screen.getByRole("navigation", { name: "Screens" });
    expect(within(list).getAllByRole("button").map((button) => button.textContent)).toEqual(["Settingsprotected · text only"]);
    expect(within(list).getByText("1 of 2 screens")).toBeTruthy();
  });

  it("links a selected control to the hash, its evidence and its destination screen", async () => {
    const readAsset = reader();
    render(<ProductResearchViewer study={study} readAsset={readAsset} />);
    await screen.findByRole("img", { name: "Home screenshot" });
    await userEvent.click(screen.getByRole("button", { name: "Settings (button)" }));
    expect(window.location.hash).toBe("#screen=home&control=settings-button");
    const detail = screen.getByRole("region", { name: "Selected control: Settings" });
    expect(within(detail).getByText("Tapped in replay 1")).toBeTruthy();
    expect(within(detail).getByText("opens settings")).toBeTruthy();

    await userEvent.click(within(detail).getByRole("button", { name: "Settings" }));
    expect(window.location.hash).toBe("#screen=settings");
    expect(screen.getByText(/No screenshot for this state \(protected\)/)).toBeTruthy();
    // Leaving the screen releases its object URL; the text-only screen fetches nothing.
    expect(revoked).toEqual(["blob:test/0"]);
    expect(readAsset).toHaveBeenCalledTimes(1);
  });

  it("restores a deep link to a screen and control", async () => {
    window.history.replaceState(null, "", "/hq/research#screen=home&control=settings-button");
    render(<ProductResearchViewer study={study} readAsset={reader()} />);
    expect(await screen.findByRole("region", { name: "Selected control: Settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Settings (button)" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("does not read the entry screenshot before restoring another screen", () => {
    window.history.replaceState(null, "", "/hq/research#screen=settings");
    const readAsset = reader();
    render(<ProductResearchViewer study={study} readAsset={readAsset} />);
    expect(screen.getByRole("heading", { level: 3, name: "Settings" })).toBeTruthy();
    expect(readAsset).not.toHaveBeenCalled();
  });

  it("falls back to the entry screen for an unknown deep link", () => {
    window.history.replaceState(null, "", "/hq/research#screen=nope&control=settings-button");
    render(<ProductResearchViewer study={study} readAsset={reader()} />);
    expect(screen.getByRole("heading", { level: 3, name: "Home" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: /Selected control/ })).toBeNull();
  });

  it("refuses a screenshot whose bytes do not match and retries on request", async () => {
    const readAsset = reader({ "screens/home.png": "synthetic-png-homE" });
    render(<ProductResearchViewer study={study} readAsset={readAsset} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The downloaded SHA-256 did not match the catalog.");
    expect(created).toEqual([]);
    readAsset.mockImplementation(async (path: string) => blob(FILES[path]!));
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("img", { name: "Home screenshot" })).toBeTruthy();
    expect(readAsset).toHaveBeenCalledTimes(2);
  });

  it("reports a fetch failure without breaking the rest of the screen", async () => {
    const readAsset = vi.fn(async () => { throw new Error("storage/unauthorized"); });
    render(<ProductResearchViewer study={study} readAsset={readAsset} />);
    expect((await screen.findByRole("alert")).textContent).toContain("storage/unauthorized");
    expect(screen.getByRole("region", { name: "Controls" })).toBeTruthy();
  });

  it("fetches accessibility text only when it is opened and shows it as text", async () => {
    const readAsset = reader();
    render(<ProductResearchViewer study={study} readAsset={readAsset} />);
    await screen.findByRole("img", { name: "Home screenshot" });
    expect(readAsset).not.toHaveBeenCalledWith("screens/home.ax.json");
    await userEvent.click(screen.getByText("Accessibility snapshot"));
    expect(await screen.findByText('{"role":"window"}')).toBeTruthy();
    expect(readAsset).toHaveBeenCalledWith("screens/home.ax.json");
  });

  it("downloads only verified bytes", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const readAsset = reader({ "exports/flows.csv": "tampered,csv\nhome,settings\n" });
    render(<ProductResearchViewer study={study} readAsset={readAsset} />);
    await screen.findByRole("img", { name: "Home screenshot" });
    await userEvent.click(screen.getByRole("button", { name: "Flow table" }));
    expect((await screen.findByText(/Failed:/)).textContent).toContain("byte count did not match");
    expect(click).not.toHaveBeenCalled();

    readAsset.mockImplementation(async (path: string) => blob(FILES[path]!));
    await userEvent.click(screen.getByRole("button", { name: "Flow table" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("flows.csv");
    expect(anchor.href).toBe(created.at(-1));
    await waitFor(() => expect(revoked).toContain(created.at(-1)), { timeout: 2000 });
    click.mockRestore();
  });

  it("places wireframe regions from points, pixels or normalized bounds", () => {
    const raw = syntheticStudy();
    const [settings, promo] = raw.app.screens[0]!.elements as Record<string, unknown>[];
    Object.assign(promo!, { bounds: { x: 0.5, y: 0.25, width: 0.25, height: 0.1 }, boundsSpace: "normalized" });
    const pixels = { ...settings!, id: "settings-pixels", label: "Settings px", bounds: { x: 900, y: 180, width: 240, height: 132 }, boundsSpace: "pixels" };
    raw.app.screens[0]!.elements.push(pixels as never);
    render(<ProductResearchViewer study={parseAppResearchStudy(raw)} readAsset={reader()} />);
    const style = (name: string) => {
      const { left, top, width, height } = screen.getByRole("button", { name }).style;
      return [left, top, width, height].map((value) => Number.parseFloat(value).toFixed(2));
    };
    // 300/393 points and 900/1179 pixels are the same place on a 3× screen.
    expect(style("Settings (button)")).toEqual(["76.34", "7.04", "20.36", "5.16"]);
    expect(style("Settings px (button)")).toEqual(["76.34", "7.04", "20.36", "5.16"]);
    expect(style("Promo (image)")).toEqual(["50.00", "25.00", "25.00", "10.00"]);
  });

  it("omits pixel-space regions on a screen without a screenshot", async () => {
    const raw = syntheticStudy();
    raw.app.screens[1]!.elements = [{ id: "pin", label: "PIN", role: "field", behavior: "secure", status: "observed",
      bounds: { x: 1, y: 1, width: 1, height: 1 }, boundsSpace: "pixels" }] as never;
    window.history.replaceState(null, "", "/hq/research#screen=settings");
    render(<ProductResearchViewer study={parseAppResearchStudy(raw)} readAsset={reader()} />);
    expect(screen.queryByRole("button", { name: "PIN (field)" })).toBeNull();
    expect(screen.getByRole("button", { name: /PIN/ }).className).toBe("app-research-control-button");
  });

  it("revokes the screenshot URL on unmount", async () => {
    const { unmount } = render(<ProductResearchViewer study={study} readAsset={reader()} />);
    await screen.findByRole("img", { name: "Home screenshot" });
    unmount();
    expect(revoked).toEqual(["blob:test/0"]);
  });
});

const SNAPSHOT = parseAppeekySnapshot({
  schemaVersion: 1, source: "appeeky", appId: "123", country: "us", device: "iphone", fetchedAt: "2026-11-01T00:00:00Z",
  listing: { title: "Example App", category: "Utilities", rating: 4.5, ratingCount: 1200, downloadPrice: 0, appStoreUrl: "https://apps.apple.com/us/app/id123" },
  keywords: [
    { term: "alpha", branded: false, rank: 4, rankChange7d: -2, status: "ranked" },
    { term: "beta", branded: false, rank: null, status: "unranked" },
    { term: "Example", branded: true, rank: null, status: "missing" },
  ],
});

describe("AppStoreSignals", () => {
  it("shows rank, unranked and unchecked terms distinctly with source, date and staleness", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-20T00:00:00Z") });
    render(<AppStoreSignals snapshot={SNAPSHOT} appeekyUrl="https://appeeky.example/app/123" />);
    const rows = screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));
    expect(rows).toEqual([["#4", "down 2", "—", "—"], ["Not in top results", "—", "—", "—"], ["Not checked", "—", "—", "—"]]);
    expect(screen.getByRole("link", { name: "Open in Appeeky" }).getAttribute("href")).toBe("https://appeeky.example/app/123");
    expect(screen.getByRole("region", { name: "Keyword rankings" }).tabIndex).toBe(0);
    expect(screen.getByRole("heading", { level: 2, name: "App Store signals" })).toBeTruthy();
    expect(screen.getByText(/fetched 2026-11-01/)).toBeTruthy();
    expect(await screen.findByText(/stale, older than 7 days/)).toBeTruthy();
    expect(screen.getByText("4.5 of 5 from 1,200 ratings")).toBeTruthy();
  });

  it("is not stale inside seven days", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-07T23:59:59Z") });
    render(<AppStoreSignals snapshot={SNAPSHOT} appeekyUrl="https://appeeky.example" />);
    expect(screen.queryByText(/stale/)).toBeNull();
  });

  it("handles a missing snapshot and never links a non-https URL", () => {
    render(<AppStoreSignals snapshot={null} appeekyUrl="javascript:alert(1)" />);
    expect(screen.getByText(/No App Store snapshot has been fetched yet/)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
