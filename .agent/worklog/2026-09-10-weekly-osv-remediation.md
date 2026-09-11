---
roadmap: MO-26-09-10-21.45.21
---
# Weekly OSV remediation

Chris requested removing push scans and keeping weekly scans with one dependency change per
PR, full validation and merge. Security now has only Monday 12:30 UTC and manual triggers.
A read-only Node handoff validates the exact workflow/repository/main run, consumes pinned OSV
SARIF, and groups dependency findings. It refuses missing/unknown/failed-empty evidence. The
versioned runbook drives a separate local Codex heartbeat, with persisted checkpoints, ownership,
normal review and merge protection, and a post-merge main scan. Host availability is documented.

Current findings were reproduced from run 34554174220. The issue-triage task independently
completed js-yaml PR #219 (merge 3d310a4). This task reused Vitest PR #216, validated its exact
current-main head 27a44ad84ff755e8115aa3dfa2ac236c2a8f2129 with a frozen install, typecheck,
all 1,144 tests across 42 files, and compile; required CI passed. Its diff updated only Vitest
and the dependency closure, including affected @vitest/mocker 4.1.10 to 4.1.11. The exact
Dependabot dependency-only exception applies. PR #216 merged at ed5ab1e; remote branch deleted.

Handoff tests cover malformed/absent reports, scoped names, aggregation, wrong repository/ref/
workflow, cancelled/running scans, download failure, failed-empty vs successful-empty reports,
explicit historical bootstrap and invalid ids. Before integration, typecheck, 1,163 tests,
compile and index validation passed. The handoff also read the real baseline artifact successfully.
The knowledge graph lacked these new workflow/script paths, so current source and direct tests
were used as the evidence fallback. No source search absence was treated as completeness.

The installed packageManager is pnpm 11.9.0; the supported compilation script is `pnpm compile`
(the older AGENTS example says build). No API credential or GitHub agent token was added. The
local heartbeat registration and final main OSV scan are verified after the implementation merge.

After integration, frozen install, typecheck, all 1,164 tests (43 files), compile and index passed.
The real post-fix scan 34563699785 was clean; all three GitHub alerts report fixed.
The local heartbeat morpheus-osv-remediation is registered PAUSED pending this merge.

Initial review and first integration follow-up were clean, covering 8a2e493. Concurrent PR #234 then advanced main. The same reviewer declined an additional integration-only round under the explicit two-pass limit. Final integration 159dafa passes all 1314 tests, but remains outside reviewer coverage. PR stays open without agent-reviewed or auto-merge; a narrow human exception is required before another review.

```morpheus-review
{
  "version": 1,
  "base": "ed5ab1efc0697494750577287213d86cec7680d8",
  "reviewed": "af27ffe22966cf8607231cab4c70003e8a60afb3",
  "covered": "8a2e4937f140c68f8db7a4a8690bc12e99d4845e",
  "authorSession": "01a08ec2-13bf-7f72-9c47-a3280a04008f",
  "reviewerSession": "/root/osv_review",
  "risk": "normal",
  "elapsedMinutes": 4,
  "outcome": "incomplete",
  "summary": "Initial review and first integration follow-up were clean, covering 8a2e493. Concurrent PR #234 then advanced main. The same reviewer declined an additional integration-only round under the explicit two-pass limit. Final integration 159dafa passes all 1314 tests, but remains outside reviewer coverage. PR stays open without agent-reviewed or auto-merge; a narrow human exception is required before another review.",
  "findings": [],
  "followUp": {
    "reviewerSession": "/root/osv_review",
    "commit": "8a2e4937f140c68f8db7a4a8690bc12e99d4845e",
    "base": "df5c26a25ccfc2655c06bce2aaec7019f097509b",
    "scopeReason": "Integrate trunk workflow hardening and verify overlapping workflow tests against the integrated commit.",
    "outcome": "cleared",
    "elapsedMinutes": 1,
    "summary": "No findings. Integration preserves OSV triggers and leaves the inspector and runbook unchanged. All 147 focused tests pass."
  }
}
```

## Final integration awaiting review authorization

An explicit author proposal for a five-minute integration-only addendum was declined by the
same reviewer because the contract says it does not permit a third round. No replacement reviewer
was started and no clearance was fabricated. The last cleared commit remains 8a2e493; the final
main integration 159dafa (base 4611e91) passes typecheck, all 1,314 tests in 46 files, compile and
PM index. The two prior clean reviews are retained above. Activation of the paused heartbeat and
merge of PR #236 require permission for one additional integration-only review, not a bypass merge.
