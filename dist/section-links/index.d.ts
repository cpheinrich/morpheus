/**
 * Section links: every heading on an HQ page is addressable as `page#slug`, without any page
 * having to opt in. A heading that already carries an `id` — a Markdown renderer's, or one an
 * author chose — keeps it, because links to it may already exist. A heading without one is given
 * GitHub's slug of its visible text, so the same heading has the same address here as in the
 * repository's Markdown.
 *
 * These helpers are framework-free so they can be tested without React; the hover affordance
 * lives in `./react.js`.
 */
/** Sections and subsections. The page title is left out: the page URL already reaches it. */
export declare const DEFAULT_SECTION_SELECTOR = "h2, h3, h4";
/** Where headings are looked for; the body when the page has no `main`. */
export declare const DEFAULT_SECTION_SCOPE = "main";
/**
 * Headings that are chrome rather than content, plus an explicit opt-out for a subtree that should
 * stay unlinked.
 */
export declare const DEFAULT_SECTION_EXCLUDE = "nav, aside, dialog, [role='dialog'], [data-section-links='off']";
export type SectionLinkOptions = {
    selector: string;
    scope: string;
    exclude: string;
};
export declare const DEFAULT_SECTION_LINK_OPTIONS: SectionLinkOptions;
/**
 * GitHub's heading slug: lower case, punctuation dropped, each whitespace character a hyphen, so
 * "SRC-150 — a title" is `src-150--a-title`. Runs of hyphens are kept rather than collapsed, or
 * links written against the repository's Markdown would miss. A heading with no letters or digits
 * becomes `section`.
 */
export declare function headingSlug(text: string): string;
/** `base`, or GitHub's `base-1`, `base-2` … for the first one nobody holds. */
export declare function uniqueId(base: string, taken: (id: string) => boolean): string;
/** The shareable address of a section: this page, its query, and the heading's fragment. */
export declare function sectionHref(location: Pick<Location, "origin" | "pathname" | "search">, id: string): string;
/** The id a fragment names, or null; a malformed escape is not an id. */
export declare function fragmentId(hash: string): string | null;
/** What the reader sees: rendered whitespace collapses, so the slug should too. */
export declare function headingText(heading: Element): string;
/** The root headings are searched in. */
export declare function sectionScope(doc: Document, options: SectionLinkOptions): Element;
/** The heading an element sits in, if that heading should carry a link. */
export declare function eligibleHeading(element: Element | null, scope: Element, options: SectionLinkOptions): HTMLElement | null;
/**
 * Ids this module generated, with the text each was derived from. Only these follow their heading's
 * text; an authored id is never rewritten. A WeakMap rather than a DOM attribute so nothing visible
 * is added to the page and a removed heading takes its entry with it.
 */
export type GeneratedIds = WeakMap<Element, {
    id: string;
    text: string;
}>;
/**
 * Give every eligible heading an id, and return the ids that are new in this pass. A generated id
 * is re-derived when its heading's text changes — a heading that renders "Loading…" first should
 * not be addressed as `loading` forever.
 */
export declare function assignHeadingIds(doc: Document, options: SectionLinkOptions, generated: GeneratedIds): Set<string>;
