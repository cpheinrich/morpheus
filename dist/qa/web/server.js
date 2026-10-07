import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect } from "node:net";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { BatchRejected, recordBatch } from "../batches.js";
import { WEB_OVERLAY_JS } from "./overlay-client.js";
/**
 * The web comment overlay (MO-26-10-06-18.13.32): a reverse proxy in front of a local dev server
 * that injects one script into every HTML page. The page stays the app — same paths, same
 * cookies, same hot reload — with a comment toolbar and pins on top.
 *
 * Why a proxy and not an iframe: an iframe on another port is another origin, so the overlay could
 * not read the page to anchor a pin to an element, and absolute asset paths (`/_next/...`) would
 * resolve against the overlay. Proxying makes the overlay and the page one origin.
 *
 * Reserved paths live under `/__qa/` so they cannot shadow an app route.
 */
export const QA_PREFIX = "/__qa";
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
export function normalizeUpstream(raw) {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:")
        throw new Error(`Upstream must be http(s); got ${url.protocol}`);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
        throw new Error(`Upstream must be a local dev server (127.0.0.1 or localhost); got ${url.hostname}. Comment QA never fronts a remote site.`);
    }
    return new URL(url.origin);
}
/** Our own origins: the overlay is reachable as 127.0.0.1 or localhost on its port. */
export function ownOrigins(port) {
    return new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
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
function decode(body, encoding) {
    switch ((encoding ?? "").toLowerCase()) {
        case "gzip": return gunzipSync(body);
        case "br": return brotliDecompressSync(body);
        case "deflate": return inflateSync(body);
        default: return body;
    }
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
export function upstreamHeaders(req, upstream, own, html) {
    const out = {};
    for (const [name, value] of Object.entries(req.headers)) {
        if (value === undefined || HOP_BY_HOP.has(name))
            continue;
        out[name] = value;
    }
    out.host = upstream.host;
    if (typeof out.origin === "string" && out.origin === own)
        out.origin = upstream.origin;
    if (typeof out.referer === "string" && out.referer.startsWith(own))
        out.referer = upstream.origin + out.referer.slice(own.length);
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
    const lib = upstream.protocol === "https:" ? httpsRequest : httpRequest;
    const library = await readFile(screenshotLibraryPath(), "utf8");
    // Set once the port is bound (a test may ask for port 0).
    let origins = ownOrigins(options.port);
    const handler = async (req, res) => {
        try {
            const url = new URL(req.url ?? "/", "http://127.0.0.1");
            const host = req.headers.host ?? `127.0.0.1:${options.port}`;
            const own = `http://${host}`;
            if (url.pathname.startsWith(`${QA_PREFIX}/`)) {
                if (req.method !== "GET" && req.method !== "HEAD") {
                    const origin = req.headers.origin;
                    const type = req.headers["content-type"] ?? "";
                    if (!origin || !origins.has(origin) || !type.startsWith("application/json")) {
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
                    res.end(WEB_OVERLAY_JS.replace("__MORPHEUS_QA_PROJECT__", JSON.stringify(options.project)));
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
                        const { id, path } = await recordBatch(options.root, options.project, raw, { url: upstream.origin, kind: "web" });
                        sendJson(res, 201, { id, path });
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
            const wantsHtml = req.method === "GET" && (req.headers["sec-fetch-dest"] === "document" || /text\/html/.test(req.headers.accept ?? ""));
            const up = lib({
                protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port || (upstream.protocol === "https:" ? 443 : 80),
                path: `${url.pathname}${url.search}`, method: req.method, headers: upstreamHeaders(req, upstream, own, wantsHtml),
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
                        const body = injectOverlay(decode(Buffer.concat(chunks), upstreamRes.headers["content-encoding"]).toString("utf8"));
                        delete headers["content-length"];
                        delete headers["content-encoding"];
                        // A dev-only tool on a local origin: a page CSP would refuse the injected script.
                        delete headers["content-security-policy"];
                        delete headers["content-security-policy-report-only"];
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
        tunnels.add(socket);
        socket.once("close", () => tunnels.delete(socket));
        const own = `http://${req.headers.host ?? `127.0.0.1:${options.port}`}`;
        const target = connect({ host: upstream.hostname.replace(/^\[|\]$/g, ""), port: Number(upstream.port || 80) }, () => {
            const headers = upstreamHeaders(req, upstream, own, false);
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
    let port = options.port;
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
            if (host === "127.0.0.1")
                throw error;
            // No IPv6 loopback on this machine, or the port is taken there: 127.0.0.1 alone is enough.
        }
    }
    origins = ownOrigins(port);
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