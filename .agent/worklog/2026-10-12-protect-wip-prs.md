---
roadmap: MO-26-10-12-11.30.12
date: 2026-10-12
agent: codex
outcome: complete
summary: Hold WIP pull requests and increase the ready PR cooldown to 24 hours.
---

# Keep WIP pull requests out of GitHub Manager merges

The manager previously checked drafts after 48 hours, and a session could mark one ready and
queue auto-merge. Chris clarified that drafts, `wip/` branches, and titles beginning `[WIP]` or
`WIP:` need human input. The sweep now holds them before its cooldown and review routes, cancels
already queued auto-merge, and rechecks the live PR before applying a prior route or session
decision. Rescued trunk drafts still escalate to a human after 48 hours. Ready PRs wait 24 hours
after the later of opening or the latest head commit.

The codebase-memory installer could not activate the exact-checkout index because active sessions
held the service, so the implementation used targeted source reads. Focused manager tests passed
(60 tests); `pnpm typecheck`, `pnpm compile`, and `pnpm morpheus pm index` passed. The full suite
is left to CI because this change does not touch the repository's shared core paths.
