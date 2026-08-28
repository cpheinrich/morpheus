// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHqSearchPayload, markdownSearchDocument } from "../src/hq-search/build.js";
import { HqSearchDialog } from "../src/hq-search/react.js";

const payload = createHqSearchPayload([
  markdownSearchDocument({
    id: "legal",
    title: "Legal center",
    href: "/hq/legal",
    path: "ops/legal/README.md",
    source: "# Legal center\n\nThe Employer Identification Number (EIN) is recorded here.",
  }),
]);

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => payload } as Response),
  );
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
});

describe("HqSearchDialog", () => {
  it("downloads the private index only after opening and searches locally", async () => {
    const user = userEvent.setup();
    render(
      <HqSearchDialog
        indexUrl="/hq/search-index?v=test"
        copy={{ dialogLabel: "Search Test HQ", emptyPrompt: "Try an EIN search." }}
      />,
    );

    expect(fetch).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Search HQ" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    const dialog = screen.getByRole("dialog", { name: "Search Test HQ" });
    expect(dialog.parentElement).toBe(document.body);
    expect(document.body.style.overflow).toBe("hidden");

    const input = screen.getByRole("textbox", { name: "Search documents" });
    await waitFor(() => expect(document.activeElement).toBe(input));
    await user.type(input, "EIN number");
    expect((await screen.findByRole("link", { name: /Legal center/ })).getAttribute("href")).toBe(
      "/hq/legal",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("opens from either platform shortcut and restores focus after Escape", async () => {
    const user = userEvent.setup();
    render(<HqSearchDialog indexUrl="/hq/search-index" />);
    const trigger = screen.getByRole("button", { name: "Search HQ" });

    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("dialog", { name: "Search HQ" })).toBeTruthy();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Search HQ" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });
});
