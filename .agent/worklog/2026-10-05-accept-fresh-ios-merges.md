---
agent: codex
date: 2026-10-05
roadmap: MO-26-10-05-12.04.25
outcome: review
---

# Accept regenerated iOS PR merges

Issues #298 and #313 share the same reproduced cause: the native scope gate compared the
checkout first parent to the triggering event base for equality. A newer valid base failed
before native compilation; rerunning the event could not change its stale payload.

Scoped PR checkouts now fetch ancestry, require a two-parent merge and the exact event head,
and verify that the actual base descends from the event base. The diff remains actual-base to
merge, so native changes already on trunk do not trigger a docs-only PR. Invalid SHAs, wrong
head, unrelated base and unavailable comparison history refuse with diagnostics. Unconfigured
and non-PR callers retain depth-two checkout and normal native execution. No dependency or
generic module: this extends the existing repository-specific Git verification boundary.

The two advanced-base regression fixtures failed before the fix. The harness executes the
actual YAML shell against real Git histories; a depth-two local clone refuses missing ancestry,
then classifies correctly once full history is available. Existing pathspec, rename/deletion,
whole-PR and event/default cases remain covered. The first full run caught an old formatter
test requiring a constant fetch depth of two; it now asserts the scoped checkout expression.

Graph limitation: codebase-memory install --check and install failed because another CBM
generation could not be safely stopped. list_projects and check_index_coverage both refused
for the same active-session conflict. No other session was interrupted. Direct reads covered
.github/workflows/ios-ci.yml, tests/ios-change-scope.test.ts, the related formatter assertion
in tests/workflows.test.ts, and architecture sections 9 and the native workflow contract.
No graph generation or completeness is claimed.

Frozen-lockfile install, typecheck, all 1,628 tests across 59 files, compilation, PM index,
lint, inbox validation and git diff --check passed. No rendered surface changed. Independent
review is pending; auto-merge remains disabled.
