import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { initResearchLibrary, runResearchLibrary } from "../src/cli/research-library.js";
import {
  parseResearchLibraryBook,
} from "../src/research-library/index.js";
import { verifiedResearchLibraryBlob } from "../src/research-library/client.js";
import { loadResearchLibraryCatalog } from "../src/research-library/server.js";

const DIGEST = "a".repeat(64);
const READER_DIGEST = "b".repeat(64);
const CONTRACT = { bucket: "example.firebasestorage.app" };

function book() {
  return {
    schemaVersion: "research-library-book-2",
    slug: "an-example-book",
    title: "An Example Book",
    authors: ["A. Researcher"],
    sourceDirectory: "a-researcher_an-example-book",
    bundle: {
      bucket: CONTRACT.bucket,
      object: "research-library/books/an-example-book/" + DIGEST + ".zip",
      sha256: DIGEST,
      bytes: 4,
      files: 1,
    },
    reader: {
      bucket: CONTRACT.bucket,
      object: "research-library/books/an-example-book/" + READER_DIGEST + ".html",
      sha256: READER_DIGEST,
      bytes: 8,
      sourceBundleSha256: DIGEST,
      format: "docling-html-embedded-v1",
    },
  };
}

describe("research library", () => {
  it("validates project-specific immutable object identities", () => {
    expect(parseResearchLibraryBook(book(), CONTRACT)?.slug).toBe("an-example-book");
    const floating = book();
    floating.bundle.object = "research-library/books/an-example-book/latest.zip";
    expect(parseResearchLibraryBook(floating, CONTRACT)).toBeNull();
    expect(parseResearchLibraryBook(book(), { bucket: "another-bucket" })).toBeNull();
  });

  it("loads valid books while reporting malformed manifests", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "morpheus-library-catalog-"));
    const catalog = path.join(root, "hq/research/library/catalog");
    await mkdir(catalog, { recursive: true });
    await writeFile(path.join(catalog, "an-example-book.json"), JSON.stringify(book()));
    await writeFile(path.join(catalog, "broken.json"), "not json");
    const loaded = await loadResearchLibraryCatalog(root, CONTRACT);
    expect(loaded.books.map((entry) => entry.slug)).toEqual(["an-example-book"]);
    expect(loaded.issues).toEqual([{
      path: "hq/research/library/catalog/broken.json",
      message: "manifest could not be read",
    }]);
  });

  it("checks byte count and digest before exposing a browser blob", async () => {
    const blob = new Blob(["safe"]);
    const digest = "8b3369944dd2a3fab39e32d1aeb1f763946a458ae3e6368a46432adc8f3a0860";
    await expect(verifiedResearchLibraryBlob({ bytes: 4, sha256: digest }, async () => blob))
      .resolves.toBe(blob);
    await expect(verifiedResearchLibraryBlob({ bytes: 5, sha256: digest }, async () => blob))
      .rejects.toThrow("byte count");
  });

  it("initializes config without creating or replacing local book content", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "morpheus-library-init-"));
    await writeFile(path.join(root, "morpheus.json"), JSON.stringify({ name: "example" }));
    await mkdir(path.join(root, "local/research-library"), { recursive: true });
    const source = path.join(root, "local/research-library", "keep.txt");
    await writeFile(source, "untouched");
    expect(await initResearchLibrary({
      root, project: "example", bucket: CONTRACT.bucket,
    })).toBe(0);
    expect(await initResearchLibrary({
      root, project: "example", bucket: CONTRACT.bucket,
    })).toBe(0);
    expect(await readFile(source, "utf8")).toBe("untouched");
    expect(JSON.parse(await readFile(path.join(root, "morpheus.json"), "utf8")))
      .toMatchObject({ researchLibrary: { project: "example", bucket: CONTRACT.bucket } });
    expect((await readFile(path.join(root, ".gitignore"), "utf8"))
      .match(/\/local\/research-library\//g)).toHaveLength(1);
  });

  it("runs the shipped deterministic Python bundler through the shared CLI", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "morpheus-library-bundle-"));
    await writeFile(path.join(root, "morpheus.json"), JSON.stringify({
      researchLibrary: { project: "example", bucket: CONTRACT.bucket },
    }));
    const source = path.join(root, "book");
    await mkdir(source);
    await writeFile(path.join(source, "source.txt"), "same bytes");
    const first = path.join(root, "first.zip");
    const second = path.join(root, "second.zip");
    expect(await runResearchLibrary("bundle", [source, first], { root })).toBe(0);
    expect(await runResearchLibrary("bundle", [source, second], { root })).toBe(0);
    expect(await readFile(first)).toEqual(await readFile(second));
    expect((await stat(first)).size).toBeGreaterThan(0);
  });

  it("keeps the browser entry free of Node-only imports", async () => {
    const source = await readFile(new URL("../src/research-library/client.ts", import.meta.url), "utf8");
    expect(source).not.toContain("node:fs");
    expect(source).not.toContain("node:path");
    expect(source).not.toContain("./server");
  });
});
