import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseBatch, type QaCommentBatch } from "../src/qa/comments.js";
import { listPending, resolveBatch, showBatch, writePendingBatch } from "../src/qa/store.js";
import { dispatchQaComments } from "../src/cli/qa.js";
import { hidKeyBody, hidTouchBody, startQaCommentServer } from "../src/qa/serve.js";
import { TouchPacer, type TouchEvent } from "../src/qa/touch-pacer.js";
import {
  authorizationHeaderValue,
  QA_COMMENTS_WEBHOOK_FILE,
  resolveWebhookConfig,
} from "../src/qa/webhook.js";

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

describe("serve-sim touch payload", () => {
  it("sends normalized 0..1 coordinates, not framebuffer pixels", () => {
    expect(hidTouchBody("begin", 0.5, 0.25)).toEqual({ type: "begin", x: 0.5, y: 0.25 });
    expect(hidTouchBody("end", 1.4, -0.2)).toEqual({ type: "end", x: 1, y: 0 });
  });

  it("maps keyboard codes to USB HID usages (opcode 6)", () => {
    expect(hidKeyBody("down", "KeyA")).toEqual({ type: "down", usage: 4 });
    expect(hidKeyBody("up", "Enter")).toEqual({ type: "up", usage: 40 });
    expect(hidKeyBody("down", "Backspace")).toEqual({ type: "down", usage: 42 });
    expect(hidKeyBody("down", "ArrowLeft")).toEqual({ type: "down", usage: 80 });
    expect(hidKeyBody("down", "Unmapped")).toBeNull();
  });
});

describe("touch pacer", () => {
  function harness(opts: { minHoldMs?: number; orphanGraceMs?: number } = {}) {
    let clock = 1000;
    const timers: Array<{ at: number; fn: () => void; id: number }> = [];
    let nextId = 1;
    const sent: TouchEvent[] = [];
    const pacer = new TouchPacer((e) => sent.push(e), {
      minHoldMs: 40,
      orphanGraceMs: 120,
      ...opts,
      now: () => clock,
      schedule: (fn, ms) => {
        const id = nextId++;
        timers.push({ at: clock + ms, fn, id });
        return id;
      },
      cancel: (handle) => {
        const i = timers.findIndex((t) => t.id === handle);
        if (i >= 0) timers.splice(i, 1);
      },
    });
    const advance = (ms: number) => {
      const target = clock + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > target) break;
        timers.shift();
        clock = next.at;
        next.fn();
      }
      clock = target;
    };
    return { pacer, sent, advance, types: () => sent.map((e) => e.type) };
  }

  it("holds an instant tap for the minimum duration", () => {
    const h = harness();
    h.pacer.push({ type: "begin", x: 0.5, y: 0.5 });
    h.pacer.push({ type: "end", x: 0.5, y: 0.5 });
    expect(h.types()).toEqual(["begin"]);
    h.advance(39);
    expect(h.types()).toEqual(["begin"]);
    h.advance(1);
    expect(h.types()).toEqual(["begin", "end"]);
  });

  it("passes a human-length tap through unchanged", () => {
    const h = harness();
    h.pacer.push({ type: "begin", x: 0.1, y: 0.2 });
    h.advance(100);
    h.pacer.push({ type: "move", x: 0.11, y: 0.2 });
    h.pacer.push({ type: "end", x: 0.11, y: 0.2 });
    expect(h.sent).toEqual([
      { type: "begin", x: 0.1, y: 0.2 },
      { type: "move", x: 0.11, y: 0.2 },
      { type: "end", x: 0.11, y: 0.2 },
    ]);
  });

  it("pairs an end that arrived before its begin, in the right order", () => {
    const h = harness();
    h.pacer.push({ type: "end", x: 0.5, y: 0.5 });
    expect(h.types()).toEqual([]);
    h.advance(10);
    h.pacer.push({ type: "begin", x: 0.5, y: 0.5 });
    expect(h.types()).toEqual(["begin"]);
    h.advance(40);
    expect(h.types()).toEqual(["begin", "end"]);
    expect(h.pacer.droppedEnds).toBe(0);
  });

  it("drops an end that never gets a begin, and never leaves a finger down", () => {
    const h = harness();
    h.pacer.push({ type: "end", x: 0.5, y: 0.5 });
    h.advance(120);
    expect(h.types()).toEqual([]);
    expect(h.pacer.droppedEnds).toBe(1);
    h.pacer.push({ type: "begin", x: 0.5, y: 0.5 });
    h.advance(100);
    h.pacer.push({ type: "end", x: 0.5, y: 0.5 });
    expect(h.types()).toEqual(["begin", "end"]);
  });

  it("ends a finger that is still down when a new tap begins", () => {
    const h = harness();
    h.pacer.push({ type: "begin", x: 0.2, y: 0.2 });
    h.advance(500);
    h.pacer.push({ type: "begin", x: 0.8, y: 0.8 });
    h.advance(100);
    h.pacer.push({ type: "end", x: 0.8, y: 0.8 });
    expect(h.sent).toEqual([
      { type: "begin", x: 0.2, y: 0.2 },
      { type: "end", x: 0.8, y: 0.8 },
      { type: "begin", x: 0.8, y: 0.8 },
      { type: "end", x: 0.8, y: 0.8 },
    ]);
  });

  it("holds the synthesized end when a new tap begins right after the old one", () => {
    const h = harness();
    h.pacer.push({ type: "begin", x: 0.2, y: 0.2 });
    h.advance(10);
    h.pacer.push({ type: "begin", x: 0.8, y: 0.8 });
    expect(h.types()).toEqual(["begin"]);
    h.advance(29);
    expect(h.types()).toEqual(["begin"]);
    h.advance(1);
    expect(h.sent.slice(1)).toEqual([
      { type: "end", x: 0.8, y: 0.8 },
      { type: "begin", x: 0.8, y: 0.8 },
    ]);
    h.pacer.push({ type: "end", x: 0.8, y: 0.8 });
    expect(h.types()).toEqual(["begin", "end", "begin"]);
    h.advance(40);
    expect(h.types()).toEqual(["begin", "end", "begin", "end"]);
  });

  it("queues a second tap behind a held end instead of interleaving", () => {
    const h = harness();
    h.pacer.push({ type: "begin", x: 0.5, y: 0.5 });
    h.pacer.push({ type: "end", x: 0.5, y: 0.5 });
    h.pacer.push({ type: "begin", x: 0.6, y: 0.6 });
    h.pacer.push({ type: "end", x: 0.6, y: 0.6 });
    expect(h.types()).toEqual(["begin"]);
    h.advance(40);
    expect(h.types()).toEqual(["begin", "end", "begin"]);
    h.advance(40);
    expect(h.types()).toEqual(["begin", "end", "begin", "end"]);
  });

  it("ignores a move with no finger down", () => {
    const h = harness();
    h.pacer.push({ type: "move", x: 0.5, y: 0.5 });
    expect(h.types()).toEqual([]);
  });
});

describe("qa comments serve", () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (closers.length) {
      const close = closers.pop();
      if (close) await close();
    }
  });

  it("serves the overlay and writes a batch via POST /api/batches", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-qa-serve-"));
    closers.push(async () => rm(root, { recursive: true, force: true }));
    await writeFile(join(root, "morpheus.json"), JSON.stringify({ name: "evo", prefix: "EV" }), "utf8");

    // Tiny upstream "preview" so health/proxy paths have something reachable.
    const upstream = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("preview-ok");
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    closers.push(
      () =>
        new Promise<void>((resolve, reject) =>
          upstream.close((err) => (err ? reject(err) : resolve())),
        ),
    );
    const upAddr = upstream.address();
    if (!upAddr || typeof upAddr === "string") throw new Error("no upstream port");
    const previewUrl = `http://127.0.0.1:${upAddr.port}/`;

    const server = await startQaCommentServer({
      root,
      previewUrl,
      port: 0,
      project: "evo",
    });
    closers.push(server.close);

    const health = await fetch(`${server.url}health`);
    expect(health.ok).toBe(true);
    const healthJson = (await health.json()) as { project: string; previewUrl: string };
    expect(healthJson.project).toBe("evo");
    expect(healthJson.previewUrl).toBe(previewUrl);

    const home = await fetch(server.url);
    expect(home.ok).toBe(true);
    const html = await home.text();
    expect(html).toContain("sessionStorage.setItem(storageKey");
    expect(html).toContain("'morpheus-qa-comments:' + project + ':' + previewUrl");
    expect(html).toContain("Right click to add comment");
    expect(html).toContain(previewUrl);
    expect(html).toContain("pointer-events: none");
    expect(html).toContain("function contentBox");

    const res = await fetch(`${server.url}api/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preview: { url: previewUrl, kind: "serve-sim" },
        comments: [
          {
            id: "c1",
            text: "Ship it",
            createdAt: "2026-10-02T12:30:00-07:00",
            anchor: { normX: 0.4, normY: 0.6 },
          },
        ],
        frame: { width: 100, height: 200 },
      }),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; path: string };
    expect(created.id).toMatch(/Z-/);

    const pending = await listPending(root);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(created.id);
    const disk = JSON.parse(await readFile(join(created.path, "batch.json"), "utf8"));
    expect(disk.comments[0].text).toBe("Ship it");
    expect(disk.project).toBe("evo");
    expect(disk.frame?.path).toBeUndefined();

    const evil = await fetch(`${server.url}api/batches`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", Origin: "http://evil.example" },
      body: JSON.stringify({
        comments: [
          {
            id: "c-evil",
            text: "injected",
            createdAt: "2026-10-02T12:31:00-07:00",
            anchor: { normX: 0.1, normY: 0.1 },
          },
        ],
      }),
    });
    expect(evil.status).toBe(403);
    expect(await listPending(root)).toHaveLength(1);
  });

  it("refuses non-loopback preview hosts", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-qa-serve-"));
    closers.push(async () => rm(root, { recursive: true, force: true }));
    await expect(
      startQaCommentServer({
        root,
        previewUrl: "http://192.168.1.10:3200/",
        port: 0,
      }),
    ).rejects.toThrow(/127\.0\.0\.1/);
  });
});

describe("qa comments webhook", () => {
  const closers: Array<() => Promise<void>> = [];
  const prevEnv = process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_URL;
  const prevAuth = process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_AUTHORIZATION;

  afterEach(async () => {
    if (prevEnv === undefined) delete process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_URL;
    else process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_URL = prevEnv;
    if (prevAuth === undefined) delete process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_AUTHORIZATION;
    else process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_AUTHORIZATION = prevAuth;
    while (closers.length) {
      const close = closers.pop();
      if (close) await close();
    }
  });

  it("resolves file config and env overrides for url and authorization", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-qa-hook-"));
    closers.push(async () => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, "local/qa-comments"), { recursive: true });
    await writeFile(
      join(root, QA_COMMENTS_WEBHOOK_FILE),
      JSON.stringify({
        url: "http://127.0.0.1:9/from-file",
        authorization: "Bearer file-token",
      }),
      "utf8",
    );

    delete process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_URL;
    delete process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_AUTHORIZATION;
    expect(await resolveWebhookConfig(root)).toEqual({
      url: "http://127.0.0.1:9/from-file",
      authorization: "Bearer file-token",
    });

    process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_URL = "http://127.0.0.1:9/from-env";
    process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_AUTHORIZATION = "env-token";
    expect(await resolveWebhookConfig(root)).toEqual({
      url: "http://127.0.0.1:9/from-env",
      authorization: "env-token",
    });
  });

  it("normalizes Authorization to Bearer when missing the prefix", () => {
    expect(authorizationHeaderValue("Bearer already")).toBe("Bearer already");
    expect(authorizationHeaderValue("bare-token")).toBe("Bearer bare-token");
  });

  it("POSTs the wake webhook after a successful batch write without failing Send", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-qa-hook-serve-"));
    closers.push(async () => rm(root, { recursive: true, force: true }));
    await writeFile(join(root, "morpheus.json"), JSON.stringify({ name: "evo" }), "utf8");

    let received: unknown = null;
    let receivedAuth: string | undefined;
    const hook = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      receivedAuth = req.headers.authorization;
      received = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(200).end("ok");
    });
    await new Promise<void>((resolve) => hook.listen(0, "127.0.0.1", resolve));
    closers.push(
      () =>
        new Promise<void>((resolve, reject) =>
          hook.close((err) => (err ? reject(err) : resolve())),
        ),
    );
    const hookAddr = hook.address();
    if (!hookAddr || typeof hookAddr === "string") throw new Error("no hook port");
    process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_URL = `http://127.0.0.1:${hookAddr.port}/wake`;
    process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_AUTHORIZATION = "Bearer test-wake-key";

    const upstream = createServer((_req, res) => {
      res.writeHead(200).end("ok");
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    closers.push(
      () =>
        new Promise<void>((resolve, reject) =>
          upstream.close((err) => (err ? reject(err) : resolve())),
        ),
    );
    const upAddr = upstream.address();
    if (!upAddr || typeof upAddr === "string") throw new Error("no up port");

    const server = await startQaCommentServer({
      root,
      previewUrl: `http://127.0.0.1:${upAddr.port}/`,
      port: 0,
      project: "evo",
    });
    closers.push(server.close);

    const res = await fetch(`${server.url}api/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comments: [
          {
            id: "c1",
            text: "wake me",
            createdAt: "2026-10-02T12:50:00-07:00",
            anchor: { normX: 0.2, normY: 0.3 },
          },
        ],
        frame: { width: 10, height: 20 },
      }),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string };

    // Fire-and-forget — give the webhook a moment.
    for (let i = 0; i < 20 && !received; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(received).toMatchObject({
      event: "qa.comments.batch_pending",
      id: created.id,
      project: "evo",
      root,
      commentCount: 1,
    });
    expect((received as { pendingDir: string }).pendingDir).toContain("local/qa-comments/pending");
    expect(receivedAuth).toBe("Bearer test-wake-key");
  });
});
