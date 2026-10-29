import { type SectionLinkOptions } from "./index.js";
export type SectionLinksClassNames = {
    button: string;
    icon: string;
    status: string;
};
/**
 * Plain strings, because the component is mounted from a server-component layout and a function
 * prop cannot cross that boundary. `{title}` in `label` is replaced with the heading's text.
 */
export type SectionLinksCopy = {
    label: string;
    copied: string;
    failed: string;
};
export type SectionLinksProps = Partial<SectionLinkOptions> & {
    classes?: Partial<SectionLinksClassNames>;
    copy?: Partial<SectionLinksCopy>;
};
/**
 * Hovering a section heading, or the gutter to its left, shows a link icon there; clicking it puts
 * `page#section` in the address bar and on the clipboard. Mount it once in the HQ layout: it finds
 * headings itself, so no page has to change, and pages added later are covered without anyone
 * remembering to opt in.
 *
 * The icon is one floating element rather than a child injected into each heading. React owns the
 * headings' children: an injected node is wiped by the next text update and, inside a Suspense
 * boundary that has not hydrated yet, turns into a hydration mismatch. The only thing written into
 * a heading is a missing `id`.
 */
export declare function SectionLinks({ selector, scope, exclude, classes, copy }: SectionLinksProps): import("react").JSX.Element;
