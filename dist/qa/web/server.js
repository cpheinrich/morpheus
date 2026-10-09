import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect } from "node:net";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { BatchRejected, recordBatch } from "../batches.js";
import { WEB_OVERLAY_COLUMN_PX, WEB_OVERLAY_JS } from "./overlay-client.js";
/**
 * The web comment overlay (MO-26-10-06-18.13.32): a reverse proxy in front of a local dev server
 * that injects one script into every HTML page. The page stays the app — same paths, same
 * cookies, same hot reload — with a comment toolbar and pins on top.
 *
 * Why a proxy: an iframe of the dev server on another port is another origin, so the overlay could
 * not read the page to anchor a pin to an element. Proxying makes the overlay and the page one
 * origin — which is also what lets the overlay frame the site itself. A top-level page load gets
 * `shellHtml`: the proxied site in a same-origin frame beside a full-height comment column, the
 * iOS overlay's shape (MO-26-10-07-13.27.17). The framed page is the site, injected as before.
 *
 * Reserved paths live under `/__qa/` so they cannot shadow an app route.
 */
export const QA_PREFIX = "/__qa";
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
export function normalizeUpstream(raw) {
    const url = new URL(raw);
    // http only: a local https dev server's self-signed certificate would be refused, and the
    // websocket tunnel is plain TCP.
    if (url.protocol !== "http:")
        throw new Error(`Upstream must be an http:// dev server; got ${url.protocol}`);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
        throw new Error(`Upstream must be a local dev server (127.0.0.1 or localhost); got ${url.hostname}. Comment QA never fronts a remote site.`);
    }
    return new URL(url.origin);
}
/** Our own origins: the overlay is reachable as 127.0.0.1 or localhost on its port. */
export function ownOrigins(port) {
    return new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`]);
}
/**
 * The Host header names one of our own loopback names, or the request is refused. A DNS-rebinding
 * page (evil.example resolving to 127.0.0.1) sends its own name; trusting it would make the page
 * "ours", rewrite its origin to the dev server's, and so defeat the dev server's own rebinding
 * checks (found in review of #342). The overlay's own origin is derived only from a host that passed.
 */
export function ownHost(hostHeader, port) {
    if (!hostHeader)
        return null;
    return ownOrigins(port).has(`http://${hostHeader.toLowerCase()}`) ? `http://${hostHeader.toLowerCase()}` : null;
}
/**
 * Inserts the overlay script at the end of the page's head. Not the start: React hydrates head
 * children in order, and a script placed first was paired with the layout's own first script and
 * reported as a hydration mismatch (Next 16, React 19, found on the real Lakina page). After every
 * element React rendered there, it is an unexpected trailing tag, which React 19 leaves alone.
 */
export function injectOverlay(html) {
    if (html.includes(`${QA_PREFIX}/overlay.js`))
        return html;
    const tag = `<script src="${QA_PREFIX}/overlay.js" defer></script>`;
    const close = html.search(/<\/head>/i);
    if (close >= 0)
        return html.slice(0, close) + tag + html.slice(close);
    const body = /<body(\s[^>]*)?>/i.exec(html);
    if (body)
        return html.slice(0, body.index + body[0].length) + tag + html.slice(body.index + body[0].length);
    return tag + html;
}
/** A redirect to the dev server's own origin must come back through the overlay. */
export function rewriteLocation(location, upstream, own) {
    return location.startsWith(upstream.origin) ? own + location.slice(upstream.origin.length) : location;
}
/** Decodes a single known encoding; null for anything else, so the response passes through untouched. */
export function decode(body, encoding) {
    switch ((encoding ?? "").trim().toLowerCase()) {
        case "":
        case "identity": return body;
        case "gzip": return gunzipSync(body);
        case "br": return brotliDecompressSync(body);
        case "deflate": return inflateSync(body);
        default: return null;
    }
}
/**
 * The page a browser gets for a top-level navigation: the site in a frame on the left, the comment
 * column (drawn by the overlay script) on the right. The frame loads the same address, so the site's
 * own paths, cookies and redirects are unchanged; the script keeps the address bar in step with it.
 */
export function shellHtml(project) {
    const title = project.replace(/[<&>"]/g, "");
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · QA</title>
<style>html,body{margin:0;height:100%;overflow:hidden}#morpheus-qa-site{position:fixed;left:0;top:0;height:100%;width:calc(100% - ${WEB_OVERLAY_COLUMN_PX}px);border:0;display:block}</style>
<script>window.__morpheusQaShell = true;</script>
</head><body>
<iframe id="morpheus-qa-site" title="${title}" allow="clipboard-read; clipboard-write; fullscreen"></iframe>
<script>document.getElementById("morpheus-qa-site").src = location.href;</script>
<script src="${QA_PREFIX}/overlay.js"></script>
</body></html>
`;
}
/**
 * A browser's top-level page load, which gets the shell rather than the site. Not for a file opened
 * in a tab (a non-HTML extension, or an Accept without text/html), and not while the person has
 * chosen Full page (the `morpheus_qa_layout=inline` cookie the column sets), which is the way out
 * for a sign-in redirect to a provider that refuses to be framed.
 */
export function wantsShell(req) {
    if (req.method !== "GET" || req.headers["sec-fetch-dest"] !== "document")
        return false;
    if (!/text\/html|\*\/\*/.test(req.headers.accept ?? "*/*"))
        return false;
    const path = (req.url ?? "/").split("?")[0];
    if (/\.[a-z0-9]{1,8}$/i.test(path) && !/\.html?$/i.test(path))
        return false;
    return !/(?:^|;\s*)morpheus_qa_layout=inline(?:;|$)/.test(String(req.headers.cookie ?? ""));
}
function sendJson(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(`${JSON.stringify(body, null, 2)}\n`);
}
function readBody(req, limit = 64 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (c) => { size += c.length; if (size > limit) {
            reject(new Error("body too large"));
            req.destroy();
        }
        else
            chunks.push(c); });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}
/** The request as the dev server should see it: its own host, origin and referer. */
export function upstreamHeaders(req, upstream, own, html, presented = upstream) {
    const out = {};
    for (const [name, value] of Object.entries(req.headers)) {
        if (value === undefined || HOP_BY_HOP.has(name))
            continue;
        out[name] = value;
    }
    out.host = presented.host;
    if (typeof out.origin === "string" && out.origin === own)
        out.origin = presented.origin;
    if (typeof out.referer === "string" && out.referer.startsWith(own))
        out.referer = presented.origin + out.referer.slice(own.length);
    // A page we inject into must arrive uncompressed so the script can be inserted.
    if (html)
        out["accept-encoding"] = "identity";
    return out;
}
function screenshotLibraryPath() {
    const require = createRequire(import.meta.url);
    return join(dirname(require.resolve("modern-screenshot")), "index.js");
}
export async function startWebQaServer(options) {
    const upstream = normalizeUpstream(options.upstream);
    const presented = options.publicOrigin ? normalizeUpstream(options.publicOrigin) : upstream;
    const lib = upstream.protocol === "https:" ? httpsRequest : httpRequest;
    const library = await readFile(screenshotLibraryPath(), "utf8");
    // Set once the port is bound (a test may ask for port 0); requests arrive only after that.
    let port = options.port;
    const handler = async (req, res) => {
        try {
            const url = new URL(req.url ?? "/", "http://127.0.0.1");
            const own = ownHost(req.headers.host, port);
            if (!own) {
                sendJson(res, 403, { error: "This overlay answers only to 127.0.0.1, localhost or [::1] on its own port." });
                return;
            }
            if (url.pathname.startsWith(`${QA_PREFIX}/`)) {
                if (req.method !== "GET" && req.method !== "HEAD") {
                    const origin = req.headers.origin;
                    const type = req.headers["content-type"] ?? "";
                    if (!origin || !ownOrigins(port).has(origin) || !type.startsWith("application/json")) {
                        sendJson(res, 403, { error: "QA endpoints accept JSON from this overlay's own origin only" });
                        return;
                    }
                }
                if (req.method === "GET" && url.pathname === `${QA_PREFIX}/health`) {
                    sendJson(res, 200, { ok: true, kind: "web", upstream: upstream.origin, project: options.project, root: options.root });
                    return;
                }
                if (req.method === "GET" && url.pathname === `${QA_PREFIX}/overlay.js`) {
                    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
                    // A replacer function, so a "$" in the project name is not read as a replacement pattern.
                    res.end(WEB_OVERLAY_JS.replace("__MORPHEUS_QA_PROJECT__", () => JSON.stringify(options.project)));
                    return;
                }
                if (req.method === "GET" && url.pathname === `${QA_PREFIX}/modern-screenshot.js`) {
                    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "max-age=3600" });
                    res.end(library);
                    return;
                }
                if (req.method === "POST" && url.pathname === `${QA_PREFIX}/api/batches`) {
                    const raw = JSON.parse((await readBody(req)).toString("utf8"));
                    try {
                        const { id, path, pendingCount, wakeConfigured } = await recordBatch(options.root, options.project, raw, { url: upstream.origin, kind: "web" });
                        sendJson(res, 201, { id, path, pendingCount, wakeConfigured });
                    }
                    catch (error) {
                        if (error instanceof BatchRejected || error.name === "ZodError") {
                            sendJson(res, 400, { error: error.message });
                            return;
                        }
                        throw error;
                    }
                    return;
                }
                sendJson(res, 404, { error: "not found" });
                return;
            }
            if (wantsShell(req)) {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
                res.end(shellHtml(options.project));
                return;
            }
            const wantsHtml = req.method === "GET" && (req.headers["sec-fetch-dest"] === "iframe" || /text\/html/.test(req.headers.accept ?? ""));
            const up = lib({
                protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port || (upstream.protocol === "https:" ? 443 : 80),
                path: `${url.pathname}${url.search}`, method: req.method, headers: upstreamHeaders(req, upstream, own, wantsHtml, presented),
            }, (upstreamRes) => {
                const headers = {};
                for (const [name, value] of Object.entries(upstreamRes.headers)) {
                    if (value === undefined || HOP_BY_HOP.has(name))
                        continue;
                    headers[name] = value;
                }
                if (typeof headers.location === "string")
                    headers.location = rewriteLocation(headers.location, upstream, own);
                const isHtml = /text\/html/i.test(String(upstreamRes.headers["content-type"] ?? ""));
                if (!isHtml) {
                    res.writeHead(upstreamRes.statusCode ?? 502, headers);
                    upstreamRes.pipe(res);
                    return;
                }
                const chunks = [];
                upstreamRes.on("data", (c) => chunks.push(c));
                upstreamRes.on("end", () => {
                    try {
                        const raw = Buffer.concat(chunks);
                        const decoded = decode(raw, upstreamRes.headers["content-encoding"]);
                        if (!decoded) {
                            // An encoding we cannot read (zstd, stacked): pass the page through without the overlay.
                            res.writeHead(upstreamRes.statusCode ?? 502, headers);
                            res.end(raw);
                            return;
                        }
                        const body = injectOverlay(decoded.toString("utf8"));
                        delete headers["content-length"];
                        delete headers["content-encoding"];
                        // A dev-only tool on a local origin: a page CSP would refuse the injected script.
                        delete headers["content-security-policy"];
                        delete headers["content-security-policy-report-only"];
                        // The shell frames the page on its own origin; a frame refusal would blank it.
                        delete headers["x-frame-options"];
                        headers["cache-control"] = "no-store";
                        res.writeHead(upstreamRes.statusCode ?? 502, headers);
                        res.end(body);
                    }
                    catch (error) {
                        if (!res.headersSent)
                            sendJson(res, 502, { error: `could not inject the overlay: ${error.message}` });
                    }
                });
                upstreamRes.on("error", (error) => res.destroy(error));
            });
            up.on("error", (error) => {
                if (!res.headersSent)
                    sendJson(res, 502, { error: `dev server unreachable at ${upstream.origin}: ${error.message}` });
                else
                    res.destroy(error);
            });
            if (req.method === "GET" || req.method === "HEAD")
                up.end();
            else
                req.pipe(up);
        }
        catch (error) {
            if (!res.headersSent)
                sendJson(res, 500, { error: error.message });
        }
    };
    // Upgraded sockets are not the server's connections any more: close() would wait on them forever,
    // so they are tracked and destroyed explicitly (an open hot-reload socket once hung stop).
    const tunnels = new Set();
    /** Hot reload and any other websocket: a raw tunnel to the dev server with its own host and origin. */
    const upgrade = (req, socket, head) => {
        const own = ownHost(req.headers.host, port);
        if (!own) {
            socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
            return;
        }
        tunnels.add(socket);
        socket.once("close", () => tunnels.delete(socket));
        const target = connect({ host: upstream.hostname.replace(/^\[|\]$/g, ""), port: Number(upstream.port || 80) }, () => {
            const headers = upstreamHeaders(req, upstream, own, false, presented);
            headers.connection = "Upgrade";
            headers.upgrade = String(req.headers.upgrade ?? "websocket");
            const lines = [`${req.method} ${req.url} HTTP/1.1`, ...Object.entries(headers).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => `${k}: ${x}`))];
            target.write(`${lines.join("\r\n")}\r\n\r\n`);
            if (head.length)
                target.write(head);
            target.pipe(socket);
            socket.pipe(target);
        });
        const end = () => { target.destroy(); socket.destroy(); };
        target.on("error", end);
        socket.on("error", end);
        socket.once("close", () => target.destroy());
        target.once("close", () => socket.destroy());
    };
    // Bound to both loopback families: the page may be opened as localhost, which a browser can
    // resolve to ::1 first. Never to a LAN address.
    const servers = [];
    for (const host of ["127.0.0.1", "::1"]) {
        const server = createServer((req, res) => void handler(req, res));
        server.on("upgrade", upgrade);
        try {
            await new Promise((resolve, reject) => {
                server.once("error", reject);
                server.listen(port, host, () => { server.off("error", reject); resolve(); });
            });
            servers.push(server);
            const bound = server.address();
            if (typeof bound === "object" && bound)
                port = bound.port;
        }
        catch (error) {
            const code = error.code;
            // No IPv6 loopback on this machine: 127.0.0.1 alone is enough. Anything else — another
            // process already on [::1]:port — would let "localhost" reach that process, so it fails.
            if (host === "127.0.0.1" || (code !== "EADDRNOTAVAIL" && code !== "EAFNOSUPPORT")) {
                await Promise.all(servers.map((s) => new Promise((resolve) => s.close(() => resolve()))));
                throw error;
            }
        }
    }
    options.onListen?.({ port });
    return {
        port,
        close: () => {
            for (const socket of tunnels)
                socket.destroy();
            return Promise.all(servers.map((s) => new Promise((resolve) => { s.closeAllConnections?.(); s.close(() => resolve()); }))).then(() => undefined);
        },
    };
}
//# sourceMappingURL=server.js.map