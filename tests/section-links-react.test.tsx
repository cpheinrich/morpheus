// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SectionLinks } from "../src/section-links/react.js";

const writeText = vi.fn<(text: string) => Promise<void>>();
const scrollIntoView = vi.fn();
let pointAt: (x: number, y: number) => Element | null;
// jsdom has no layout; every element reports this box, so the gutter has room unless a test narrows it.
let textLeft = 100;
const originalRect = Element.prototype.getBoundingClientRect;

function Page() {
  return (
    <>
      <nav>
        <h2>Navigation</h2>
      </nav>
      <main>
        <h1>Research</h1>
        <h2>
          <span>Overview</span>
        </h2>
        <p>Body text.</p>
        <h3 id="authored">Method</h3>
      </main>
    </>
  );
}

// jsdom has no PointerEvent, and testing-library drops unknown init fields on its fallback.
function hover(x: number, y: number, pointerType = "mouse") {
  const event = new MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  act(() => {
    document.dispatchEvent(event);
  });
}

beforeEach(() => {
  window.history.replaceState(null, "", "/hq/research?tab=labs");
  writeText.mockReset().mockResolvedValue(undefined);
  scrollIntoView.mockReset();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Element.prototype.scrollIntoView = scrollIntoView;
  pointAt = () => null;
  document.elementFromPoint = (x: number, y: number) => pointAt(x, y);
  textLeft = 100;
  Element.prototype.getBoundingClientRect = () =>
    ({ left: textLeft, top: 20, width: 600, height: 32, right: textLeft + 600, bottom: 52, x: textLeft, y: 20 }) as DOMRect;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  Element.prototype.getBoundingClientRect = originalRect;
});

describe("SectionLinks", () => {
  it("addresses every section heading on mount, including ones that arrive later", async () => {
    render(
      <>
        <Page />
        <SectionLinks />
      </>,
    );

    const overview = screen.getByRole("heading", { level: 2, name: "Overview" });
    expect(overview.id).toBe("overview");
    expect(screen.getByRole("heading", { level: 3 }).id).toBe("authored");
    expect(screen.getByRole("heading", { level: 1 }).id).toBe("");
    expect(screen.getByRole("heading", { level: 2, name: "Navigation" }).id).toBe("");

    const late = document.createElement("h2");
    late.textContent = "Late results";
    document.querySelector("main")!.append(late);
    await waitFor(() => expect(late.id).toBe("late-results"));
  });

  it("scrolls once to a shared link whose id did not exist until it was generated", async () => {
    window.history.replaceState(null, "", "/hq/research#overview");
    render(
      <>
        <Page />
        <SectionLinks />
      </>,
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("overview"));

    document.querySelector("main")!.append(document.createElement("p"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("leaves an authored fragment to the browser, which already scrolled to it", () => {
    window.history.replaceState(null, "", "/hq/research#authored");
    render(
      <>
        <Page />
        <SectionLinks />
      </>,
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("shows the link while the pointer is on a heading or its left gutter, and hides it after", async () => {
    render(
      <>
        <Page />
        <SectionLinks />
      </>,
    );
    const overview = screen.getByRole("heading", { level: 2, name: "Overview" });
    const body = document.querySelector("main p")!;

    pointAt = () => overview.querySelector("span");
    hover(100, 20);
    const link = await screen.findByRole("link", { name: "Copy link to “Overview”" });
    expect(link.getAttribute("href")).toBe("#overview");

    // In the gutter the pointer is over the page, but 40px to its right is the heading.
    pointAt = (x) => (x >= 40 ? overview : document.querySelector("main"));
    hover(10, 20);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole("link", { name: "Copy link to “Overview”" })).toBeTruthy();

    // Over the icon itself, which is outside the heading, it stays.
    pointAt = () => screen.getByRole("link", { name: "Copy link to “Overview”" }).querySelector("path");
    hover(8, 20);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole("link", { name: "Copy link to “Overview”" })).toBeTruthy();

    pointAt = () => body;
    hover(100, 200);
    await waitFor(() => expect(screen.queryByRole("link")).toBeNull());
  });

  it("offers nothing for chrome headings or touch", async () => {
    render(
      <>
        <Page />
        <SectionLinks />
      </>,
    );
    pointAt = () => screen.getByRole("heading", { level: 2, name: "Navigation" });
    hover(100, 20);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("link")).toBeNull();

    pointAt = () => screen.getByRole("heading", { level: 2, name: "Overview" });
    hover(100, 20, "touch");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("copies the full address, puts it in the address bar without a Back step, and says so", async () => {
    render(
      <>
        <Page />
        <SectionLinks />
      </>,
    );
    const historyLength = window.history.length;
    pointAt = () => screen.getByRole("heading", { level: 2, name: "Overview" });
    hover(100, 20);
    const link = await screen.findByRole("link", { name: "Copy link to “Overview”" });

    fireEvent.click(link);

    const expected = `${window.location.origin}/hq/research?tab=labs#overview`;
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(window.location.href).toBe(expected);
    expect(window.history.length).toBe(historyLength);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Link copied"));
    expect(link.getAttribute("data-status")).toBe("copied");
  });

  it("reports a refused clipboard and leaves modified clicks to the browser", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(
      <>
        <Page />
        <SectionLinks copy={{ failed: "Copy failed" }} />
      </>,
    );
    pointAt = () => screen.getByRole("heading", { level: 3 });
    hover(100, 20);
    const link = await screen.findByRole("link", { name: "Copy link to “Method”" });

    const modified = fireEvent.click(link, { ctrlKey: true });
    expect(modified).toBe(true); // not prevented
    expect(writeText).not.toHaveBeenCalled();

    fireEvent.click(link);
    expect(window.location.hash).toBe("#authored");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Copy failed"));
  });

  it("hands Next's patched replaceState a state without its marker, so the router adopts the URL", async () => {
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: "tree", other: 1 }, "");
    const original = window.history.replaceState.bind(window.history);
    const received: unknown[] = [];
    window.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
      received.push(data);
      original(data, unused, url);
    };
    try {
      render(
        <>
          <Page />
          <SectionLinks />
        </>,
      );
      pointAt = () => screen.getByRole("heading", { level: 2, name: "Overview" });
      hover(100, 20);
      fireEvent.click(await screen.findByRole("link", { name: "Copy link to “Overview”" }));
      expect(received).toEqual([{ __PRIVATE_NEXTJS_INTERNALS_TREE: "tree", other: 1 }]);
      expect(window.location.hash).toBe("#overview");
    } finally {
      window.history.replaceState = original;
    }
  });

  it("copies the heading's current id when its text changed under a still pointer", async () => {
    render(
      <>
        <Page />
        <SectionLinks copy={{ label: "Link to {title}" }} />
      </>,
    );
    const overview = screen.getByRole("heading", { level: 2, name: "Overview" });
    pointAt = () => overview;
    hover(100, 20);
    const link = await screen.findByRole("link", { name: "Link to Overview" });

    overview.querySelector("span")!.textContent = "Loaded overview";
    await waitFor(() => expect(overview.id).toBe("loaded-overview"));
    fireEvent.click(link);

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/hq/research?tab=labs#loaded-overview`,
    );
  });

  it("scrolls once per navigation: not when a copied section remounts, again on a fresh visit", async () => {
    const remount = () => {
      const main = document.querySelector("main")!;
      const fresh = document.createElement("h2");
      fresh.textContent = "Overview";
      main.querySelector("h2")!.replaceWith(fresh);
      return fresh;
    };
    render(
      <>
        <Page />
        <SectionLinks />
      </>,
    );
    pointAt = () => screen.getByRole("heading", { level: 2, name: "Overview" });
    hover(100, 20);
    fireEvent.click(await screen.findByRole("link", { name: "Copy link to “Overview”" }));
    expect(window.location.hash).toBe("#overview");

    const remounted = remount();
    await waitFor(() => expect(remounted.id).toBe("overview"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(scrollIntoView).not.toHaveBeenCalled();

    // Leave, let the other page render, then follow a link back to the section.
    window.history.pushState(null, "", "/hq/other");
    document.querySelector("main")!.append(document.createElement("p"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    window.history.pushState(null, "", "/hq/research?tab=labs#overview");
    const returned = remount();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView.mock.contexts[0]).toBe(returned);
  });

  it("keeps the icon wholly in a narrow margin, shrinking it, and offers none where there is no room", async () => {
    render(
      <>
        <Page />
        <SectionLinks />
      </>,
    );
    pointAt = () => screen.getByRole("heading", { level: 2, name: "Overview" });

    for (const left of [20, 16]) {
      textLeft = left;
      hover(100, 20 + left);
      // Re-query each time: a stale, detached link would still report the previous position.
      await waitFor(() => {
        const link = screen.getByRole("link", { name: "Copy link to “Overview”" });
        const iconLeft = parseFloat(link.style.left);
        const iconWidth = parseFloat(link.style.width);
        expect(iconLeft).toBeGreaterThanOrEqual(2);
        expect(iconWidth).toBeGreaterThanOrEqual(12);
        // The gap has shrunk to its 2px minimum and the icon ends there, clear of the text.
        expect(iconLeft + iconWidth + 2).toBe(left);
      });
    }

    textLeft = 10;
    hover(100, 40);
    await waitFor(() => expect(screen.queryByRole("link")).toBeNull());
  });

  it("opens the folded section a shared link points into, then scrolls to it", async () => {
    window.history.replaceState(null, "", "/hq/research#hidden-result");
    render(
      <>
        <main>
          <details>
            <summary>Show 3 more</summary>
            <details>
              <summary>Nested</summary>
              <h3>Hidden result</h3>
            </details>
          </details>
        </main>
        <SectionLinks />
      </>,
    );

    const heading = document.getElementById("hidden-result")!;
    expect(heading).not.toBeNull();
    expect([...document.querySelectorAll("details")].map((d) => d.open)).toEqual([true, true]);
    expect(scrollIntoView.mock.contexts[0]).toBe(heading);
  });

  it("clears the confirmation after a moment", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      render(
        <>
          <Page />
          <SectionLinks />
        </>,
      );
      pointAt = () => screen.getByRole("heading", { level: 2, name: "Overview" });
      hover(100, 20);
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });
      fireEvent.click(screen.getByRole("link", { name: "Copy link to “Overview”" }));
      await act(async () => {});
      expect(screen.getByRole("status").textContent).toBe("Link copied");
      await act(async () => {
        vi.advanceTimersByTime(1600);
      });
      expect(screen.getByRole("status").textContent).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });
});
