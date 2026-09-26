---
roadmap: MO-26-09-26-09.37.36
---

# Runner-issued review task paths

Issue #282 reproduced in Evo PR 286: its fresh reviewer has only a canonical task path,
which the UUID/hex-only schema rejected. Accept the exact task path with the existing
`authorSession` serving as globally scoped parent provenance. Compare structured records
for task-path reuse, retaining legacy UUID/hex handling, follow-up identity and all review
coverage/budget requirements. No new generic module or dependency is needed.

Codebase-memory tools are unavailable in this runner. The required installation check
reported no exact-checkout index; repair refused activation because other CBM sessions
are active. Preserved those sessions and used bounded source inspection of review
validation, prompt/scaffold, and local-review tests instead. No graph completeness claim.

Validation: typecheck, full Vitest suite, compile, generated PM index, and local PR checks.
