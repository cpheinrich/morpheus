import { chmod, mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
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

  it("publishes a new book only after both immutable objects verify", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "morpheus-library-publish-"));
    const bucket = CONTRACT.bucket;
    await writeFile(path.join(root, "morpheus.json"), JSON.stringify({
      researchLibrary: { project: "example", bucket },
    }));
    const source = path.join(root, "local/research-library/researcher_example-book");
    await mkdir(path.join(source, "docling"), { recursive: true });
    await writeFile(path.join(source, "docling/source.json"), "{}");
    await writeFile(path.join(source, "source.md"), "unchanged");
    const tools = path.join(root, "tools");
    const remote = path.join(root, "remote");
    await mkdir(tools);
    await mkdir(remote);
    const docling = path.join(tools, "docling-python");
    await writeFile(docling, "#!/bin/sh\nprintf '<!doctype html><title>Book</title>' > \"$3\"\n");
    await chmod(docling, 0o755);
    const gcloud = path.join(tools, "gcloud");
    await writeFile(gcloud, `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const args = process.argv.slice(2);
const stateFor = (uri) => path.join(process.env.MOCK_GCLOUD_DIR, crypto.createHash("sha256").update(uri).digest("hex") + ".json");
if (args[0] === "storage" && args[1] === "objects" && args[2] === "describe") {
  const state = stateFor(args[3]);
  if (!fs.existsSync(state)) { console.error("not found"); process.exit(1); }
  process.stdout.write(fs.readFileSync(state));
} else if (args[0] === "storage" && args[1] === "cp") {
  const source = args[2]; const uri = args[3]; const without = uri.slice(5);
  const slash = without.indexOf("/");
  const option = (name) => args.find((arg) => arg.startsWith(name + "="))?.slice(name.length + 1);
  const custom = Object.fromEntries((option("--custom-metadata") || "").split(",").filter(Boolean).map((part) => part.split("=")));
  const metadata = { bucket: without.slice(0, slash), name: without.slice(slash + 1),
    size: fs.statSync(source).size, content_type: option("--content-type"),
    content_disposition: option("--content-disposition"), cache_control: option("--cache-control"),
    custom_fields: custom };
  const state = stateFor(uri);
  fs.writeFileSync(state, JSON.stringify(metadata));
} else process.exit(2);
`);
    await chmod(gcloud, 0o755);

    const previousDocling = process.env.DOCLING_PYTHON;
    const previousRemote = process.env.MOCK_GCLOUD_DIR;
    process.env.DOCLING_PYTHON = docling;
    process.env.MOCK_GCLOUD_DIR = remote;
    try {
      expect(await runResearchLibrary("publish", [
        "researcher_example-book", "--slug", "an-example-book",
        "--title", "An Example Book", "--author", "A. Researcher",
      ], { root, gcloud })).toBe(0);
      expect(await runResearchLibrary("publish", [
        "researcher_example-book", "--slug", "failed-book",
        "--title", "Failed Book", "--author", "A. Researcher",
      ], { root, gcloud: "/usr/bin/false" })).toBe(1);
    } finally {
      if (previousDocling === undefined) delete process.env.DOCLING_PYTHON;
      else process.env.DOCLING_PYTHON = previousDocling;
      if (previousRemote === undefined) delete process.env.MOCK_GCLOUD_DIR;
      else process.env.MOCK_GCLOUD_DIR = previousRemote;
    }
    const manifestPath = path.join(root, "hq/research/library/catalog/an-example-book.json");
    await expect(readFile(path.join(root, "hq/research/library/catalog/failed-book.json")))
      .rejects.toThrow();
    const published = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(published).toMatchObject({
      schemaVersion: "research-library-book-2",
      slug: "an-example-book",
      sourceDirectory: "researcher_example-book",
      bundle: { bucket }, reader: { bucket, format: "docling-html-embedded-v1" },
    });
    expect(await readFile(path.join(source, "source.md"), "utf8")).toBe("unchanged");
  });

  it("keeps the browser entry free of Node-only imports", async () => {
    const source = await readFile(new URL("../src/research-library/client.ts", import.meta.url), "utf8");
    expect(source).not.toContain("node:fs");
    expect(source).not.toContain("node:path");
    expect(source).not.toContain("./server");
  });
});
