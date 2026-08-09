/**
 * Design tokens: one generator instead of three.
 *
 * `cpheinrich.com`, `heinrichbros.com` and `lakina` each hand-rolled a script
 * to turn brand tokens into CSS custom properties. Three independent
 * implementations of the same twenty lines is the extract-on-second-use
 * trigger passed twice over, and each one is subtly different — one throws on
 * arrays, one silently drops them, one hardcodes every variable name.
 *
 * This reads DTCG-shaped JSON and emits CSS custom properties and a typed TS
 * module. It emits **primitives only** and never decides semantic names —
 * settled 2026-07-29, not a placeholder. Only one project has a semantic layer,
 * its mapping is a brand choice rather than a technical one, and a shared
 * vocabulary extracted from a sample of one would be a guess frozen into every
 * project that follows.
 *
 * The semantic layer is per project, in `packages/shared/tokens/semantic.json`
 * — see architecture §15.1a, which already assigns it there.
 */
/** A leaf value, flattened out of the token tree. */
export interface Token {
    /** Dot path in the source, e.g. `color.ink`. */
    path: string[];
    /** Kebab-cased variable name without the prefix, e.g. `color-ink`. */
    name: string;
    value: string;
}
export interface ParseResult {
    tokens: Token[];
    /** Everything wrong with the file, reported together. */
    issues: string[];
}
/**
 * Flatten a token document.
 *
 * Reports every problem rather than throwing on the first — a brand file with
 * two mistakes should surface both, the same rule the roadmap parser follows.
 */
export declare function parseTokens(doc: unknown): ParseResult;
export declare function readTokens(path: string): Promise<ParseResult>;
export interface RenderOptions {
    /** Variable prefix, e.g. `brand` gives `--brand-color-ink`. */
    prefix: string;
    /** Where the tokens came from, named in the generated header. */
    source: string;
    /** CSS selector the properties are declared on. */
    selector?: string;
}
export declare function renderCss(tokens: Token[], opts: RenderOptions): string;
/**
 * A typed module, so a token that no longer exists fails at build rather than
 * rendering as an empty CSS variable — which is the failure mode a stylesheet
 * cannot catch.
 */
export declare function renderTs(tokens: Token[], opts: RenderOptions): string;
