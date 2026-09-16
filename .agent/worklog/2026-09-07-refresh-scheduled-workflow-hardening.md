---
agent: codex
date: 2026-09-07
roadmap: MO-26-08-28-20.59.54
outcome: review
---

# Refresh scheduled-workflow hardening

Merged current `origin/main` into draft #177 and preserved both the immutable-action decision and
all newer project decisions. The default-branch schedule still fails before job creation; this
draft remains the bounded permission and action-pin repair. Typecheck, all 1,103 tests, compile,
and `git diff --check` pass against the refreshed tree.

The refreshed tests exposed mutable action tags in the newer Dependabot maintainer and nightly iOS
workflows. Resolved each current major through GitHub to its immutable commit and pinned those new
call sites as part of this draft's existing action-integrity contract.
