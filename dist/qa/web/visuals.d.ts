/**
 * The web QA overlay's shared look: one fixed pin signal colour, the comment column's width, and a
 * column theme taken from the site's own surface, ink and type. The localhost overlay script
 * (`overlay-client.ts`, a raw string with no imports) spells the same values; a test keeps them equal.
 */
export declare const QA_PIN_COLOR = "#e4572e";
export declare const QA_COLUMN_PX = 340;
export type Rgba = [number, number, number, number];
/** "rgb(…)" or "rgba(…)" to [r, g, b, a]; null when unparseable. */
export declare function parseColor(value: string | null | undefined): Rgba | null;
export declare function luminance(c: Rgba): number;
export interface SiteTheme {
    bg: Rgba;
    fg: Rgba;
    dark: boolean;
    font: string;
}
/** The site's own surface, ink and type: the first opaque background up from body, its text colour and font. */
export declare function siteTheme(win: Pick<Window, "document" | "getComputedStyle">): SiteTheme;
export declare function rgba(c: Rgba, a: number): string;
/** The column's CSS custom properties for a theme, the same set the localhost overlay applies. */
export declare function themeVariables(t: SiteTheme): Record<string, string>;
