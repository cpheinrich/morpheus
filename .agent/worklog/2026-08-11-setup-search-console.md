---
date: 2026-08-11
agent: codex
roadmap: MO-26-08-11-18.23.10
outcome: shipped
summary: "Made Google Search Console a browser-first part of scaffolded website SEO setup."
---

# Make Search Console setup part of project SEO work

Morpheus named `hq/marketing/seo/` in the architecture but scaffolded only its parent directory,
so an arriving agent had no local operating checklist and personal projects received no marketing
directory at all. Company and personal projects now start with `hq/marketing/seo/README.md`.

The checklist tells an agent to use the authenticated browser before escalating: confirm the live
site and crawl files, create or inspect the domain property, complete verification, submit the
sitemap, inspect indexing plus manual and security reports, and request priority crawling for a
small launch set. It records Google's accepted crawl request as a request rather than as proof of
indexing.

The fallback is deliberately specific. If the browser cannot proceed, the agent asks immediately
for the smallest missing prerequisite—named-account sign-in, interactive security check, property
permission, approval for an external DNS change, or an identity choice—and resumes when supplied.
It does not request passwords or verification codes in chat or substitute generic click directions
for an attempt.

## Verification

- Focused init and doctor tests: 73 passed.
- Full suite: 816 tests passed across 27 files.
- `pnpm typecheck` passed.
- `pnpm compile` regenerated the committed distribution.
- `pnpm morpheus pm index` regenerated the roadmap index.
- `git diff --check` passed.
