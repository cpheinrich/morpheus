// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SECTION_LINK_OPTIONS,
  assignHeadingIds,
  eligibleHeading,
  fragmentId,
  headingSlug,
  sectionHref,
  sectionScope,
  uniqueId,
  type GeneratedIds,
} from "../src/section-links/index.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("headingSlug", () => {
  it("matches GitHub's slug, keeping hyphen runs that links already depend on", () => {
    expect(headingSlug("SRC-150 — a title")).toBe("src-150--a-title");
    expect(headingSlug("Hello, World!")).toBe("hello-world");
    expect(headingSlug("  Café au lait ")).toBe("café-au-lait");
    expect(headingSlug("snake_case and-hyphen")).toBe("snake_case-and-hyphen");
    expect(headingSlug("❗ 2. PR414 conflict")).toBe("-2-pr414-conflict");
  });

  it("names a heading with no letters or digits `section`", () => {
    expect(headingSlug("—!?")).toBe("section");
    expect(headingSlug("")).toBe("section");
  });
});

describe("uniqueId", () => {
  it("returns the base when free and GitHub's next suffix when not", () => {
    expect(uniqueId("notes", () => false)).toBe("notes");
    const taken = new Set(["notes", "notes-1"]);
    expect(uniqueId("notes", (id) => taken.has(id))).toBe("notes-2");
  });
});

describe("sectionHref and fragmentId", () => {
  const location = { origin: "https://example.com", pathname: "/hq/research", search: "?tab=labs" };

  it("keeps the page and its query and encodes the fragment", () => {
    expect(sectionHref(location, "results")).toBe("https://example.com/hq/research?tab=labs#results");
    expect(sectionHref(location, "café au")).toBe(
      "https://example.com/hq/research?tab=labs#caf%C3%A9%20au",
    );
  });

  it("round-trips an encoded fragment and refuses an empty or malformed one", () => {
    expect(fragmentId("#caf%C3%A9%20au")).toBe("café au");
    expect(fragmentId("#plain")).toBe("plain");
    expect(fragmentId("#")).toBeNull();
    expect(fragmentId("")).toBeNull();
    expect(fragmentId("#%E0%A4%A")).toBeNull();
  });
});

describe("assignHeadingIds", () => {
  function page(): void {
    document.body.innerHTML = `
      <nav><h2>Navigation</h2></nav>
      <p id="results">An unrelated element already holds this id.</p>
      <main>
        <h1>Page title</h1>
        <h2>Overview</h2>
        <h2>Overview</h2>
        <h3 id="kept">Authored id</h3>
        <h4>Notes,   &amp;
          more!</h4>
        <h5>Too deep</h5>
        <h2>Results</h2>
        <h2>   </h2>
        <aside><h3>Callout</h3></aside>
        <div role="dialog"><h2>Dialog</h2></div>
        <section data-section-links="off"><h3>Opted out</h3></section>
        <h3 data-section-links="off">Heading opted out</h3>
      </main>`;
  }

  it("gives sections and subsections in scope a unique slug and leaves everything else alone", () => {
    page();
    const generated: GeneratedIds = new WeakMap();
    const assigned = assignHeadingIds(document, DEFAULT_SECTION_LINK_OPTIONS, generated);

    const ids = [...document.querySelectorAll("main h1, main h2, main h3, main h4, main h5")].map(
      (heading) => heading.id,
    );
    expect(ids).toEqual([
      "", // the page title is not a section
      "overview",
      "overview-1",
      "kept",
      "notes--more", // rendered whitespace collapses before slugging
      "", // h5 is outside the default selector
      "results-1", // `results` belongs to the paragraph outside main
      "", // nothing visible to slug
      "", // aside
      "", // dialog
      "", // opted-out subtree
      "", // opted-out heading
    ]);
    expect(document.querySelector("nav h2")?.id).toBe("");
    expect([...assigned].sort()).toEqual(["notes--more", "overview", "overview-1", "results-1"]);
  });

  it("re-derives only its own ids when their text changes and reports nothing on a quiet pass", () => {
    page();
    const generated: GeneratedIds = new WeakMap();
    assignHeadingIds(document, DEFAULT_SECTION_LINK_OPTIONS, generated);

    const first = document.querySelectorAll<HTMLElement>("main h2")[0]!;
    const authored = document.getElementById("kept")!;
    first.textContent = "Loaded results";
    authored.textContent = "Renamed but authored";

    const assigned = assignHeadingIds(document, DEFAULT_SECTION_LINK_OPTIONS, generated);
    expect(first.id).toBe("loaded-results");
    expect(authored.id).toBe("kept");
    expect([...assigned]).toEqual(["loaded-results"]);

    expect(assignHeadingIds(document, DEFAULT_SECTION_LINK_OPTIONS, generated).size).toBe(0);
  });

  it("restores an id its owner removed, and steps aside when its owner sets one", () => {
    page();
    const generated: GeneratedIds = new WeakMap();
    assignHeadingIds(document, DEFAULT_SECTION_LINK_OPTIONS, generated);
    const [first, second] = [...document.querySelectorAll<HTMLElement>("main h2")] as [
      HTMLElement,
      HTMLElement,
    ];

    first.removeAttribute("id");
    second.id = "chosen-by-owner";
    second.textContent = "Text changed too";
    const assigned = assignHeadingIds(document, DEFAULT_SECTION_LINK_OPTIONS, generated);

    expect(first.id).toBe("overview");
    expect(second.id).toBe("chosen-by-owner");
    expect([...assigned]).toEqual(["overview"]);
  });

  it("yields a generated id to an element rendered later with the same id", () => {
    document.body.innerHTML = `<main><h2>Equity</h2><h2 id="kept">Kept</h2></main>`;
    const generated: GeneratedIds = new WeakMap();
    assignHeadingIds(document, DEFAULT_SECTION_LINK_OPTIONS, generated);
    const heading = document.querySelector("main h2")!;
    expect(heading.id).toBe("equity");

    // A chart that measures before drawing adds its gradient after the heading has its id.
    document.querySelector("main")!.insertAdjacentHTML(
      "beforeend",
      `<svg><linearGradient id="equity"></linearGradient></svg>`,
    );
    const assigned = assignHeadingIds(document, DEFAULT_SECTION_LINK_OPTIONS, generated);

    expect(heading.id).toBe("equity-1");
    expect(document.getElementById("equity")?.tagName).toBe("linearGradient");
    expect([...assigned]).toEqual(["equity-1"]);
    expect(document.getElementById("kept")?.id).toBe("kept");
    expect(assignHeadingIds(document, DEFAULT_SECTION_LINK_OPTIONS, generated).size).toBe(0);
  });

  it("searches the whole body when the page has no main", () => {
    document.body.innerHTML = `<div><h2>Standalone</h2></div>`;
    expect(sectionScope(document, DEFAULT_SECTION_LINK_OPTIONS)).toBe(document.body);
    assignHeadingIds(document, DEFAULT_SECTION_LINK_OPTIONS, new WeakMap());
    expect(document.querySelector("h2")?.id).toBe("standalone");
  });
});

describe("eligibleHeading", () => {
  it("finds the heading around a hit and refuses chrome, excluded and out-of-scope headings", () => {
    document.body.innerHTML = `
      <h2 id="outside">Outside main</h2>
      <main>
        <h2 id="inside"><span>Inside</span></h2>
        <nav><h3 id="in-nav">Nav</h3></nav>
        <p id="para">Text</p>
      </main>`;
    const scope = sectionScope(document, DEFAULT_SECTION_LINK_OPTIONS);
    const at = (selector: string) =>
      eligibleHeading(document.querySelector(selector), scope, DEFAULT_SECTION_LINK_OPTIONS)?.id ?? null;

    expect(at("#inside span")).toBe("inside");
    expect(at("#para")).toBeNull();
    expect(at("#in-nav")).toBeNull();
    expect(at("#outside")).toBeNull();
    expect(eligibleHeading(null, scope, DEFAULT_SECTION_LINK_OPTIONS)).toBeNull();
  });
});
