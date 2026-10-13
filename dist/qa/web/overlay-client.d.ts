/**
 * The web overlay's script (MO-26-10-06-18.13.32, column layout MO-26-10-07-13.27.17). Plain
 * ES5-style JavaScript with no build step, kept free of backticks and template placeholders so it
 * can live here as a raw string; the server substitutes the project name.
 *
 * Layout. A top-level page request gets the overlay's shell (`shellHtml` in server.ts): the site in
 * a same-origin frame on the left and a full-height comment column on the right, the same shape as
 * the iOS overlay. The site therefore has a genuinely narrower viewport, so its fixed elements and
 * media queries behave. The script runs in three places:
 *
 * - **Shell** (`window.__morpheusQaShell`): draws the column and drives the framed site's document.
 * - **Framed site**: the proxy injects the script into every HTML page; inside the shell's frame it
 *   does nothing, because the shell drives it.
 * - **Inline fallback**: a top-level page that reached the site without the shell (a browser that
 *   sends no Sec-Fetch-Dest) gets the same column fixed on the right of its own document.
 *
 * Theme. The column takes the site's own computed background, text colour and font, and switches
 * with it (light, dark, or a theme toggle), so it reads as part of whichever product it sits on.
 *
 * Pins. Right-click (or Comment mode + click) pins a comment on the element under the pointer; the
 * anchor records a CSS path that resolved to exactly that element, the point within it, the page
 * point as a fraction of the whole page, and the scroll and viewport. Send captures the whole page
 * with modern-screenshot (loaded into the site's own window), and posts the batch; a failed capture
 * still sends, without a frame.
 */
export declare const WEB_OVERLAY_JS: string;
/** Width of the comment column, mirrored in the shell's initial frame width so the first paint is right. */
export declare const WEB_OVERLAY_COLUMN_PX = 340;
