import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseBatch, type QaCommentBatch } from "../src/qa/comments.js";
import { BatchClaimedError, claimNextBatch, listPending, readBatchClaim, releaseBatchClaim, resolveBatch, showBatch, writePendingBatch } from "../src/qa/store.js";
import { dispatchQaComments } from "../src/cli/qa.js";
import { isResponderActive, loadResponderConfig, requestResponderStop, responderStatus, runQaResponder } from "../src/qa/responder.js";
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
    const resolvedFile = join(again!.path, "batch.json");
    const original = await readFile(resolvedFile, "utf8");
    expect(await resolveBatch(root, sample().id, "second-agent")).toEqual(resolved);
    expect(await readFile(resolvedFile, "utf8")).toBe(original);
  });

  it("CLI pending prints nothing for an empty inbox", async () => {
    root = await mkdtemp(join(tmpdir(), "morpheus-qa-"));
    const code = await dispatchQaComments(root, "pending", []);
    expect(code).toBe(0);
  });

  it("queues later batches while two agents own distinct earlier batches", async () => {
    root = await mkdtemp(join(tmpdir(), "morpheus-qa-"));
    const first = sample("20261002T192800Z-ab12");
    const second = sample("20261002T192801Z-ab12");
    const third = sample("20261002T192802Z-ab12");
    await writePendingBatch(root, first, Buffer.from("first-frame"));
    await writePendingBatch(root, second);

    const [a, b] = await Promise.all([
      claimNextBatch(root, "claude:session-a"),
      claimNextBatch(root, "codex:session-b"),
    ]);
    expect(new Set([a?.id, b?.id])).toEqual(new Set([first.id, second.id]));
    expect(await claimNextBatch(root, "grok:session-c")).toBeNull();

    await writePendingBatch(root, third);
    expect((await listPending(root)).map((batch) => batch.id)).toEqual([first.id, second.id, third.id]);
    expect((await claimNextBatch(root, "grok:session-c"))?.id).toBe(third.id);
    expect(await readFile(join(root, "local/qa-comments/pending", first.id, "frame.png"), "utf8")).toBe("first-frame");
  });

  it("keeps a claimed batch pending until its owner resolves or releases it", async () => {
    root = await mkdtemp(join(tmpdir(), "morpheus-qa-"));
    await writePendingBatch(root, sample());
    const claim = await claimNextBatch(root, "codex:qa-session");
    expect(claim?.id).toBe(sample().id);
    await expect(resolveBatch(root, sample().id, "claude:other-session")).rejects.toThrow(BatchClaimedError);
    expect((await listPending(root)).map((batch) => batch.id)).toEqual([sample().id]);
    await expect(releaseBatchClaim(root, sample().id, "claude:other-session")).rejects.toThrow(BatchClaimedError);
    expect((await readBatchClaim(root, sample().id))?.agent).toBe("codex:qa-session");

    expect((await resolveBatch(root, sample().id, "codex:qa-session"))?.status).toBe("resolved");
    expect(await readBatchClaim(root, sample().id)).toBeNull();
    expect(await listPending(root)).toEqual([]);
  });

  it("can explicitly recover an abandoned claim without discarding its comments", async () => {
    root = await mkdtemp(join(tmpdir(), "morpheus-qa-"));
    await writePendingBatch(root, sample());
    await claimNextBatch(root, "codex:dead-session");
    expect(await releaseBatchClaim(root, sample().id, "operator", true)).toBe(true);
    expect((await claimNextBatch(root, "claude:new-session"))?.id).toBe(sample().id);
    expect((await showBatch(root, sample().id))?.batch.comments).toEqual(sample().comments);
  });

  it("CLI claim and resolve use the same agent identity", async () => {
    root = await mkdtemp(join(tmpdir(), "morpheus-qa-"));
    await writePendingBatch(root, sample());
    expect(await dispatchQaComments(root, "claim", ["--agent", "codex:qa-session"])).toBe(0);
    expect((await readBatchClaim(root, sample().id))?.agent).toBe("codex:qa-session");
    expect(await dispatchQaComments(root, "resolve", [sample().id, "--agent", "claude:other"])).toBe(1);
    expect(await dispatchQaComments(root, "resolve", [sample().id, "--agent", "codex:qa-session"])).toBe(0);
    expect((await showBatch(root, sample().id))?.batch.resolvedBy).toBe("codex:qa-session");
  });

  it("never hands out a batch while an unclaimed resolver takes ownership", async () => {
    root = await mkdtemp(join(tmpdir(), "morpheus-qa-"));
    for (let i = 0; i < 60; i++) {
      const id = `race-${i}`;
      await writePendingBatch(root, sample(id));
      const [resolution, competingClaim] = await Promise.allSettled([
        resolveBatch(root, id, "agent-a"),
        claimNextBatch(root, "agent-b"),
      ]);
      const aResolved = resolution.status === "fulfilled" && resolution.value?.status === "resolved";
      const bClaimed = competingClaim.status === "fulfilled" && competingClaim.value?.id === id;
      expect(aResolved && bClaimed, `batch ${id} was both resolved and claimed`).toBe(false);
      if (bClaimed) {
        expect((await showBatch(root, id))?.batch.status).toBe("pending");
        await resolveBatch(root, id, "agent-b");
      } else {
        expect(aResolved, `batch ${id} was neither resolved nor claimed`).toBe(true);
      }
      expect(await readBatchClaim(root, id)).toBeNull();
    }
  });
});

describe("QA background responder", () => {
  let root: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("serially handles a batch sent during work and exposes checkout ownership", async () => {
    root = await mkdtemp(join(tmpdir(), "morpheus-qa-responder-"));
    const first = sample("responder-first");
    const second = sample("responder-second");
    await writePendingBatch(root, first);
    const script = join(root, "fake-agent.cjs");
    await writeFile(script, `const fs = require("node:fs");
const path = require("node:path");
const root = process.env.MORPHEUS_QA_ROOT;
const id = process.env.MORPHEUS_QA_BATCH_ID;
fs.appendFileSync(path.join(root, "invocations.txt"), id + ":start\\n");
setTimeout(() => {
  const from = path.join(root, "local/qa-comments/pending", id);
  const to = path.join(root, "local/qa-comments/resolved", id);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  const record = JSON.parse(fs.readFileSync(path.join(to, "batch.json"), "utf8"));
  record.status = "resolved";
  record.resolvedBy = process.env.MORPHEUS_QA_AGENT;
  record.resolvedAt = new Date().toISOString();
  fs.writeFileSync(path.join(to, "batch.json"), JSON.stringify(record));
  fs.unlinkSync(path.join(root, "local/qa-comments/claims", id + ".json"));
  fs.appendFileSync(path.join(root, "invocations.txt"), id + ":done\\n");
}, 120);
`, "utf8");
    await mkdir(join(root, "local/qa-comments"), { recursive: true });
    await writeFile(join(root, "local/qa-comments/responder.json"), JSON.stringify({ agent: "codex:background", command: [process.execPath, script], pollMs: 250 }));
    const config = await loadResponderConfig(root);
    const controller = new AbortController();
    const worker = runQaResponder(root, config, controller.signal, () => undefined);
    try {
      for (let i = 0; i < 50; i++) {
        const marker = await responderStatus(root);
        if (marker && (await readFile(join(root, "invocations.txt"), "utf8").catch(() => "")).includes("responder-first:start")) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect((await responderStatus(root))?.agent).toBe("codex:background");
      expect(await isResponderActive(root)).toBe(true);
      await writePendingBatch(root, second);
      for (let i = 0; i < 100; i++) {
        if ((await showBatch(root, second.id))?.batch.status === "resolved") break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect((await showBatch(root, first.id))?.batch.status).toBe("resolved");
      expect((await showBatch(root, second.id))?.batch.status).toBe("resolved");
      expect(await readBatchClaim(root, first.id)).toBeNull();
      expect(await readBatchClaim(root, second.id)).toBeNull();
      expect(await readFile(join(root, "invocations.txt"), "utf8")).toBe("responder-first:start\nresponder-first:done\nresponder-second:start\nresponder-second:done\n");
    } finally {
      controller.abort();
      await worker;
    }
    expect(await responderStatus(root)).toBeNull();
    expect(await isResponderActive(root)).toBe(false);
  });

  it("rejects a second checkout owner and stops cleanly on request", async () => {
    root = await mkdtemp(join(tmpdir(), "morpheus-qa-responder-"));
    const config = { agent: "codex:one", command: [process.execPath, "-e", ""], pollMs: 250 };
    const controller = new AbortController();
    const worker = runQaResponder(root, config, controller.signal, () => undefined);
    try {
      for (let i = 0; i < 50 && !await responderStatus(root); i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await expect(runQaResponder(root, { ...config, agent: "claude:two" }, new AbortController().signal)).rejects.toThrow(/already owns/);
      expect(await requestResponderStop(root)).toBe(true);
      await worker;
      expect(await responderStatus(root)).toBeNull();
    } finally {
      controller.abort();
      await worker;
    }
  });

  it("preserves a failed child's batch and claim for recovery", async () => {
    root = await mkdtemp(join(tmpdir(), "morpheus-qa-responder-"));
    await writePendingBatch(root, sample("failed-child"));
    const config = { agent: "codex:failed", command: [process.execPath, "-e", "process.exit(2)"], pollMs: 250 };
    await expect(runQaResponder(root, config, new AbortController().signal, () => undefined)).rejects.toThrow(/command exited 2/);
    expect((await showBatch(root, "failed-child"))?.batch.status).toBe("pending");
    expect((await readBatchClaim(root, "failed-child"))?.agent).toBe("codex:failed");
    expect(await responderStatus(root)).toBeNull();
  });

  it("treats a malformed responder marker as inactive", async () => {
    root = await mkdtemp(join(tmpdir(), "morpheus-qa-responder-"));
    const lock = join(root, "local/qa-comments/responder.lock");
    await mkdir(lock, { recursive: true });
    await writeFile(join(lock, "owner.json"), "{invalid", "utf8");
    expect(await isResponderActive(root)).toBe(false);
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
      headers: { "Content-Type": "application/json", Origin: new URL(server.url).origin, "Sec-Fetch-Site": "same-origin" },
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
    const created = (await res.json()) as { id: string; path: string; pendingCount: number; wakeConfigured: boolean };
    expect(created.id).toMatch(/Z-/);
    expect(created.pendingCount).toBe(1);
    expect(created.wakeConfigured).toBe(false);

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

    const local = await fetch(`${server.url}api/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: `http://localhost:${server.port}`, "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ comments: sample().comments }),
    });
    expect(local.status).toBe(201);
    expect(((await local.json()) as { pendingCount: number }).pendingCount).toBe(2);
    for (const [origin, site] of [
      [`http://localhost:${server.port + 1}`, "same-origin"],
      [`https://localhost:${server.port}`, "same-origin"],
      [`http://localhost.evil.example:${server.port}`, "same-origin"],
      ["null", "same-origin"],
      [`http://localhost:${server.port}`, "cross-site"],
      [`http://127.0.0.1:${server.port}`, "cross-site"],
    ]) {
      const refused = await fetch(`${server.url}api/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin!, "Sec-Fetch-Site": site! },
        body: JSON.stringify({ comments: sample().comments }),
      });
      expect(refused.status, `${origin} / ${site}`).toBe(403);
    }
    expect(await listPending(root)).toHaveLength(2);
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

    for (const empty of ["", "   "]) {
      process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_URL = empty;
      expect(await resolveWebhookConfig(root)).toBeNull();
    }
    delete process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_URL;
    process.env.MORPHEUS_QA_COMMENTS_WEBHOOK_AUTHORIZATION = "";
    expect(await resolveWebhookConfig(root)).toEqual({ url: "http://127.0.0.1:9/from-file" });
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
    const created = (await res.json()) as { id: string; wakeConfigured: boolean };
    expect(created.wakeConfigured).toBe(true);

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
