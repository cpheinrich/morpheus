---
roadmap: MO-26-09-10-09.27.23
---
# Bounded independent review

Implemented default-on local review evidence, a provider-neutral handoff, risk-based budgets,
original-reviewer follow-up for substantive findings, and worklog/label verification in PR
conventions. Existing GitHub model review remains opt-in with skipped required statuses preserved.
A separate metadata-only workflow avoids publishing skipped build/test results over required checks.
The new policy reuses native Git, JSON and existing Zod; no new dependency or model runtime.

Validation: typecheck and compile passed. The full suite passed 1,141 tests; an earlier focused
run hit one unrelated Swift-format test timeout, which passed in the full run. Lifecycle tests
exercise real Git commits, absent/stale evidence, minor fixes, substantive follow-up, independent
sessions, malformed config and bounded budgets. Further final results and review are recorded below.

The graph bootstrap indexed this isolated checkout but reported pre-existing client configuration
ownership warnings; MCP transport then closed. Initial graph discovery used the main clone's
August generation; current source reads and tests supplied the remaining evidence. No unrelated
shared-checkout edits were changed.

Existing consuming projects receive the default gate through updated pr-check.yml. They need
morpheus init (or the documented metadata-only caller) to refresh on label/body edits automatically;
a manual rerun reads live metadata in the meantime. Existing AGENTS.md is never overwritten by init.
