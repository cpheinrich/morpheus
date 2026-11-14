// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildFragment, parseFragment } from "../src/ops-desk/index.js";
import { useFragmentView } from "../src/ops-desk/react.js";

type View = { tab: string; mode: string };
const initial: View = { tab: "overview", mode: "active" };
const read = (hash: string, saved: View | undefined): View => {
  const { section, params } = parseFragment(hash);
  return { tab: section || "overview", mode: params.get("view") ?? saved?.mode ?? "active" };
};
const write = ({ tab, mode }: View) => tab === "overview" ? "" : buildFragment(tab, { view: mode === "active" ? null : mode });

let navigate: (view: View) => void;
function Desk() {
  const state = useFragmentView({ initial, read, write, historyKey: "testDesk" });
  navigate = state.navigate;
  return <p data-testid="view">{state.view.tab}:{state.view.mode}</p>;
}
const shown = () => screen.getByTestId("view").textContent;

beforeEach(() => window.history.replaceState(null, "", "/hq/desk"));
afterEach(cleanup);

describe("useFragmentView", () => {
  it("restores the view a shared link names", () => {
    window.history.replaceState(null, "", "/hq/desk#work?view=recent");
    render(<Desk />);
    expect(shown()).toBe("work:recent");
  });

  it("pushes one entry per distinct fragment and restores on Back", async () => {
    render(<Desk />);
    const before = window.history.length;
    act(() => navigate({ tab: "work", mode: "recent" }));
    expect(window.location.hash).toBe("#work?view=recent");
    expect(shown()).toBe("work:recent");
    act(() => navigate({ tab: "work", mode: "recent" }));
    expect(window.history.length).toBe(before + 1);

    act(() => navigate(initial));
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/hq/desk");

    await act(async () => {
      window.history.back();
      await new Promise(resolve => window.addEventListener("popstate", resolve, { once: true }));
    });
    expect(shown()).toBe("work:recent");
  });

  it("follows a hash typed or linked within the page", () => {
    render(<Desk />);
    act(() => {
      window.location.hash = "#devices";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(shown()).toBe("devices:active");
  });
});
