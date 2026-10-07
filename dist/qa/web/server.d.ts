import { type IncomingMessage } from "node:http";
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
export declare const QA_PREFIX = "/__qa";
export interface WebQaServerOptions {
    root: string;
    project: string;
    /** The dev server's origin, e.g. http://localhost:5173 */
    upstream: string;
    port: number;
    onListen?: (info: {
        port: number;
    }) => void;
}
export declare function normalizeUpstream(raw: string): URL;
/** Our own origins: the overlay is reachable as 127.0.0.1 or localhost on its port. */
export declare function ownOrigins(port: number): Set<string>;
/**
 * Inserts the overlay script at the end of the page's head. Not the start: React hydrates head
 * children in order, and a script placed first was paired with the layout's own first script and
 * reported as a hydration mismatch (Next 16, React 19, found on the real Lakina page). After every
 * element React rendered there, it is an unexpected trailing tag, which React 19 leaves alone.
 */
export declare function injectOverlay(html: string): string;
/** A redirect to the dev server's own origin must come back through the overlay. */
export declare function rewriteLocation(location: string, upstream: URL, own: string): string;
/** The request as the dev server should see it: its own host, origin and referer. */
export declare function upstreamHeaders(req: IncomingMessage, upstream: URL, own: string, html: boolean): Record<string, string | string[]>;
export declare function startWebQaServer(options: WebQaServerOptions): Promise<{
    port: number;
    close: () => Promise<void>;
}>;
