---
date: 2026-07-28
agent: claude
roadmap: MO-001
outcome: shipped
summary: Built the file-based project management layer — schemas, parser, index generator, CLI.
---

## What was built

`src/pm/` — Zod schemas for roadmap items, goals, requests, and journal entries; a frontmatter
parser; a README index generator with marker-based splicing; and `morpheus pm validate|index|new`.
23 tests.

## What was learned

Two bugs surfaced only by using the tool on real content, not by the tests written up front:

1. **YAML parses unquoted ISO dates into `Date` objects.** Every date field failed validation.
   Fixed with a preprocessing step rather than requiring quoted dates in frontmatter, because
   requiring quotes pushes YAML trivia onto whoever writes a roadmap item.

2. **A colon in a title is a YAML syntax error, and `matter()` throws on it.** The parser was
   aborting the whole run on one malformed file, which directly contradicts the stated design goal
   that `pm validate` reports everything at once. Fixed in two places: the parser catches and
   reports, and `pm new` quotes scalars defensively.

The second one is the more valuable find. The design intent was written down in a doc comment
before the code existed, and the code did not honour it — which is an argument for seeding real
content early rather than trusting synthetic test fixtures.

## Dead ends

Tried typing `parseArtifact` via `ARTIFACTS[K]["schema"]["_output"]`. TypeScript would not narrow
it across the union. An explicit `ArtifactTypes` interface mapping kind to type is uglier but
actually works, and keeps the renderers type-checked against their schemas.
