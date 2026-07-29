---
date: 2026-07-29
agent: claude
roadmap: MO-002
outcome: shipped
summary: Reusable workflows plus morpheus check pr — the enforcement half of the AGENTS.md conventions.
---

## What was built

`src/check/pr.ts` and `morpheus check pr`, plus three reusable workflows: `pr-check`, `web-ci`,
and the existing `node-ci` / `pm-check`. Morpheus's own CI calls all of them, so they break here
before they break in a consuming project.

The check enforces: tests accompany source changes (waivable with an explicit `skip-tests:`
reason), the PR body has a non-empty test plan, the branch names a real roadmap item, and that
item has been moved to `review`. Missing open-questions and docs-with-API-change are warnings
rather than errors — worth surfacing, not worth blocking on.

## What was learned

`hasSection` originally used `\z` to mean end-of-input. That is Perl and Ruby syntax; JavaScript
has no `\z`, so the regex silently matched nothing useful and four tests failed. Rewrote it as a
line scan rather than reaching for `(?![\s\S])` — the "content until the next heading" shape reads
better as a loop, and the loop is obviously correct in a way the regex was not.

Worth noting the shape of the bug: it did not throw, it just quietly returned `false` for every
valid section. A regex that is syntactically legal but semantically wrong is the failure mode to
watch for here.

## Design note

The waiver is deliberately a free-text reason (`skip-tests: pure rename`) rather than a boolean.
A boolean gets set reflexively; a reason has to be written, and shows up in review.
