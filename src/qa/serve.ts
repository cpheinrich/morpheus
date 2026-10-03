import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writePendingBatch } from "./store.js";
import type { QaCommentBatch } from "./comments.js";
import { QA_COMMENTS_PENDING, parseBatch } from "./comments.js";
import { notifyBatchPending, QA_COMMENTS_WEBHOOK_FILE, resolveWebhookConfig } from "./webhook.js";
import { pageHtml } from "./overlay-page.js";

export interface ServeOptions {
  /** Project checkout that receives local/qa-comments/ (e.g. Evo). */
  root: string;
  /** Upstream preview (serve-sim) origin, e.g. http://127.0.0.1:3200/ */
  previewUrl: string;
  /** Port for this overlay. 0 = ephemeral. */
  port: number;
  /** Value written into batch.project; defaults to morpheus.json name. */
  project?: string;
  /** Optional explicit MJPEG URL; otherwise discovered. */
  streamUrl?: string;
  /** Called once listening. */
  onListen?: (info: { url: string; port: number; streamUrl: string | null }) => void;
}

function normalizeOrigin(raw: string): string {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Preview URL must be http(s); got ${u.protocol}`);
  }
  if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") {
    throw new Error(
      `Preview URL must stay on 127.0.0.1/localhost (got ${u.hostname}). Do not bind QA comments to the LAN.`,
    );
  }
  return `${u.protocol}//${u.host}`;
}

async function readProjectName(root: string): Promise<string> {
  try {
    const m = JSON.parse(await readFile(join(root, "morpheus.json"), "utf8")) as { name?: string };
    if (m.name) return m.name;
  } catch {
    /* fall through */
  }
  return "project";
}

/** Find serve-sim's MJPEG URL for a preview origin by reading its local state files. */
export async function discoverStreamUrl(previewOrigin: string): Promise<string | null> {
  const origin = normalizeOrigin(previewOrigin);
  const previewPort = Number(new URL(origin).port || (origin.startsWith("https") ? 443 : 80));
  const dir = join(tmpdir(), "serve-sim");
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    files = [];
  }
  for (const name of files.filter((f) => f.startsWith("server-") && f.endsWith(".json"))) {
    try {
      const rec = JSON.parse(await readFile(join(dir, name), "utf8")) as {
        port?: number;
        device?: string;
        streamUrl?: string;
        udid?: string;
      };
      if (rec.port !== previewPort) continue;
      if (typeof rec.streamUrl === "string" && rec.streamUrl.includes("stream.mjpeg")) {
        return rec.streamUrl.replace("localhost", "127.0.0.1");
      }
      const udid = rec.device ?? rec.udid;
      if (udid) return `${origin}/helper/${encodeURIComponent(udid)}/stream.mjpeg`;
    } catch {
      /* skip bad records */
    }
  }
  // Probe common helper listing via /api if present.
  try {
    const res = await fetch(`${origin}/api`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/\/helper\/[^"\\\s]+\/stream\.mjpeg/);
      if (match) return `${origin}${match[0]}`;
    }
  } catch {
    /* optional */
  }
  return null;
}

function newBatchId(): string {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${suffix}`;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = `${JSON.stringify(body, null, 2)}\n`;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function proxyRequest(target: string, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(target);
  const lib = url.protocol === "https:" ? httpsRequest : httpRequest;
  // Forward only what the MJPEG helper needs. Spreading IncomingHttpHeaders and
  // deleting `host` does not typecheck: assigning host makes it required, and
  // the request below sets host itself.
  const upstream = lib(
    {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: req.method,
      headers: { host: url.host, accept: req.headers.accept ?? "*/*" },
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, {
        "Content-Type": up.headers["content-type"] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    if (!res.headersSent) sendJson(res, 502, { error: String(err) });
    else res.destroy(err);
  });
  // MJPEG/stream GETs have no body.
  if (req.method === "GET" || req.method === "HEAD") upstream.end();
  else req.pipe(upstream);
}


function udidFromStreamUrl(streamUrl: string | null): string | null {
  if (!streamUrl) return null;
  try {
    const path = new URL(streamUrl).pathname;
    const m = /\/helper\/([^/]+)\/stream\.mjpeg$/.exec(path);
    return m ? decodeURIComponent(m[1]!) : null;
  } catch {
    return null;
  }
}

interface HidBridge {
  sendTouch: (type: "begin" | "move" | "end", normX: number, normY: number) => void;
  sendKey: (type: "down" | "up", usage: number) => void;
  close: () => void;
}

/**
 * serve-sim's Indigo HID path takes x/y in 0..1 of the screen (see its preview
 * client and HIDInjector "normalized 0..1"). Framebuffer pixels (1206×2622)
 * land off the point-space screen and the simulator ignores the tap.
 */
export function hidTouchBody(
  type: "begin" | "move" | "end",
  normX: number,
  normY: number,
): { type: "begin" | "move" | "end"; x: number; y: number } {
  return {
    type,
    x: Math.min(1, Math.max(0, normX)),
    y: Math.min(1, Math.max(0, normY)),
  };
}

/** USB HID usage page 0x07, same table as the serve-sim preview client (KeyboardEvent.code). */
export const HID_KEY_USAGE: Readonly<Record<string, number>> = {
  KeyA: 4, KeyB: 5, KeyC: 6, KeyD: 7, KeyE: 8, KeyF: 9, KeyG: 10, KeyH: 11, KeyI: 12,
  KeyJ: 13, KeyK: 14, KeyL: 15, KeyM: 16, KeyN: 17, KeyO: 18, KeyP: 19, KeyQ: 20,
  KeyR: 21, KeyS: 22, KeyT: 23, KeyU: 24, KeyV: 25, KeyW: 26, KeyX: 27, KeyY: 28, KeyZ: 29,
  Digit1: 30, Digit2: 31, Digit3: 32, Digit4: 33, Digit5: 34, Digit6: 35, Digit7: 36,
  Digit8: 37, Digit9: 38, Digit0: 39,
  Enter: 40, Escape: 41, Backspace: 42, Tab: 43, Space: 44,
  Minus: 45, Equal: 46, BracketLeft: 47, BracketRight: 48, Backslash: 49,
  Semicolon: 51, Quote: 52, Backquote: 53, Comma: 54, Period: 55, Slash: 56,
  ArrowRight: 79, ArrowLeft: 80, ArrowDown: 81, ArrowUp: 82,
  ShiftLeft: 225, ShiftRight: 229,
};

/** Opcode 6 payload: { type: "down"|"up", usage }. */
export function hidKeyBody(
  type: "down" | "up",
  code: string,
): { type: "down" | "up"; usage: number } | null {
  const usage = HID_KEY_USAGE[code];
  if (usage === undefined) return null;
  return { type, usage };
}

async function openHidBridge(previewOrigin: string, udid: string): Promise<HidBridge | null> {
  const wsUrl = `${previewOrigin.replace(/^http/, "ws")}/helper/${encodeURIComponent(udid)}/ws`;
  let ws: WebSocket | null = null;
  let closed = false;
  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      ws.addEventListener("close", () => {
        ws = null;
        if (!closed) setTimeout(connect, 1000);
      });
      ws.addEventListener("error", () => {
        /* close handler reconnects */
      });
    } catch {
      ws = null;
    }
  };
  connect();

  return {
    sendTouch(type, normX, normY) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const payload = Buffer.from(JSON.stringify(hidTouchBody(type, normX, normY)));
      ws.send(Buffer.concat([Buffer.from([3]), payload]));
    },
    sendKey(type, usage) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const payload = Buffer.from(JSON.stringify({ type, usage }));
      // Opcode 6, same as the serve-sim preview keyboard channel.
      ws.send(Buffer.concat([Buffer.from([6]), payload]));
    },
    close() {
      closed = true;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = null;
    },
  };
}


function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Browser pages on other origins can POST to loopback without a preflight. */
function refuseCrossOriginPost(req: IncomingMessage, res: ServerResponse, ownOrigin: string): boolean {
  if (req.method !== "POST") return false;
  const site = headerValue(req.headers["sec-fetch-site"]);
  const origin = headerValue(req.headers.origin);
  const type = (headerValue(req.headers["content-type"]) ?? "").toLowerCase();
  if (site === "cross-site" || (origin !== undefined && origin !== ownOrigin) || !type.startsWith("application/json")) {
    sendJson(res, 403, { error: "cross-origin POST refused" });
    return true;
  }
  return false;
}

export async function startQaCommentServer(options: ServeOptions): Promise<{
  url: string;
  port: number;
  close: () => Promise<void>;
  streamUrl: string | null;
}> {
  const previewOrigin = normalizeOrigin(options.previewUrl);
  const previewUrl = options.previewUrl.endsWith("/")
    ? options.previewUrl
    : `${options.previewUrl}/`;
  const project = options.project ?? (await readProjectName(options.root));
  const discovered =
    options.streamUrl ?? (await discoverStreamUrl(previewOrigin));
  const streamPath = discovered ? "/proxy/stream.mjpeg" : null;
  const udid = udidFromStreamUrl(discovered);
  const hid = udid ? await openHidBridge(previewOrigin, udid) : null;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const bound = server.address();
      const boundPort = bound && typeof bound !== "string" ? bound.port : options.port;
      if (refuseCrossOriginPost(req, res, `http://127.0.0.1:${boundPort}`)) return;
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(pageHtml({ previewUrl, streamPath, project }));
        return;
      }
      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, {
          ok: true,
          previewUrl,
          streamUrl: discovered,
          project,
          root: options.root,
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/proxy/stream.mjpeg") {
        if (!discovered) {
          sendJson(res, 404, { error: "No MJPEG stream discovered for this preview" });
          return;
        }
        proxyRequest(discovered, req, res);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/touch") {
        if (!hid) {
          sendJson(res, 503, { error: "No HID bridge (stream/udid undiscovered)" });
          return;
        }
        const raw = JSON.parse((await readBody(req)).toString("utf8")) as {
          type?: string;
          normX?: number;
          normY?: number;
        };
        if (raw.type !== "begin" && raw.type !== "move" && raw.type !== "end") {
          sendJson(res, 400, { error: "type must be begin|move|end" });
          return;
        }
        const normX = Number(raw.normX);
        const normY = Number(raw.normY);
        if (!Number.isFinite(normX) || !Number.isFinite(normY)) {
          sendJson(res, 400, { error: "normX/normY required" });
          return;
        }
        hid.sendTouch(raw.type, Math.min(1, Math.max(0, normX)), Math.min(1, Math.max(0, normY)));
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/key") {
        if (!hid) {
          sendJson(res, 503, { error: "No HID bridge (stream/udid undiscovered)" });
          return;
        }
        const raw = JSON.parse((await readBody(req)).toString("utf8")) as {
          type?: string;
          code?: string;
        };
        if (raw.type !== "down" && raw.type !== "up") {
          sendJson(res, 400, { error: "type must be down|up" });
          return;
        }
        const body = hidKeyBody(raw.type, String(raw.code ?? ""));
        if (!body) {
          sendJson(res, 400, { error: "unsupported key code" });
          return;
        }
        hid.sendKey(body.type, body.usage);
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/batches") {
        const raw = JSON.parse((await readBody(req)).toString("utf8")) as {
          preview?: { url: string; kind?: "serve-sim" | "web" | "other"; label?: string };
          comments: Array<{
            id: string;
            text: string;
            createdAt: string;
            anchor: { normX?: number; normY?: number; x?: number; y?: number; w?: number; h?: number };
          }>;
          frame?: {
            path?: string;
            width: number;
            height: number;
            capturedAt?: string;
            dataUrl?: string;
          };
        };
        if (!Array.isArray(raw.comments) || raw.comments.length === 0) {
          sendJson(res, 400, { error: "comments required" });
          return;
        }
        const id = newBatchId();
        let frameBytes: Buffer | undefined;
        let frameMeta: { path?: "frame.png"; width: number; height: number; capturedAt: string } | undefined = raw.frame
          ? {
              width: raw.frame.width,
              height: raw.frame.height,
              ...(raw.frame.capturedAt ? { capturedAt: raw.frame.capturedAt } : { capturedAt: new Date().toISOString() }),
            }
          : undefined;
        if (raw.frame?.dataUrl?.startsWith("data:image/png;base64,")) {
          frameBytes = Buffer.from(raw.frame.dataUrl.slice("data:image/png;base64,".length), "base64");
          frameMeta = {
            path: "frame.png",
            width: raw.frame.width,
            height: raw.frame.height,
            capturedAt: new Date().toISOString(),
          };
        }
        const batch: QaCommentBatch = parseBatch({
          version: 1,
          id,
          project,
          createdAt: new Date().toISOString(),
          preview: raw.preview ?? { url: previewUrl, kind: "serve-sim" },
          ...(frameMeta ? { frame: frameMeta } : {}),
          comments: raw.comments,
          status: "pending",
        });
        const path = await writePendingBatch(options.root, batch, frameBytes);
        const webhook = await resolveWebhookConfig(options.root);
        if (webhook) {
          notifyBatchPending(
            webhook.url,
            {
              event: "qa.comments.batch_pending",
              id,
              project,
              root: options.root,
              pendingDir: join(options.root, QA_COMMENTS_PENDING),
              path,
              commentCount: batch.comments.length,
              createdAt: batch.createdAt,
            },
            webhook.authorization ? { authorization: webhook.authorization } : undefined,
          );
        } else {
          console.log(
            `qa comments webhook: unset — batch ${id} written; set MORPHEUS_QA_COMMENTS_WEBHOOK_URL or ${QA_COMMENTS_WEBHOOK_FILE} to wake an agent`,
          );
        }
        sendJson(res, 201, { id, path });
        return;
      }
      sendJson(res, 404, { error: "not found" });
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to bind QA comments server");
  }
  const info = {
    url: `http://127.0.0.1:${address.port}/`,
    port: address.port,
    streamUrl: discovered,
  };
  options.onListen?.(info);

  return {
    ...info,
    close: () =>
      new Promise<void>((resolve, reject) => {
        hid?.close();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
