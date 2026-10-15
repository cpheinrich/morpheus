---
date: 2026-10-15
agent: codex
roadmap: MO-26-10-15-01.07.52
outcome: review
summary: Keep a controller-owned recovery incident open until exact release verification.
---

# Recovery incident closure ownership

Morpheus #398 came from Evo incident #493. Evo's repair roadmap items linked
the incident through `issues: [493]`, so Morpheus required `Closes #493` in the
worker PR. GitHub closed it at merge, five seconds before the controller's
reserved release dispatched; admission then found no open incident and stopped
before TestFlight upload. The Evo repair worklogs
`2026-10-14-repair-dataset-photo-selection.md` and
`2026-10-14-repair-picker-selection-state.md` describe the repair and focused
qualification. The incident issue itself records the merge-to-dispatch failure.

The check now accepts `issuesToKeepOpen: [493]` only as a subset of the
roadmap's linked issues. For each held issue it requires a visible `Refs #493`
and rejects visible GitHub closing keywords. Other linked issues still require
`Closes`. The PR template, project instructions, runbook, and architecture
explain the controller handoff. This is domain-specific policy, so no generic
library was needed.

The first independent review found two substantive bypasses. GitHub accepts
`Closes: #493` and its peers with a colon, but the previous detector missed
them. GitHub also closes issues from merged commit messages; a clean PR body
can carry a closing keyword in the title or branch history that becomes the
squash message. The correction recognizes colon syntax and checks the raw PR
body, title, and head-only commit messages for a held issue. It fails closed
when commit history cannot be read. These rules follow GitHub's published
[linking syntax](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
and [squash-message behavior](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests).

The regression exercises a mixed item with an ordinary issue and the live
incident: missing `Refs` is refused; `Closes`, `Fixes`, and `Resolves` are each
refused; `Closes #70` with `Refs #493` passes. Schema tests reject a held issue
that is not linked. Focused `check`, `pm`, and `init` suites passed 234 tests
before the final closing-keyword expansion; the single full local suite then
passed 2178 tests across 80 files. `pnpm typecheck`, `pnpm lint`,
`pnpm compile`, and `pnpm morpheus pm index` passed. CI will check the final
head. No live Evo release was dispatched for this Morpheus policy change.
After the reviewer correction, focused `check`, CLI check, `pm`, and `init`
tests passed 238 tests. Typecheck and lint passed. The local full suite already
ran once; CI will run the corrected head.

The codebase-memory installer could not activate in this session because
active sessions could not be stopped safely. Targeted source, tests, the Evo
worklogs, and the incident description were used as the fallback.
