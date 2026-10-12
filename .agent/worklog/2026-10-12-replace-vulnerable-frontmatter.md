---
agent: codex
date: 2026-10-12
roadmap: MO-26-10-12-09.17.58
outcome: review
---

# Replace vulnerable frontmatter dependency

The weekly audit traced the production advisory to the abandoned `gray-matter` package's
`js-yaml` 3 dependency. Replaced it with the API-compatible, Eleventy-maintained
`@11ty/gray-matter` fork, which uses current `js-yaml`. The four frontmatter consumers compile and
their 143 focused tests pass; `pnpm audit --prod` now reports no known vulnerabilities.

The package choice and rejected custom-parser alternative are recorded in
`.agent/decisions.md`. No behavior or schema change is intended.
