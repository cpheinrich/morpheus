import { createServer, request, type Server } from "node:http";
import { connect } from "node:net";
import { gzipSync } from "node:zlib";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error -- jsdom ships no type declarations, and @types/jsdom is not worth a dependency here.
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseBatch } from "../src/qa/comments.js";
import { decode, injectOverlay, normalizeUpstream, ownHost, rewriteLocation, startWebQaServer } from "../src/qa/web/server.js";
import { WEB_OVERLAY_JS } from "../src/qa/web/overlay-client.js";
import { defaultWebPort, overlayUrl, parseWebPreviewArgs, parseWebPreviewConfig, webKey } from "../src/qa/preview/web.js";
import { QA_GUIDE } from "../src/qa/guide.js";

describe("injection and rewriting", () => {
  it("puts the overlay script at the end of head, where React leaves an unexpected tag alone", () => {
    const html = "<html><head><script>theme()</script><title>t</title></head><body><main/></body></html>";
    const out = injectOverlay(html);
    expect(out).toBe('<html><head><script>theme()</script><title>t</title><script src="/__qa/overlay.js" defer></script></head><body><main/></body></html>');
    expect(injectOverlay(out)).toBe(out);
    expect(injectOverlay("<body class=x><p>hi</p></body>")).toBe('<body class=x><script src="/__qa/overlay.js" defer></script><p>hi</p></body>');
    expect(injectOverlay("<p>fragment</p>")).toMatch(/^<script src="\/__qa\/overlay\.js" defer><\/script><p>/);
  });

  it("brings a redirect to the dev server's origin back through the overlay, and leaves others alone", () => {
    const upstream = new URL("http://localhost:5173");
    expect(rewriteLocation("http://localhost:5173/hq/sign-in?next=%2Fhq", upstream, "http://localhost:4309")).toBe("http://localhost:4309/hq/sign-in?next=%2Fhq");
    expect(rewriteLocation("/hq/sign-in", upstream, "http://localhost:4309")).toBe("/hq/sign-in");
    expect(rewriteLocation("https://accounts.google.com/x", upstream, "http://localhost:4309")).toBe("https://accounts.google.com/x");
  });

  it("fronts local dev servers only", () => {
    expect(normalizeUpstream("http://localhost:5173/hq").origin).toBe("http://localhost:5173");
    expect(normalizeUpstream("http://127.0.0.1:3000").origin).toBe("http://127.0.0.1:3000");
    for (const bad of ["https://lakinacapital.com", "http://192.168.1.83:5173", "ftp://localhost:1", "https://localhost:5173"]) expect(() => normalizeUpstream(bad), bad).toThrow();
  });
});

describe("host and encoding guards (review of #342)", () => {
  it("accepts only its own loopback names on its own port as the Host", () => {
    expect(ownHost("127.0.0.1:4309", 4309)).toBe("http://127.0.0.1:4309");
    expect(ownHost("LOCALHOST:4309", 4309)).toBe("http://localhost:4309");
    expect(ownHost("[::1]:4309", 4309)).toBe("http://[::1]:4309");
    for (const bad of [undefined, "", "evil.example:4309", "localhost:4310", "localhost", "127.0.0.1.nip.io:4309"]) expect(ownHost(bad, 4309), String(bad)).toBeNull();
  });

  it("decodes one known encoding and refuses anything else rather than corrupting it", () => {
    expect(decode(Buffer.from("x"), undefined)?.toString()).toBe("x");
    expect(decode(gzipSync("y"), "gzip")?.toString()).toBe("y");
    expect(decode(Buffer.from("z"), "zstd")).toBeNull();
    expect(decode(Buffer.from("z"), "gzip, br")).toBeNull();
  });
});

describe("the proxy against a fake dev server", () => {
  let upstream: Server;
  let upstreamPort = 0;
  let root = "";
  let qa: Awaited<ReturnType<typeof startWebQaServer>>;
  const seen: { host?: string; origin?: string; referer?: string; encoding?: string }[] = [];
  // Node's close() does not track upgraded sockets, in this fake as in the overlay.
  const upgraded = new Set<import("node:net").Socket>();

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "qa-web-"));
    upstream = createServer((req, res) => {
      seen.push({ host: req.headers.host, origin: req.headers.origin as string | undefined, referer: req.headers.referer, encoding: req.headers["accept-encoding"] as string | undefined });
      if (req.url === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-encoding": "gzip", "content-security-policy": "script-src 'none'" });
        res.end(gzipSync("<html><head><title>Home</title></head><body>hi</body></html>"));
      } else if (req.url === "/hq") {
        res.writeHead(307, { location: `http://localhost:${upstreamPort}/hq/sign-in?next=%2Fhq` });
        res.end();
      } else if (req.url === "/api/data") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"ok":true}');
      } else { res.writeHead(404); res.end(); }
    });
    upstream.on("upgrade", (_req, socket) => {
      upgraded.add(socket as import("node:net").Socket);
      socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
      socket.on("data", (d) => socket.write(d));
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
    upstreamPort = (upstream.address() as { port: number }).port;
    qa = await startWebQaServer({ root, project: "Lakina", upstream: `http://127.0.0.1:${upstreamPort}`, port: 0 });
  });
  afterAll(async () => {
    await qa.close();
    upstream.closeAllConnections();
    for (const socket of upgraded) socket.destroy();
    await new Promise((resolve) => upstream.close(resolve));
    await rm(root, { recursive: true, force: true });
  });

  const base = () => `http://127.0.0.1:${qa.port}`;

  it("injects into a compressed page, drops its CSP, and asks the dev server for it uncompressed", async () => {
    const response = await fetch(`${base()}/`, { headers: { accept: "text/html", "accept-encoding": "gzip" } });
    const html = await response.text();
    expect(html).toBe('<html><head><title>Home</title><script src="/__qa/overlay.js" defer></script></head><body>hi</body></html>');
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(seen.at(-1)).toMatchObject({ host: `127.0.0.1:${upstreamPort}`, encoding: "identity" });
  });

  it("passes everything else through untouched, as the dev server sees its own origin", async () => {
    const response = await fetch(`${base()}/api/data`, { headers: { origin: base(), referer: `${base()}/hq` } });
    expect(await response.json()).toEqual({ ok: true });
    expect(seen.at(-1)).toMatchObject({ origin: `http://127.0.0.1:${upstreamPort}`, referer: `http://127.0.0.1:${upstreamPort}/hq` });
  });

  it("keeps a redirect on the overlay", async () => {
    const response = await fetch(`${base()}/hq`, { redirect: "manual" });
    expect(response.status).toBe(307);
    // The fake answers with localhost; the overlay was reached at 127.0.0.1, so it is not rewritten here —
    // rewriteLocation is unit-tested above for the matching case.
    expect(response.headers.get("location")).toContain("/hq/sign-in?next=%2Fhq");
  });

  const raw = (path: string, headers: Record<string, string>) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port: qa.port, path, headers }, (res) => {
      let body = ""; res.on("data", (d) => (body += d)); res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    r.on("error", reject); r.end();
  });

  it("refuses a request whose Host is not its own, so a rebound page cannot borrow the dev server's identity", async () => {
    const before = seen.length;
    const rebound = await raw("/api/data", { host: `evil.example:${qa.port}`, origin: `http://evil.example:${qa.port}` });
    expect(rebound.status).toBe(403);
    expect((await raw("/__qa/health", { host: `evil.example:${qa.port}` })).status).toBe(403);
    expect(seen.length).toBe(before);
  });

  it("passes a foreign Origin through unchanged, so the dev server's own checks still see it", async () => {
    await raw("/api/data", { host: `127.0.0.1:${qa.port}`, origin: "https://evil.example" });
    expect(seen.at(-1)?.origin).toBe("https://evil.example");
  });

  it("refuses a websocket upgrade whose Host is not its own", async () => {
    const socket = connect(qa.port, "127.0.0.1");
    await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
    socket.write(`GET /_next/hmr HTTP/1.1\r\nHost: evil.example:${qa.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`);
    const reply = await new Promise<string>((resolve) => socket.once("data", (d) => resolve(d.toString())));
    expect(reply).toMatch(/^HTTP\/1\.1 403/);
    socket.destroy();
  });

  it("serves its own script, with the project, and the capture library", async () => {
    const script = await (await fetch(`${base()}/__qa/overlay.js`)).text();
    expect(script).toContain('var PROJECT = "Lakina";');
    const library = await (await fetch(`${base()}/__qa/modern-screenshot.js`)).text();
    expect(library).toContain("modernScreenshot");
    expect(await (await fetch(`${base()}/__qa/health`)).json()).toMatchObject({ ok: true, kind: "web", upstream: `http://127.0.0.1:${upstreamPort}`, project: "Lakina" });
  });

  it("accepts a batch only as JSON from its own origin, and writes element-anchored comments", async () => {
    const comment = {
      id: "c1", text: "heading too large", createdAt: new Date().toISOString(),
      anchor: {
        normX: 0.5, normY: 0.43, x: 938, y: 606,
        element: { selector: "h1", tag: "h1", text: "Lakina Capital", offsetX: 0.5, offsetY: 0.51 },
        page: { url: `${base()}/`, scrollX: 0, scrollY: 0, viewportWidth: 1876, viewportHeight: 1409, pageWidth: 1876, pageHeight: 1409 },
      },
    };
    const post = (headers: Record<string, string>) => fetch(`${base()}/__qa/api/batches`, { method: "POST", headers, body: JSON.stringify({ comments: [comment] }) });
    expect((await post({ "content-type": "application/json", origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ "content-type": "application/json" })).status).toBe(403);
    expect((await post({ "content-type": "text/plain", origin: base() })).status).toBe(403);
    const ok = await post({ "content-type": "application/json", origin: base() });
    expect(ok.status).toBe(201);
    const { id } = (await ok.json()) as { id: string };
    const batch = parseBatch(JSON.parse(await readFile(join(root, "local/qa-comments/pending", id, "batch.json"), "utf8")));
    expect(batch.preview).toEqual({ url: `http://127.0.0.1:${upstreamPort}`, kind: "web" });
    expect(batch.comments[0]!.anchor.element).toEqual(comment.anchor.element);
    expect(await readdir(join(root, "local/qa-comments/pending"))).toHaveLength(1);
  });

  it("tunnels a websocket upgrade to the dev server, and close() ends it rather than waiting on it", async () => {
    const socket = connect(qa.port, "127.0.0.1");
    await new Promise<void>((resolve) => socket.once("connect", () => resolve()));
    socket.write(`GET /_next/hmr HTTP/1.1\r\nHost: 127.0.0.1:${qa.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nOrigin: ${base()}\r\n\r\n`);
    const reply = await new Promise<string>((resolve) => {
      let text = "";
      socket.on("data", (d) => { text += d.toString(); if (text.includes("ping")) resolve(text); else if (text.includes("\r\n\r\n")) socket.write("ping"); });
    });
    expect(reply).toMatch(/^HTTP\/1\.1 101/);
    expect(reply).toContain("ping");
    expect(seen.length).toBeGreaterThan(0);
    // A second server instance with an open tunnel must still close promptly (an open HMR socket once hung stop).
    const other = await startWebQaServer({ root, project: "Lakina", upstream: `http://127.0.0.1:${upstreamPort}`, port: 0 });
    const held = connect(other.port, "127.0.0.1");
    await new Promise<void>((resolve) => held.once("connect", () => resolve()));
    held.write(`GET /_next/hmr HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`);
    await new Promise((resolve) => held.once("data", resolve));
    const started = Date.now();
    await other.close();
    expect(Date.now() - started).toBeLessThan(1500);
    socket.destroy();
  });
});

describe("the injected client", () => {
  // jsdom reports "loading" until DOMContentLoaded fires, so the overlay waits to mount, as it does
  // for a page still parsing; tests wait for it too.
  const load = async (html: string) => {
    const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost:4309/" });
    dom.window.eval(WEB_OVERLAY_JS.replace("__MORPHEUS_QA_PROJECT__", '"Lakina"'));
    if (dom.window.document.readyState === "loading") await new Promise((resolve) => dom.window.addEventListener("DOMContentLoaded", resolve));
    return dom.window as unknown as Window & { __morpheusQa: { cssPath: (el: Element) => string | null; anchorFor: (el: Element, x: number, y: number) => Record<string, unknown> } };
  };

  it("is plain script with no template placeholders left to break the raw string", () => {
    expect(WEB_OVERLAY_JS).not.toMatch(/`|\$\{/);
    expect(() => new Function(WEB_OVERLAY_JS.replace("__MORPHEUS_QA_PROJECT__", '"x"'))).not.toThrow();
  });

  it("names an element by a selector that resolves to exactly it", async () => {
    const w = await load(`<body><main><h1>Lakina</h1><p>a</p><p class="t">b</p><div id="card"><span>x</span></div><span>other</span><ul><li>1</li><li data-testid="row">2</li></ul></main></body>`);
    const doc = w.document;
    for (const el of [doc.querySelector("h1")!, doc.querySelectorAll("p")[1]!, doc.querySelector("#card span")!, doc.querySelector("[data-testid=row]")!, doc.querySelectorAll("li")[0]!]) {
      const selector = w.__morpheusQa.cssPath(el)!;
      expect(selector, el.outerHTML).toBeTruthy();
      expect(doc.querySelectorAll(selector)).toHaveLength(1);
      expect(doc.querySelector(selector)).toBe(el);
    }
    expect(w.__morpheusQa.cssPath(doc.querySelector("#card span")!)).toBe("#card > span");
    expect(w.__morpheusQa.cssPath(doc.querySelector("[data-testid=row]")!)).toBe('[data-testid="row"]');
  });

  it("records the element, the page, and a page fraction the shared schema accepts", async () => {
    const w = await load(`<body><h1>Lakina Capital</h1></body>`);
    const anchor = w.__morpheusQa.anchorFor(w.document.querySelector("h1")!, 10, 10) as { element: { selector: string; text: string }; page: { url: string } };
    expect(anchor.element).toMatchObject({ selector: "h1", text: "Lakina Capital" });
    expect(anchor.page.url).toBe("http://localhost:4309/");
    expect(() => parseBatch({ version: 1, id: "x", project: "p", createdAt: "t", preview: { url: "u", kind: "web" }, status: "pending",
      comments: [{ id: "c1", text: "t", createdAt: "t", anchor }] })).not.toThrow();
  });

  it("mounts once, outside the body React manages", async () => {
    const w = await load(`<body><p>x</p></body>`);
    (w as unknown as { eval: (source: string) => void }).eval(WEB_OVERLAY_JS.replace("__MORPHEUS_QA_PROJECT__", '"Lakina"'));
    expect(w.document.querySelectorAll("morpheus-qa")).toHaveLength(1);
    expect(w.document.querySelector("morpheus-qa")!.parentElement).toBe(w.document.documentElement);
  });
});

describe("project names in the injected script", () => {
  it("survives a $ in the project name, which a string replacement would read as a pattern", async () => {
    const root = await mkdtemp(join(tmpdir(), "qa-web-name-"));
    const server = await startWebQaServer({ root, project: "Acme $' Co", upstream: "http://127.0.0.1:9", port: 0 });
    try {
      const script = await (await fetch(`http://127.0.0.1:${server.port}/__qa/overlay.js`)).text();
      expect(script).toContain(`var PROJECT = "Acme $' Co";`);
      expect(() => new Function(script)).not.toThrow();
    } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
  });
});

describe("qa.web configuration and arguments", () => {
  it("defaults a project that names only its dev server", () => {
    expect(parseWebPreviewConfig({ web: { url: "http://localhost:5173" } }, "Lakina")).toEqual({
      ok: true, config: { url: "http://localhost:5173", cwd: ".", path: "/", namespace: "morpheus.qa.lakina" },
    });
    const full = parseWebPreviewConfig({ web: { url: "http://localhost:5173/", command: ["npm", "run", "dev"], cwd: "apps/web", path: "/hq" } }, "Lakina");
    expect(full).toMatchObject({ ok: true, config: { command: ["npm", "run", "dev"], cwd: "apps/web", path: "/hq" } });
  });

  it("refuses a remote site, a path outside the project, and a bad command", () => {
    const parsed = parseWebPreviewConfig({ web: { url: "https://lakinacapital.com", cwd: "../elsewhere", command: [], path: "hq" } }, "P");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues).toHaveLength(4);
    expect(parseWebPreviewConfig({}, "P")).toEqual({ ok: false, issues: [expect.stringContaining("no qa.web block")] });
  });

  it("parses start, status and stop with their flags", () => {
    expect(parseWebPreviewArgs([])).toEqual({ command: "start" });
    expect(parseWebPreviewArgs(["start", "--path", "/hq/research", "--port", "4400", "--ttl-minutes", "60"])).toEqual({ command: "start", path: "/hq/research", port: 4400, ttlMinutes: 60 });
    for (const args of [["open"], ["--path", "hq"], ["--port", "80"], ["--ttl-minutes", "0"], ["--ssh-host", "a;b"], ["--x"]]) expect(() => parseWebPreviewArgs(args), args.join(" ")).toThrow();
  });

  it("opens the overlay on the dev server's own hostname, so its cookies apply, on a per-checkout port", () => {
    expect(overlayUrl("http://localhost:5173", 4309, "/hq")).toBe("http://localhost:4309/hq");
    expect(overlayUrl("http://127.0.0.1:3000", 4309, "/")).toBe("http://127.0.0.1:4309/");
    const key = webKey("/Users/x/code/lakina", { cwd: "apps/web" });
    expect(key).toMatch(/^[a-f0-9]{12}$/);
    expect(defaultWebPort(key)).toBeGreaterThanOrEqual(4300);
    expect(defaultWebPort(key)).toBeLessThan(4556);
  });
});

describe("the guide", () => {
  it("covers the web preview with the same one-page rule for every agent", () => {
    expect(QA_GUIDE).toContain("morpheus qa preview web start");
    expect(QA_GUIDE).toContain("Right-click any element");
    expect(QA_GUIDE).toMatch(/`element`: a CSS `selector`/);
    expect(QA_GUIDE).toContain("Grok, or any agent without a browser panel: `open <url>`");
  });
});
