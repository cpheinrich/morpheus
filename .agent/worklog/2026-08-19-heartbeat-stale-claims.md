---
agent: codex
date: 2026-08-19
roadmap: MO-26-08-19-16.19.44
outcome: shipped
summary: Review fixes for stale claim branches, including the pre-reconciliation deadlock.
---

# Heartbeat stale-claim review

PR #143's first shape correctly excluded branches whose item already said `shipped` or `dropped`,
but review found the same deadlock one state earlier: a merged branch can remain `review` until a
later command reconciles it, and a full heartbeat can prevent that later command from starting.

The fix keeps `assess` pure. The command joins its already-fetched claims to one `gh pr list`
result and passes merged review ids as evidence; no board file is written. A full read-only
`reconcile` was considered and rejected because it performs a remote branch lookup per roadmap
item, which is excessive for an hourly beat. Missing `gh` degrades to the original status evidence
instead of being represented as a clean result. The reusable workflow supplies its caller's token
with read-only contents and pull-request permissions; without that explicit environment binding,
the scheduled path would degrade on every run despite the local path working.

The review's two inline defects were fixed as well: the status set is schema-typed and no longer
orphaning `assess`'s JSDoc, and the live-neighbour test now creates real `in-progress` and `review`
items instead of passing through the orphan-claim path. Completed branches are visible in terminal,
Actions-summary, and voice output while remaining outside the dispatch ceiling.
