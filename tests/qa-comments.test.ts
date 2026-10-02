import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseBatch, type QaCommentBatch } from "../src/qa/comments.js";
import { listPending, resolveBatch, showBatch, writePendingBatch } from "../src/qa/store.js";
import { dispatchQaComments } from "../src/cli/qa.js";

function sample(id = "20261002T192800Z-ab12"): QaCommentBatch {
  return {
    version: 1,
    id,
    project: "evo",
    createdAt: "2026-10-02T12:28:00-07:00",
    preview: { url: "http://127.0.0.1:9999/", kind: "serve-sim" },
    frame: { path: "frame.png", width: 390, height: 844 },
    comments: [
      {
        id: "c1",
        text: "Primary CTA looks clipped",
        createdAt: "2026-10-02T12:28:10-07:00",
        anchor: { normX: 0.5, normY: 0.82 },
      },
      {
        id: "c2",
        text: "Missing safe-area padding at top",
        createdAt: "2026-10-02T12:28:20-07:00",
        anchor: { x: 40, y: 12, w: 310, h: 48 },
      },
    ],
    status: "pending",
  };
}

describe("qa comment batches", () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("parses a valid batch and rejects a point-less anchor", () => {
    expect(parseBatch(sample()).comments).toHaveLength(2);
    expect(() =>
      parseBatch({
        ...sample(),
        comments: [{ id: "c", text: "x", createdAt: "t", anchor: { w: 10, h: 10 } }],
      }),
    ).toThrow(/anchor/);
  });

  it("lists, shows, and resolves pending batches on disk", async () => {
    root = await mkdtemp(join(tmpdir(), "morpheus-qa-"));
    await writePendingBatch(root, sample());

    const pending = await listPending(root);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.commentCount).toBe(2);

    const shown = await showBatch(root, sample().id);
    expect(shown?.batch.project).toBe("evo");

    const resolved = await resolveBatch(root, sample().id, "test");
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.resolvedBy).toBe("test");
    expect(await listPending(root)).toHaveLength(0);

    const again = await showBatch(root, sample().id);
    expect(again?.batch.status).toBe("resolved");
  });

  it("CLI pending prints nothing for an empty inbox", async () => {
    root = await mkdtemp(join(tmpdir(), "morpheus-qa-"));
    const code = await dispatchQaComments(root, "pending", []);
    expect(code).toBe(0);
  });
});
