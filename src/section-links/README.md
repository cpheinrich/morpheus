# Section links

`morpheus-kit/section-links/react` makes every section of every HQ page shareable. Hovering an
`h2`–`h4`, or the gutter to its left, shows a link icon there; clicking it puts `page#section` in
the address bar and on the clipboard. Mount it once in the HQ layout:

```tsx
import { SectionLinks } from "morpheus-kit/section-links/react";

// in app/hq/layout.tsx (or the shell it renders), beside {children}
<SectionLinks />
```

No page changes. Headings are found in the DOM, so pages written later are covered too.

- **Ids.** A heading that already has an `id` keeps it. A heading without one is given GitHub's slug
  of its visible text (`-1`, `-2` for repeats), so a section has the same address in the HQ as in
  the repository's Markdown. A generated id follows its heading's text, so a heading that renders
  "Loading…" first is not addressed as `loading` forever. If an element rendered later carries
  the same id, such as a chart's gradient, the heading's id is re-derived. A link to a generated
  id still lands: the component scrolls to it once the id exists, once per navigation.
- **Scope.** By default it looks in `main` (the body if there is none) and skips `nav`, `aside`,
  dialogs and anything under `[data-section-links="off"]`. `selector`, `scope` and `exclude` props
  override each of these.
- **Look.** The icon takes the heading's colour at reduced opacity, so it suits a light or dark
  theme without configuration. The built-in styles use `:where()` and have zero specificity: a
  project restyles it by passing `classes` (as with `hq-search/react`) or by writing a rule for
  `.morpheus-section-links__button`. `copy` takes plain strings (`label` replaces `{title}`), so it
  can be passed from a server-component layout.
- **Next.js.** Clicking replaces the URL with a history state stripped of the App Router's `__NA`
  marker. Next then adopts the URL with the fragment, and a later router refresh does not drop it.

The icon is a single floating element rather than a node injected into each heading. React owns a
heading's children: an injected node is erased by the next text update. If the node lands inside a
Suspense boundary that has not hydrated yet, React finds a mismatch, discards the server HTML and
renders that boundary again on the client. The only thing written into a heading is a missing
`id`.

**Limits.** In development only, an id written into a heading inside a Suspense or Activity
boundary that has not hydrated yet makes React log an attribute hydration mismatch. Next's dev
overlay shows it as an issue. Production builds neither check nor patch attributes, so nothing
changes there. The icon appears on hover, so it is not offered on touch screens, and keyboard users
reach it only after a pointer has revealed it. The ids are still on the headings, so a typed
`#fragment` works for everyone. A title styled to look like a heading but written as a `div` is not
a heading and gets no link. Change it to a heading element so it gets a link and screen readers
announce it as a heading.
