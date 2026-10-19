---
agent: codex
date: 2026-10-19
roadmap: MO-26-10-12-09.17.58
outcome: review
---

# Refresh frontmatter remediation

Merged exact `origin/main` `e72e58ee9a3a` into draft #376. The merge conflicted only in the
append-only decisions log and retained both decisions. Current main had added frontmatter consumers
in PM worktree cleanup and local review validation; both still imported the package this draft
removes, so the refresh moves them to `@11ty/gray-matter` and regenerates committed output.

Validation: `pnpm audit --prod` reports no known vulnerabilities; typecheck passes; 290 focused
PM, inbox, team, local-review, and cleanup tests pass; compile and PM index pass. Independent
review is pending.
