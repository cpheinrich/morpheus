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
review completed as recorded below.

Independent reviewer /root/review_ios_merge cleared the exact remote head at high risk with one minor documentation finding and no substantive findings. The author corrected only the contradictory formatter-history paragraph in architecture.md; the reviewer permitted that bounded fix without another turn. The reviewer independently verified pinned checkout behavior, both issues, invalid comparison refusals, and 36 focused tests (126 intentionally skipped). Graph access was unavailable; direct source inspection supplied the evidence.

```morpheus-review
{
  "version": 2,
  "base": "44ef974a7d7fc4fbb3f0d3e25c56c4eff2d9feb9",
  "reviewed": "2e1a72f9af85ef62aefd93618139e445c2e02b6b",
  "covered": "818ffb0e6ba0455c3a48e3718392d41a86be6047",
  "authorSession": "01a10d70-d792-73d1-92b1-2350f0a012fe",
  "reviewerSession": "/root/review_ios_merge",
  "risk": "high",
  "elapsedMinutes": 2.6333333333333333,
  "timing": {
    "source": "clock",
    "durationMs": 158000,
    "evidence": "Author clock read immediately before spawn: 2026-10-05 19:14:44 UTC. Reviewer final clock observation at completion: 2026-10-05 19:17:22 UTC, returned in /root/review_ios_merge final result. Full invocation including tool calls, 158000 ms; no workload estimate."
  },
  "outcome": "complete",
  "summary": "Independent reviewer /root/review_ios_merge cleared the exact remote head at high risk with one minor documentation finding and no substantive findings. The author corrected only the contradictory formatter-history paragraph in architecture.md; the reviewer permitted that bounded fix without another turn. The reviewer independently verified pinned checkout behavior, both issues, invalid comparison refusals, and 36 focused tests (126 intentionally skipped). Graph access was unavailable; direct source inspection supplied the evidence.",
  "findings": [
    {
      "id": "IOS-M01",
      "severity": "minor",
      "description": "The older formatter paragraph incorrectly claimed checkout never downloads full history, contradicting scoped PR ancestry fetching.",
      "paths": [
        "architecture.md"
      ],
      "disposition": "fixed",
      "response": "Qualified the paragraph to state the formatter requires only the first parent while scoped PRs fetch full history for ancestry validation. Commit 818ffb0e6ba0455c3a48e3718392d41a86be6047 changes only this documentation paragraph, as the reviewer explicitly allowed without another turn."
    }
  ]
}
```
