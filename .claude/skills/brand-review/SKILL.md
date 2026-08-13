---
name: brand-review
description: Create, iterate, or finalize a visual-first Morpheus brand exploration. Use when a project has hq/brand/vibes.txt and moodboard references, when reviewing brand concepts in research/brand.html, or when applying a selected direction to a home page or app.
---

# Visual-first brand review

Read `hq/brand/README.md`, `vibes.txt`, every useful file in `moodboard/`, the
existing `research/brand.html`, and `decisions.md` before making a visual call.

## Explore

Create or update one standalone `research/brand.html`. Start with five stable,
genuinely distinct named directions, not five recolours. Use the same product
content, hierarchy, sample screens, and CTA in every direction.

Give every direction these views:

1. Brand System: palette, type, mark, UI primitives, imagery, and motif.
2. Home: expressive entry plus enough dense product UI to prove it works.
3. Marketing: a public landing-page mock using the common CTA and hierarchy.
4. Typography: the actual product name large and small, body, label, and control.
5. Graphics: multiple illustration, diagram, icon, or image-language candidates at a consistent
   scale, including restrained and dense compositions plus placement context.
6. Compare All: meaningful side-by-side art, palette, type, UI, and product snapshots.

Keep the metadata and attributes required by `explore-prompt.md`: five or more
`data-morpheus-concept` markers and the six `data-morpheus-view` markers.
Make the page responsive at desktop and mobile widths. Record settled, rejected,
and open choices in `decisions.md` after each round.

## Finalize

Do not promote a direction until a human names it or names an intentional
hybrid. Run `morpheus brand finalize --selection "Name"`, then write every
canonical file it names.

Retain the review page. Preserve selected moodboards in `moodboards.md` and
approved diagrams, photography, illustrations, or textures in `imagery.json`
with source, provenance, alt text, and named placements. In `application.md`,
map every asset id to public-web or product surfaces. Build the first home page
from the full package — messaging, tokens, type, layout, and mapped imagery —
not tokens and copy alone.

Run `morpheus brand status` before saying the package is complete. Report any
unverified contrast, licensing, interactive, dark-mode, or production-asset
decision in `## Completion` rather than implying it was checked.
