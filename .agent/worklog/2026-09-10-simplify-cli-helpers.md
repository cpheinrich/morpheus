---
roadmap: MO-26-09-10-21.37.20
---
# Complete medium and low audit findings

Split the executable into a process boundary, importable invocation seam, argument parser,
help text, and one dispatcher per command family. Scalar/boolean option tables replace
the repetitive switch while preserving special consumption rules. Added 146 compatibility
cases for options, all command families, error text, help precedence and provisioning gates.

Consolidated seven identical accessibility probes, two best-effort JSON readers, two strict
optional-content readers, two scaffold writers and two markdown table renderers. Explicitly
preserved the review-context reader's catch-all policy and CLI PM's stat-based probe: those
look similar but do not share the same error contract. Empty-table text remains caller-owned.
Added four real-filesystem/format tests covering missing vs unreadable content, invalid JSON,
preserved files, write errors, bookkeeping, escaping and both empty states.

The exact-worktree index was installed, but MCP transport repeatedly closed; direct source
inspection was used instead of treating graph absence as evidence. Commander was considered
and rejected for this compatibility-preserving refactor; no dependency was added.

Validation: typecheck, 45 files / 1,294 tests, compile and PM index passed. Existing subprocess
Firebase CLI tests and scaffold/PM/review/heartbeat consumers run in that full suite.

A deterministic 10,000-case differential comparison against the original parser matched exactly.
