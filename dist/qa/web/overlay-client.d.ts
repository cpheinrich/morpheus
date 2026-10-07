/**
 * The script the web overlay injects into every page (MO-26-10-06-18.13.32). Plain ES5-style
 * JavaScript with no build step, kept free of backticks and template placeholders so it can live
 * here as a raw string; the server substitutes the project name. It renders into a shadow root on
 * <html>, outside React's tree, so hydration never sees it.
 *
 * Right-click (or Comment mode + click) pins a comment on the element under the pointer; the
 * anchor records a CSS path that resolved to exactly that element, the point within it, the page
 * point as a fraction of the whole page, and the scroll and viewport. Send captures the whole page
 * with modern-screenshot (served from /__qa/), excluding the overlay, and posts the batch; a failed
 * capture still sends, without a frame.
 */
export declare const WEB_OVERLAY_JS: string;
