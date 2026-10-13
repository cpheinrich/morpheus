import { type IncomingMessage } from "node:http";
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
export declare const QA_PREFIX = "/__qa";
export interface WebQaServerOptions {
    root: string;
    project: string;
    /** The dev server's origin, e.g. http://localhost:5173 */
    upstream: string;
    port: number;
    /**
     * The address people open when the overlay fronts the site at its own address, e.g.
     * http://localhost:5173 while the dev server runs on 5174. The dev server then sees this host,
     * origin and referer, so absolute URLs it builds (OAuth redirect_uri callbacks) name the site.
     */
    publicOrigin?: string;
    onListen?: (info: {
        port: number;
    }) => void;
}
export declare function normalizeUpstream(raw: string): URL;
/** Our own origins: the overlay is reachable as 127.0.0.1 or localhost on its port. */
export declare function ownOrigins(port: number): Set<string>;
/**
 * The Host header names one of our own loopback names, or the request is refused. A DNS-rebinding
 * page (evil.example resolving to 127.0.0.1) sends its own name; trusting it would make the page
 * "ours", rewrite its origin to the dev server's, and so defeat the dev server's own rebinding
 * checks (found in review of #342). The overlay's own origin is derived only from a host that passed.
 */
export declare function ownHost(hostHeader: string | undefined, port: number): string | null;
/**
 * Inserts the overlay script at the end of the page's head. Not the start: React hydrates head
 * children in order, and a script placed first was paired with the layout's own first script and
 * reported as a hydration mismatch (Next 16, React 19, found on the real Lakina page). After every
 * element React rendered there, it is an unexpected trailing tag, which React 19 leaves alone.
 */
export declare function injectOverlay(html: string): string;
/** A redirect to the dev server's own origin must come back through the overlay. */
export declare function rewriteLocation(location: string, upstream: URL, own: string): string;
/** Decodes a single known encoding; null for anything else, so the response passes through untouched. */
export declare function decode(body: Buffer, encoding: string | undefined): Buffer | null;
/**
 * The page a browser gets for a top-level navigation: the site in a frame on the left, the comment
 * column (drawn by the overlay script) on the right. The frame loads the same address, so the site's
 * own paths, cookies and redirects are unchanged; the script keeps the address bar in step with it.
 */
export declare function shellHtml(project: string): string;
/**
 * A browser's top-level page load, which gets the shell rather than the site. Not for a file opened
 * in a tab (a non-HTML extension, or an Accept without text/html), and not while the person has
 * chosen Full page (the `morpheus_qa_layout=inline` cookie the column sets), which is the way out
 * for a sign-in redirect to a provider that refuses to be framed.
 */
export declare function wantsShell(req: Pick<IncomingMessage, "method" | "headers" | "url">): boolean;
/** The request as the dev server should see it: its own host, origin and referer. */
export declare function upstreamHeaders(req: IncomingMessage, upstream: URL, own: string, html: boolean, presented?: URL): Record<string, string | string[]>;
export declare function startWebQaServer(options: WebQaServerOptions): Promise<{
    port: number;
    close: () => Promise<void>;
}>;
