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
export const DEFAULT_SECTION_SELECTOR = "h2, h3, h4";
/** Where headings are looked for; the body when the page has no `main`. */
export const DEFAULT_SECTION_SCOPE = "main";
/**
 * Headings that are chrome rather than content, plus an explicit opt-out for a subtree that should
 * stay unlinked.
 */
export const DEFAULT_SECTION_EXCLUDE = "nav, aside, dialog, [role='dialog'], [data-section-links='off']";
export const DEFAULT_SECTION_LINK_OPTIONS = {
    selector: DEFAULT_SECTION_SELECTOR,
    scope: DEFAULT_SECTION_SCOPE,
    exclude: DEFAULT_SECTION_EXCLUDE,
};
/**
 * GitHub's heading slug: lower case, punctuation dropped, each whitespace character a hyphen, so
 * "SRC-150 — a title" is `src-150--a-title`. Runs of hyphens are kept rather than collapsed, or
 * links written against the repository's Markdown would miss. A heading with no letters or digits
 * becomes `section`.
 */
export function headingSlug(text) {
    return (text
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, "")
        .replace(/\s/g, "-") || "section");
}
/** `base`, or GitHub's `base-1`, `base-2` … for the first one nobody holds. */
export function uniqueId(base, taken) {
    if (!taken(base))
        return base;
    for (let n = 1;; n += 1) {
        const candidate = `${base}-${n}`;
        if (!taken(candidate))
            return candidate;
    }
}
/** The shareable address of a section: this page, its query, and the heading's fragment. */
export function sectionHref(location, id) {
    return `${location.origin}${location.pathname}${location.search}#${encodeURIComponent(id)}`;
}
/** The id a fragment names, or null; a malformed escape is not an id. */
export function fragmentId(hash) {
    if (hash.length < 2 || !hash.startsWith("#"))
        return null;
    try {
        return decodeURIComponent(hash.slice(1));
    }
    catch {
        return null;
    }
}
/**
 * Open every closed `<details>` around an element, as the browser does when it follows a fragment
 * itself. `scrollIntoView` does not, so a section inside "Show more" would otherwise leave the
 * reader at the top of the page with the target still folded away.
 */
export function revealAncestors(element) {
    for (let node = element.parentElement; node; node = node.parentElement) {
        if (node instanceof HTMLDetailsElement && !node.open)
            node.open = true;
    }
}
/** What the reader sees: rendered whitespace collapses, so the slug should too. */
export function headingText(heading) {
    return (heading.textContent ?? "").replace(/\s+/g, " ").trim();
}
/** The root headings are searched in. */
export function sectionScope(doc, options) {
    return doc.querySelector(options.scope) ?? doc.body;
}
/** The heading an element sits in, if that heading should carry a link. */
export function eligibleHeading(element, scope, options) {
    const heading = element?.closest(options.selector) ?? null;
    if (!heading || !scope.contains(heading) || heading.closest(options.exclude))
        return null;
    return heading;
}
/**
 * Give every eligible heading an id, and return the ids that are new in this pass. A generated id
 * is re-derived when its heading's text changes — a heading that renders "Loading…" first should
 * not be addressed as `loading` forever — and when an element rendered later turns out to carry
 * the same id. Uniqueness is only checked at assignment, and a heading earlier in the document
 * would otherwise capture `#id`, `getElementById` and `url(#id)` from, say, a chart's gradient.
 */
export function assignHeadingIds(doc, options, generated) {
    const scope = sectionScope(doc, options);
    const assigned = new Set();
    let idCounts = null;
    // One walk of the document, and only on a pass that has a generated id to check.
    const shared = (id) => {
        if (!idCounts) {
            idCounts = new Map();
            for (const element of doc.querySelectorAll("[id]")) {
                idCounts.set(element.id, (idCounts.get(element.id) ?? 0) + 1);
            }
        }
        return (idCounts.get(id) ?? 0) > 1;
    };
    for (const heading of scope.querySelectorAll(options.selector)) {
        if (heading.closest(options.exclude))
            continue;
        const text = headingText(heading);
        const previous = generated.get(heading);
        const ours = previous !== undefined && heading.id === previous.id;
        // An id this module did not write — authored, or replaced since by its owner — is left alone.
        if (heading.id && !ours)
            continue;
        if (ours && previous.text === text && !shared(heading.id))
            continue;
        if (!text)
            continue;
        if (ours)
            heading.removeAttribute("id");
        const id = uniqueId(headingSlug(text), (candidate) => doc.getElementById(candidate) !== null);
        heading.id = id;
        generated.set(heading, { id, text });
        assigned.add(id);
    }
    return assigned;
}
//# sourceMappingURL=index.js.map