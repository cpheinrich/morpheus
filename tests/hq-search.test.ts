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
