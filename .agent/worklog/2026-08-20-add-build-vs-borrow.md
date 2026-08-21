---
date: 2026-08-20
agent: claude
roadmap: MO-26-08-20-18.58.00
outcome: review
summary: Added a visible build-vs-borrow decision point before agents write generic modules.
---

# Build vs. borrow convention

Chris asked how to make agents propose applicable open-source packages instead of always building
from scratch — the observed failure being that neither Claude nor Codex raises the option unless
explicitly asked. The diagnosis: a standing preference has no trigger moment, so it never fires.
The fix is a convention with a trigger (before writing a generic module), a cheap search step, and
a required visible output (propose in the inbox or PR body, in either direction) — the same
forcing mechanism as the inbox options format.

Added to Morpheus's `AGENTS.md` and the `agents()` scaffold template, with an init test pinning
the three load-bearing phrases so the template cannot silently drop them.

Follow-up review removed the arbitrary two-minute timebox. The convention now asks for one quick
registry search and deeper candidate checks only when that search finds something credible.

Learned along the way:

- `check pr` treats a non-item branch as a *warning* only, and AGENTS.md-only changes trigger no
  tests requirement — so the per-project rollout PRs (docs-only, `docs-` branches) pass with just
  Test plan and Open questions sections. Verified by reading `src/check/pr.ts`, not assumed.
- `morpheus init` never overwrites, so a template change reaches no existing project. Rollout to
  the seven registered repos is manual, one PR each, tracked from the roadmap item.
