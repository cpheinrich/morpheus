import { describe, expect, it } from "vitest";

import {
  createHqSearchIndex,
  loadHqSearchIndex,
  searchHq,
  searchSnippet,
  type HqSearchDocument,
} from "../src/hq-search/index.js";
import {
  createHqSearchPayload,
  HQ_SEARCH_PRIVATE_CACHE_CONTROL,
  hqSearchResponseHeaders,
  markdownSearchDocument,
  plainText,
} from "../src/hq-search/build.js";
import { pdfSearchDocument } from "../src/hq-search/pdf.js";

const documents: HqSearchDocument[] = [
  markdownSearchDocument({
    id: "markdown:ops/legal/README.md",
    title: "Legal center",
    href: "/hq/ops/legal",
    path: "ops/legal/README.md",
    source: "# Legal center\n\nDarwin's Employer Identification Number (EIN) is recorded here.",
  }),
  markdownSearchDocument({
    id: "markdown:product/roadmap/launch.md",
    title: "Launch worklog",
    href: "/hq/product/roadmap/launch",
    path: "product/roadmap/launch.md",
    source: "# Launch worklog\n\nHistorical discussion of the marketing launch plan.",
  }),
  markdownSearchDocument({
    id: "markdown:marketing/README.md",
    title: "Marketing launch plan",
    href: "/hq/marketing",
    path: "marketing/README.md",
    source: "# Marketing launch plan\n\nThe current launch plan for Evo.",
  }),
];

describe("HQ search documents", () => {
  it("turns Markdown into searchable plain text, headings, metadata, and aliases", () => {
    const document = markdownSearchDocument({
      id: "q4",
      title: "Goals",
      href: "/hq/goals",
      path: "strategy/goals/README.md",
      source: "# Q4 goals\n\n[Ship it](https://example.com) with **care**.",
      metadata: { status: "active" },
    });

    expect(document.headings).toBe("Q4 goals");
    expect(document.text).toBe("Q4 goals Ship it with care.");
    expect(document.metadata).toBe("status active");
    expect(document.aliases).toContain("fourth quarter");
    expect(plainText("<!-- hidden --> **Visible**")).toBe("Visible");
  });

  it("serializes and reloads an equivalent browser index", async () => {
    const payload = createHqSearchPayload(documents);
    const index = await loadHqSearchIndex(payload);

    expect(payload).toMatchObject({
      version: 1,
      documentCount: 3,
      pdfCount: 0,
      pdfTextDocumentCount: 0,
    });
    expect(index.documentCount).toBe(3);
    expect(searchHq(index, "Darwin EIN number")[0]?.href).toBe("/hq/ops/legal");
  });

  it("prefers canonical READMEs to matching roadmap history", () => {
    const index = createHqSearchIndex(documents);
    expect(searchHq(index, "marketing launch plan")[0]?.href).toBe("/hq/marketing");
  });

  it("supports a project ranking callback without changing the shared index", () => {
    const index = createHqSearchIndex(documents);
    const [result] = searchHq(index, "marketing launch plan", {
      sourceWeight: (candidate) => (candidate.path.includes("roadmap") ? 10 : 1),
    });
    expect(result?.href).toBe("/hq/product/roadmap/launch");
  });

  it.each([false, true])("prefers a complete roadmap ID to numeric tokens and body mentions (reload=%s)", async (reload) => {
    const id = "LK-26-08-28-13.52.42";
    const path = `hq/product/roadmap/${id}-add-shared-hq-search.md`;
    const catalog = [
      markdownSearchDocument({
        id: `markdown:${path}`, title: "Add shared HQ search", href: "/roadmap", path,
        source: "A historical plan to add shared HQ search. ".repeat(40), metadata: { id },
      }),
      markdownSearchDocument({
        id: "inbox", title: "LK 26 08 28 13 52", href: "/inbox", path: "hq/team/alexoedelman.md",
        source: "Q4 report: 42.02% and 42.96%.",
      }),
      markdownSearchDocument({
        id: "mention", title: "Status", href: "/status", path: "hq/team/README.md",
        source: `Discussion of ${id}. `.repeat(20),
      }),
    ];
    const index = reload ? await loadHqSearchIndex(createHqSearchPayload(catalog)) : createHqSearchIndex(catalog);
    const weighted = searchHq(index, id, { sourceWeight: (result) => result.path.includes("roadmap/") ? 0.35 : 1 });
    expect(weighted[0]?.path).not.toBe(path); // The fixture reproduces ordinary token scoring.
    expect(searchHq(index, `  ${id.toLowerCase()}  `, 1).map((result) => result.path)).toEqual([path]);
  });

  it.each(["MO-055", "MO-26-07-29-045", "MO-2026-08-01-15.26.34"])("recognizes the complete legacy roadmap ID %s", (id) => {
    const path = `product/roadmap/${id}-fix-search.md`;
    const index = createHqSearchIndex([
      markdownSearchDocument({ id: "target", title: "Fix search", href: "/target", path, source: "Historical record. ".repeat(100) }),
      markdownSearchDocument({ id: "other", title: "Status", href: "/other", path: "team/README.md", source: id.repeat(20) }),
    ]);
    expect(searchHq(index, id)[0]?.path).toBe(path);
  });

  it.each(["Plan 42.02", "product/roadmap/plan-42.02.md", "plan-42.02.md", "plan-42.02"])("prefers exact title/path identity %s", (query) => {
    const index = createHqSearchIndex([
      markdownSearchDocument({ id: "target", title: "Plan 42.02", href: "/target", path: "product/roadmap/plan-42.02.md", source: "Historical record. ".repeat(100) }),
      markdownSearchDocument({ id: "other", title: "Status", href: "/other", path: "team/README.md", source: `${query} `.repeat(20) }),
    ]);
    expect(searchHq(index, query)[0]?.href).toBe("/target");
  });

  it.each(["LK-26-08-28-13.52", "LK-26-08-28-13.52.4", "MO-055"])("does not promote a partial filename ID for %s", (query) => {
    const id = query === "MO-055" ? "MO-0550" : "LK-26-08-28-13.52.42";
    const index = createHqSearchIndex([
      markdownSearchDocument({ id: "partial", title: "Old task", href: "/partial", path: `product/roadmap/${id}-old-task.md`, source: "Historical record. ".repeat(100) }),
      markdownSearchDocument({ id: "other", title: "Status", href: "/other", path: "team/README.md", source: `${query} `.repeat(20) }),
    ]);
    const ordinary = searchHq(index, query, { sourceWeight: (result) => result.path.includes("roadmap/") ? 0.35 : 1 });
    expect(searchHq(index, query).map((result) => result.id)).toEqual(ordinary.map((result) => result.id));
    expect(searchHq(index, query)[0]?.href).toBe("/other");
  });

  it("matches the original exact title while retaining EIN token normalization", () => {
    const title = "Add EIN number lookup";
    const index = createHqSearchIndex([
      markdownSearchDocument({ id: "target", title, href: "/target", path: "product/roadmap/ein-lookup.md", source: "Historical record. ".repeat(100) }),
      markdownSearchDocument({ id: "other", title: "Tax status", href: "/other", path: "team/README.md", source: "Add EIN lookup. ".repeat(20) }),
    ]);
    expect(searchHq(index, title)[0]?.href).toBe("/target");
    expect(searchHq(index, "Add EIN lookup")[0]?.href).toBe("/other");
  });

  it("builds honest snippets for text and filename-only PDFs", () => {
    expect(searchSnippet("", [])).toMatch(/no extractable text/i);
    expect(searchSnippet("A ".repeat(150) + "needle " + "B ".repeat(150), ["needle"])).toContain(
      "needle",
    );
  });

  it("publishes only private browser-cache headers", () => {
    expect(HQ_SEARCH_PRIVATE_CACHE_CONTROL).toBe("private, max-age=31536000, immutable");
    expect(hqSearchResponseHeaders()).toEqual({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": HQ_SEARCH_PRIVATE_CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    });
  });

  it("keeps an unreadable PDF searchable by filename without attempting OCR", async () => {
    const failures: unknown[] = [];
    const document = await pdfSearchDocument({
      id: "pdf:scan.pdf",
      title: "Board scan",
      href: "/hq/assets/scan.pdf",
      path: "assets/scan.pdf",
      data: new Uint8Array([1, 2, 3]),
      onExtractionError: (error) => failures.push(error),
    });

    expect(failures).toHaveLength(1);
    expect(document).toMatchObject({ kind: "pdf", text: "", title: "Board scan" });
  });
});
