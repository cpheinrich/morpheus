---
agent: codex
date: 2026-09-10
roadmap: MO-26-09-10-19.44.46
outcome: review
---

# Declare PR metadata read permissions

The issue-triage automation resumed existing PR #233 for issue #231 in an isolated worktree,
preserving the original author's checkout. The implementation grants contents/read and
pull-requests/read to the reusable job, both Morpheus callers, and both generated callers.
Existing downstream callers must grant the same permissions; the reusable job cannot elevate them.

## Evidence and validation

- Original remote head de679101d96ae552f4e367262a3ea9b4bde25c18 passed node and PM CI;
  conventions reached the checker and failed only because independent-review evidence was missing.
- Frozen-lockfile install, pnpm typecheck, pnpm test, pnpm compile, pnpm morpheus pm index,
  and inbox validation run again before review. Tests assert both generated caller grants.
- No production deployment or credential changes are needed for this workflow repair.
- Issue #231 is linked to the existing roadmap item; no duplicate claim or PR was created.

## Independent review

Pending the fresh bounded reviewer session.
