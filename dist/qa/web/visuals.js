/**
 * The web QA overlay's shared look: one fixed pin signal colour, the comment column's width, and a
 * column theme taken from the site's own surface, ink and type. The localhost overlay script
 * (`overlay-client.ts`, a raw string with no imports) spells the same values; a test keeps them equal.
 */
export const QA_PIN_COLOR = "#e4572e";
export const QA_COLUMN_PX = 340;
/** "rgb(…)" or "rgba(…)" to [r, g, b, a]; null when unparseable. */
export function parseColor(value) {
    const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(value || "");
    if (!m)
        return null;
    const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), alpha];
}
export function luminance(c) {
    const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
}
/** The site's own surface, ink and type: the first opaque background up from body, its text colour and font. */
export function siteTheme(win) {
    let bg = null, fg = null, font = "";
    for (const node of [win.document.body, win.document.documentElement]) {
        if (!node)
            continue;
        const style = win.getComputedStyle(node);
        const c = parseColor(style.backgroundColor);
        if (!bg && c && c[3] > 0.5)
            bg = c;
        fg ??= parseColor(style.color);
        font ||= style.fontFamily;
    }
    bg ??= [255, 255, 255, 1];
    const dark = luminance(bg) < 0.4;
    if (!fg || Math.abs(luminance(fg) - luminance(bg)) < 0.3)
        fg = dark ? [240, 240, 240, 1] : [20, 20, 20, 1];
    return { bg, fg, dark, font: font || "system-ui, -apple-system, sans-serif" };
}
export function rgba(c, a) {
    return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}
/** The column's CSS custom properties for a theme, the same set the localhost overlay applies. */
export function themeVariables(t) {
    return {
        "--qa-bg": rgba(t.bg, 1),
        "--qa-fg": rgba(t.fg, 1),
        "--qa-muted": rgba(t.fg, 0.62),
        "--qa-rule": rgba(t.fg, 0.16),
        "--qa-panel": rgba(t.fg, 0.04),
        "--qa-field": t.dark ? "rgba(0,0,0,.18)" : "rgba(255,255,255,.6)",
        "--qa-ok": t.dark ? "#81c995" : "#1e7e34",
        "--qa-font": t.font,
        "--qa-scheme": t.dark ? "dark" : "light",
    };
}
//# sourceMappingURL=visuals.js.map