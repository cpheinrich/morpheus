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
  const headers = { ...req.headers, host: url.host };
  delete headers["host"];
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

function pageHtml(opts: {
  previewUrl: string;
  streamPath: string | null;
  project: string;
}): string {
  const preview = JSON.stringify(opts.previewUrl);
  const streamPath = JSON.stringify(opts.streamPath);
  const project = JSON.stringify(opts.project);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Morpheus QA comments — ${opts.project}</title>
<style>
  :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0b0d10; color: #e8eaed; height: 100vh; display: flex; flex-direction: column; }
  header { display: flex; gap: 12px; align-items: center; padding: 10px 14px; border-bottom: 1px solid #22262c; background: #12151a; }
  header h1 { font-size: 14px; font-weight: 600; margin: 0; flex: 1; }
  header .meta { font-size: 12px; color: #9aa0a6; }
  .mode-controls { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .mode-controls .shortcut { font-size: 11px; color: #9aa0a6; letter-spacing: 0.02em; }
  .composer .shortcut-hint { font-size: 11px; color: #9aa0a6; }
  .btn { appearance: none; border: 1px solid #3c4043; background: #1e2228; color: #e8eaed; border-radius: 8px; padding: 7px 12px; font-size: 13px; cursor: pointer; }
  .btn:hover { background: #2a2f36; }
  .btn.primary { background: #8ab4f8; color: #0b0d10; border-color: #8ab4f8; font-weight: 600; }
  .btn.primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn.active { outline: 2px solid #8ab4f8; }
  main { flex: 1; display: grid; grid-template-columns: 1fr 320px; min-height: 0; }
  .stage-wrap { position: relative; background: #000; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .stage { position: relative; max-width: 100%; max-height: 100%; }
  .stage img, .stage iframe { display: block; max-width: 100%; max-height: calc(100vh - 52px); background: #111; }
  .stage iframe { width: min(430px, 100%); height: calc(100vh - 52px); border: 0; }
  .overlay { position: absolute; inset: 0; cursor: crosshair; display: none; }
  .overlay.on { display: block; }
  .pin { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: #fdd663; color: #0b0d10; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px #0b0d10; pointer-events: none; }
  aside { border-left: 1px solid #22262c; background: #12151a; display: flex; flex-direction: column; min-height: 0; }
  aside h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #9aa0a6; margin: 12px 14px 6px; }
  #drafts { list-style: none; margin: 0; padding: 0 10px; overflow: auto; flex: 1; }
  #drafts li { background: #1e2228; border-radius: 8px; padding: 10px; margin-bottom: 8px; font-size: 13px; }
  #drafts li .idx { color: #fdd663; font-weight: 700; margin-right: 6px; }
  #drafts li button { float: right; border: 0; background: transparent; color: #9aa0a6; cursor: pointer; }
  .composer { padding: 12px; border-top: 1px solid #22262c; display: flex; flex-direction: column; gap: 8px; }
  textarea { width: 100%; min-height: 72px; resize: vertical; border-radius: 8px; border: 1px solid #3c4043; background: #0b0d10; color: #e8eaed; padding: 8px; font: inherit; }
  .row { display: flex; gap: 8px; }
  .row .btn { flex: 1; }
  #status { font-size: 12px; color: #9aa0a6; min-height: 1.2em; }
  #status.ok { color: #81c995; }
  #status.err { color: #f28b82; }
  .hint { font-size: 12px; color: #9aa0a6; padding: 0 14px 10px; }
</style>
</head>
<body>
<header>
  <h1>QA comments · <span id="projectLabel"></span></h1>
  <span class="meta" id="modeLabel">Interact mode — drive the sim freely</span>
  <div class="mode-controls">
    <button class="btn" id="toggleMode" type="button">Comment mode</button>
    <span class="shortcut">Shift+C</span>
  </div>
  <button class="btn" id="openPreview" type="button">Open raw preview</button>
</header>
<main>
  <div class="stage-wrap">
    <div class="stage" id="stage">
      <iframe id="frame" title="preview" allow="autoplay"></iframe>
      <img id="stream" alt="simulator stream" hidden/>
      <div class="overlay" id="overlay" title="Tap to place a comment"></div>
    </div>
  </div>
  <aside>
    <h2>Comments in this batch</h2>
    <p class="hint">Switch to Comment mode, tap the frame, type, Add. Repeat, then Send.</p>
    <ul id="drafts"></ul>
    <div class="composer">
      <div id="status">Waiting for a tap…</div>
      <textarea id="text" placeholder="What should change here? (Enter to add, Shift+Enter for newline)" disabled></textarea>
      <div class="shortcut-hint">Enter adds · Shift+Enter newline</div>
      <div class="row">
        <button class="btn" id="add" type="button" disabled>Add comment</button>
        <button class="btn primary" id="send" type="button" disabled>Send batch</button>
      </div>
      <div class="shortcut-hint">⌘Enter / Ctrl+Enter sends the batch</div>
    </div>
  </aside>
</main>
<script>
(() => {
  const previewUrl = ${preview};
  const streamPath = ${streamPath};
  const project = ${project};
  document.getElementById('projectLabel').textContent = project;
  document.getElementById('openPreview').onclick = () => window.open(previewUrl, '_blank');

  const frame = document.getElementById('frame');
  const stream = document.getElementById('stream');
  const overlay = document.getElementById('overlay');
  const draftsEl = document.getElementById('drafts');
  const textEl = document.getElementById('text');
  const addBtn = document.getElementById('add');
  const sendBtn = document.getElementById('send');
  const status = document.getElementById('status');
  const toggle = document.getElementById('toggleMode');
  const modeLabel = document.getElementById('modeLabel');

  frame.src = previewUrl;
  if (streamPath) {
    stream.src = streamPath;
  }

  let commentMode = false;
  /** @type {{id:string,text:string,createdAt:string,anchor:{normX:number,normY:number,x:number,y:number}}[]} */
  let drafts = [];
  let pendingAnchor = null;

  function setStatus(msg, kind) {
    status.textContent = msg;
    status.className = kind || '';
  }

  function renderDrafts() {
    draftsEl.innerHTML = '';
    drafts.forEach((d, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="idx">' + (i + 1) + '</span>' +
        escapeHtml(d.text) +
        '<button type="button" data-i="' + i + '" title="Remove">✕</button>';
      draftsEl.appendChild(li);
    });
    draftsEl.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        drafts.splice(Number(b.getAttribute('data-i')), 1);
        renderDrafts();
        renderPins();
        sendBtn.disabled = drafts.length === 0;
      };
    });
    sendBtn.disabled = drafts.length === 0;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderPins() {
    overlay.querySelectorAll('.pin').forEach((n) => n.remove());
    const rect = overlay.getBoundingClientRect();
    drafts.forEach((d, i) => {
      const pin = document.createElement('div');
      pin.className = 'pin';
      pin.textContent = String(i + 1);
      pin.style.left = (d.anchor.normX * rect.width) + 'px';
      pin.style.top = (d.anchor.normY * rect.height) + 'px';
      overlay.appendChild(pin);
    });
  }

  function setMode(on) {
    commentMode = on;
    toggle.textContent = on ? 'Interact mode' : 'Comment mode';
    toggle.classList.toggle('active', on);
    modeLabel.textContent = on
      ? 'Comment mode — tap the frame to pin feedback'
      : 'Interact mode — drive the sim freely';
    overlay.classList.toggle('on', on);
    if (on && streamPath) {
      frame.hidden = true;
      stream.hidden = false;
      overlay.style.pointerEvents = 'auto';
    } else if (on) {
      // No stream proxy: keep iframe visible under a capturing overlay.
      frame.hidden = false;
      stream.hidden = true;
      frame.style.pointerEvents = 'none';
      overlay.style.pointerEvents = 'auto';
    } else {
      frame.hidden = false;
      stream.hidden = true;
      frame.style.pointerEvents = 'auto';
      overlay.style.pointerEvents = 'none';
      pendingAnchor = null;
      textEl.disabled = true;
      addBtn.disabled = true;
      setStatus('Interact mode — switch to Comment mode to pin feedback');
    }
    requestAnimationFrame(renderPins);
  }

  toggle.onclick = () => setMode(!commentMode);

  overlay.addEventListener('click', (ev) => {
    if (!commentMode) return;
    const rect = overlay.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    pendingAnchor = {
      normX: Math.min(1, Math.max(0, x / rect.width)),
      normY: Math.min(1, Math.max(0, y / rect.height)),
      x: Math.round(x),
      y: Math.round(y),
    };
    textEl.disabled = false;
    addBtn.disabled = false;
    textEl.focus();
    setStatus('Pinned at ' + pendingAnchor.normX.toFixed(2) + ', ' + pendingAnchor.normY.toFixed(2) + ' — type and Add');
  });

  function addComment() {
    const text = textEl.value.trim();
    if (!text || !pendingAnchor) return;
    drafts.push({
      id: 'c' + (drafts.length + 1) + '-' + Math.random().toString(36).slice(2, 6),
      text,
      createdAt: new Date().toISOString(),
      anchor: { ...pendingAnchor },
    });
    textEl.value = '';
    pendingAnchor = null;
    textEl.disabled = true;
    addBtn.disabled = true;
    renderDrafts();
    renderPins();
    setStatus(drafts.length + ' comment(s) ready — Send when done', 'ok');
  }
  addBtn.onclick = () => addComment();

  textEl.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    if (ev.metaKey || ev.ctrlKey) return; // Cmd/Ctrl+Enter sends the batch (window handler)
    if (ev.shiftKey) return; // newline
    ev.preventDefault();
    addComment();
  });

  window.addEventListener('keydown', (ev) => {
    // Shift+C toggles mode when not typing in a text field (in textarea it inserts "C").
    if (!ev.shiftKey || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key !== 'c' && ev.key !== 'C') return;
    const tag = (ev.target && ev.target.tagName) ? String(ev.target.tagName).toLowerCase() : '';
    if (tag === 'textarea' || tag === 'input' || (ev.target && ev.target.isContentEditable)) return;
    ev.preventDefault();
    setMode(!commentMode);
  });

  async function captureFrame() {
    if (stream.hidden || !stream.naturalWidth) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = stream.naturalWidth;
      canvas.height = stream.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(stream, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      return {
        dataUrl,
        width: canvas.width,
        height: canvas.height,
      };
    } catch (err) {
      console.warn('frame capture failed', err);
      return null;
    }
  }

  async function sendBatch() {
    if (drafts.length === 0) return;
    sendBtn.disabled = true;
    setStatus('Sending…');
    const frameInfo = await captureFrame();
    const body = {
      preview: { url: previewUrl, kind: 'serve-sim' },
      comments: drafts,
      frame: frameInfo
        ? { path: 'frame.png', width: frameInfo.width, height: frameInfo.height, dataUrl: frameInfo.dataUrl }
        : stream.naturalWidth
          ? { width: stream.naturalWidth, height: stream.naturalHeight }
          : { width: Math.round(overlay.getBoundingClientRect().width) || 390, height: Math.round(overlay.getBoundingClientRect().height) || 844 },
    };
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      drafts = [];
      renderDrafts();
      renderPins();
      setStatus('Sent ' + json.id + ' → local/qa-comments/pending/', 'ok');
    } catch (err) {
      setStatus(String(err.message || err), 'err');
      sendBtn.disabled = false;
    }
  }

  sendBtn.onclick = () => { void sendBatch(); };

  window.addEventListener('keydown', (ev) => {
    if (!(ev.metaKey || ev.ctrlKey)) return;
    if (ev.key !== 'Enter') return;
    if (drafts.length === 0 || sendBtn.disabled) return;
    ev.preventDefault();
    void sendBatch();
  });

  window.addEventListener('resize', () => requestAnimationFrame(renderPins));
  setMode(false);
})();
</script>
</body>
</html>`;
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

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
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
        let frameMeta = raw.frame
          ? {
              path: "frame.png" as const,
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
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
