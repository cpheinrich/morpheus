---
date: 2026-11-15
roadmap: MO-26-11-15-18.52.12
tags: [engineering]
---

# Share the production web QA panel

Export an inline comment panel and bounded schema to managed websites. The panel
starts in Pin mode, keeps per-account tab drafts, and exposes optional Factory
controls to the site's authorized owner. The site's server verifies access and
owns the database write. A lost reply stays bound to the original batch ID.

A Claude 5.5 job through the configured gateway wrote the initial patch in
the claimed worktree. The session stopped before its completion report. I took
over the patch and added launch-control pass-through, viewport scroll context,
explicit rejection handling, default-off reset and closed-panel draft protection.

The seven focused Vitest files passed 171 tests. Typecheck, compilation, indexing,
complexity and whitespace checks passed. A linked Darwin build in Chromium
exercised the shared module at 1440px and 390px against Firebase emulators with
synthetic identities. Local overlay regressions use the focused Chromium and
WebKit suite.
