---
date: 2026-09-16
agent: codex
roadmap: MO-26-09-16-00.31.52
outcome: review
summary: Preserve cleared reviews across verified integration of reviewed documentation.
---

Chris approved a narrow exception after Lakina's release cleared its two-pass review
but became stale solely through integration of a separately reviewed README prerequisite.
The author accepts responsibility for landing that prerequisite too late in the review lifecycle.

Added optional documentationIntegrations evidence without replacing original clearance.
Every incoming linear trunk commit must carry complete independent review evidence
based on its parent and change only allowed regular Markdown files. Git reconstructs
the exact conflict-free merge tree. All other after-coverage changes still fail, as do
unresolved original findings, incomplete reviews and exceeded budgets. The source review
record is a committed attestation (including original pre-squash hashes), not a new
GitHub API authentication step or a replacement review. Changed requirements do not qualify.

Updated the runbook, architecture, author/reviewer instructions, scaffold and generated CLI.
Native Git/Zod/JSON already implement this project-specific evidence contract; no new
generic package was introduced. Issue #252 records the upstream gap and decision.

Validation: pnpm typecheck, pnpm compile and all 1,333 tests across 47 files passed.
Thirty review lifecycle tests include real squash/merge histories and rejection cases for
source/configuration/instruction paths, symlinks, executable Markdown, missing/incomplete
or wrong-base review evidence, conflicts, extra merge edits and unresolved findings.
Initial new fixtures failed because Git removed an untracked-empty worklog directory
on checkout; explicitly recreating it fixed the fixture. A no-change fixture commit
was also corrected. These failures preceded the successful full run.

Graph Verify: main project generation 2026-09-14T00:54:39Z found review validators;
exact task checkout generation 2026-09-16T07:33:06Z has no recorded gaps for touched
review/template/test paths, but reports metadata_changed after edits. Read the exact
source/diffs and exercised the real-Git tests as fallback. Generated dist is excluded
from the graph and was rebuilt with the compiler. Independent review, 2026-09-16: the authoring session ended before starting it, so a fresh session
resumed the task, ran the review, fixed the minor findings, integrated trunk and recorded it.

Independent high-risk review of 357737f452f82b6ef13c027223bb37c43403032e completed in 7 minutes with no substantive findings and two minor ones: a conflicting merge-tree reconstruction surfaced as a raw git command failure instead of the named conflict-free-merge-tree error, and the runbook overstated the trunk check while omitting that reconstruction runs without rename detection. The reviewer probed the allowlist against the real diff and file modes, the exactness of the merge-tree comparison, the source-evidence check against each incoming commit's own tree, ancestry pinning against fabricated off-trunk records, and that records without documentationIntegrations keep the prior behaviour. The author fixed both in 40fc1f1 and integrated trunk at ae39550 (five merges landed during the review) in 94c8daa3d7fc7d9faebee8cd6f01f98d08dd1776; the same reviewer's follow-up cleared the fixes and the integration in 2 minutes. Three incidental notes stand for the human: records-only trunk commits carry no record and so cannot use this path, the allowlist includes decisions/learned and roadmap items whose acceptance sections the author must judge, and merge-tree --write-tree needs Git 2.38 or newer and fails closed below it.

```morpheus-review
{
  "version": 1,
  "base": "5a096dcdd7559aa62c81c8da0241253da68040bd",
  "reviewed": "357737f452f82b6ef13c027223bb37c43403032e",
  "covered": "94c8daa3d7fc7d9faebee8cd6f01f98d08dd1776",
  "authorSession": "7721007e-1b81-586e-8ac8-39c717a85b5f",
  "reviewerSession": "claude-review-253-0359",
  "risk": "high",
  "elapsedMinutes": 7,
  "outcome": "complete",
  "summary": "Independent high-risk review of 357737f452f82b6ef13c027223bb37c43403032e completed in 7 minutes with no substantive findings and two minor ones: a conflicting merge-tree reconstruction surfaced as a raw git command failure instead of the named conflict-free-merge-tree error, and the runbook overstated the trunk check while omitting that reconstruction runs without rename detection. The reviewer probed the allowlist against the real diff and file modes, the exactness of the merge-tree comparison, the source-evidence check against each incoming commit's own tree, ancestry pinning against fabricated off-trunk records, and that records without documentationIntegrations keep the prior behaviour. The author fixed both in 40fc1f1 and integrated trunk at ae39550 (five merges landed during the review) in 94c8daa3d7fc7d9faebee8cd6f01f98d08dd1776; the same reviewer's follow-up cleared the fixes and the integration in 2 minutes. Three incidental notes stand for the human: records-only trunk commits carry no record and so cannot use this path, the allowlist includes decisions/learned and roadmap items whose acceptance sections the author must judge, and merge-tree --write-tree needs Git 2.38 or newer and fails closed below it.",
  "findings": [
    { "id": "DOC-M1", "severity": "minor", "description": "merge-tree --write-tree exits non-zero on a conflict, so the helper threw a raw command failure instead of the intended conflict-free-merge-tree message; two tests asserted only a finding count.", "paths": ["src/review/local.ts", "tests/local-review.test.ts", "dist/review/local.js", "dist/review/local.js.map"], "disposition": "fixed", "response": "The non-zero exit is caught and falls through to the named error; the conflict test asserts 'conflict-free merge tree' and the missing-evidence test asserts 'after covered commit' (40fc1f1)." },
    { "id": "DOC-M2", "severity": "minor", "description": "The runbook said current trunk must equal the final integration base, which overstates the merge-base check, and did not say reconstruction runs without rename detection.", "paths": ["docs/runbooks/independent-review.md"], "disposition": "fixed", "response": "The runbook states the merge-base rule, that GitHub's up-to-date rule covers later trunk commits, and that a rename-resolved merge is refused rather than trusted (40fc1f1)." },
    { "id": "DOC-I1", "severity": "incidental", "description": "Records-only trunk commits are exempt from agent-review and carry no record, so a cleared feature stalled by an inbox PR cannot use this path.", "paths": ["src/review/local.ts"], "disposition": "deferred", "response": "Outside this ticket; flagged in the inbox as the likely next recurrence of the same stall." },
    { "id": "DOC-I2", "severity": "incidental", "description": "The allowlist includes .agent/decisions.md, .agent/learned.md and roadmap items whose acceptance sections can change requirements; the runbook assigns that judgment to the author.", "paths": ["src/review/local.ts", "docs/runbooks/independent-review.md"], "disposition": "deferred", "response": "Consistent with the approved decision; the trust boundary is stated in the runbook." },
    { "id": "DOC-I3", "severity": "incidental", "description": "merge-tree --write-tree needs Git 2.38 or newer; older local Git fails closed with a raw command error.", "paths": ["src/review/local.ts"], "disposition": "deferred", "response": "Fails closed, never bypasses; CI runs a current Git." }
  ],
  "followUp": {
    "reviewerSession": "claude-review-253-0359",
    "commit": "94c8daa3d7fc7d9faebee8cd6f01f98d08dd1776",
    "base": "ae395506dff80c636395e5c56d1bbf6d1caf8d96",
    "scopeReason": "Trunk advanced through five merges (#246, #179, #209, #255, #254) to ae39550 after the initial review; strict branch protection requires integration, so the one same-session follow-up covered the two minor fixes and the integration merge together.",
    "outcome": "cleared",
    "elapsedMinutes": 2,
    "summary": "Follow-up cleared 94c8daa: both minor fixes as described, the gate and its tests byte-identical to the fix commit, the merge carrying only this PR's own files with one date-line conflict and regenerated dist maps, typecheck and the 30 focused tests passing with no dist drift."
  }
}
```
