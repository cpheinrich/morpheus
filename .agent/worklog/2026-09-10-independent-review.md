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

## Initial independent review and author response

The fresh reviewer session /root/independent_review reviewed 98d8a1fba562f78223c7d0999e4a2ced776d6fc5
against c17f63fb5996628a1ed7e8b117326599adcf746d in approximately nine active minutes. A transport
disconnection interrupted the session; it resumed the same initial review after Chris requested
restart/completion. Disconnected idle time is excluded. No substantive findings were raised.
IR-001 was minor: the required visible summary could be hidden in an HTML comment. Fixed by
validating visible prose, with comment/code-fence regression tests. The initial CI run passed node
and PM checks and correctly refused conventions because the review label was absent; live PR
metadata fetching succeeded.

Explicit scope decision: strict branch protection requires integrating trunk, which advanced during
the interruption. Rather than discard or misstate the original review, the one same-session
follow-up will cover the required integration and the new followUp.base/scopeReason contract.
The initial finding remains minor; this is a scope adjustment, not an invented substantive finding.
Merged current trunk 907f6761815cf142677302030fc62907a33cec85 without conflicts. Original review
SHA remains unchanged, and the scoped follow-up must cover the integrated commit. No third round.

After the fix and integration, typecheck/compile passed and all 1,144 tests passed. Review completion
is pending the same reviewer's focused follow-up; the label and auto-merge remain off.

## Completed independent review

Independent review found one minor issue: a worklog summary could be hidden in an HTML comment. The author fixed it and added regression tests. An explicit scope adjustment used the one same-reviewer follow-up to verify required trunk integration while preserving the original review history. The reviewer cleared the final covered commit with no new actionable or substantive findings. Initial review took approximately nine active minutes and follow-up four; disconnected idle time was excluded.

```morpheus-review
{
  "version": 1,
  "base": "c17f63fb5996628a1ed7e8b117326599adcf746d",
  "reviewed": "98d8a1fba562f78223c7d0999e4a2ced776d6fc5",
  "covered": "ca5ea4f2a2ed9cd4dcd34db75220b8593554752d",
  "authorSession": "/root",
  "reviewerSession": "/root/independent_review",
  "risk": "high",
  "elapsedMinutes": 9,
  "outcome": "complete",
  "summary": "Independent review found one minor issue: a worklog summary could be hidden in an HTML comment. The author fixed it and added regression tests. An explicit scope adjustment used the one same-reviewer follow-up to verify required trunk integration while preserving the original review history. The reviewer cleared the final covered commit with no new actionable or substantive findings. Initial review took approximately nine active minutes and follow-up four; disconnected idle time was excluded.",
  "findings": [
    {
      "id": "IR-001",
      "severity": "minor",
      "description": "The visible review summary could be satisfied by text entirely inside an HTML comment.",
      "paths": [
        "src/review/local.ts",
        "tests/local-review.test.ts",
        "dist/review/local.js",
        "dist/review/local.js.map"
      ],
      "disposition": "fixed",
      "response": "Validate visible prose outside the JSON block; added regressions rejecting summaries hidden in HTML comments and code fences."
    }
  ],
  "followUp": {
    "reviewerSession": "/root/independent_review",
    "commit": "ca5ea4f2a2ed9cd4dcd34db75220b8593554752d",
    "base": "907f6761815cf142677302030fc62907a33cec85",
    "scopeReason": "Explicitly include required trunk integration and its coverage protocol in the one follow-up while preserving the original minor-only initial review.",
    "outcome": "cleared",
    "elapsedMinutes": 4,
    "summary": "IR-001 resolved. Verified preserved initial review history, explicit integration scope, integrated-base ancestry and covered commit. Trunk signing changes match their merged version. All 16 focused lifecycle tests passed; no new actionable findings."
  }
}
```
