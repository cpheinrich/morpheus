---
roadmap: MO-26-10-23-17.17.21
date: 2026-10-23
agent: codex
---

# Bounded fourth review verification

Chris asked for one modest extra review pass after repeated cap stalls. The draft keeps three
ordinary turns and permits one fourth original-reviewer verification only for a small correction
to a recorded finding or a late test-only correction. It does not resume incomplete reviews,
replace reviewers, reset history, permit a fifth implementation pass, or change the main-merge
exemption. The existing finalization-only turn retains its separate scope.

Proposed limits awaiting activation approval: five minutes for the fourth turn; ordinary review
time through it no greater than twice the risk-class initial ceiling (20/30/60 minutes);
one to four exact changed paths; at most 80 changed test lines and 40 changed non-test lines.
Normative policy files are excluded. The checker measures author commits and leaves trunk merges
under the established exact-or-named integration rule. A reviewer records the changed paths and
focused evidence in the fourth turn. The validator checks budgets, paths, line counts, same
reviewer, coverage, and final clearance.

The policy is review-domain logic in the existing validator, so no generic package was needed.
The narrower automatic path is intended to help cases like Morpheus #414's late test correction,
while evidence-pending and budget-overrun reviews still escalate. This draft does not alter PR
#414 or make a claim about how often future fourth passes will close.

Validation: `pnpm exec vitest run tests/local-review.test.ts` passed 139 of 140 cases; the
single failed case expected different wording from the existing finalization guard. After
correcting that assertion, the six bounded-verification cases passed. The separate
`tests/agent-instructions.test.ts` suite passed 14/14 after the scaffold pointer was shortened.
`pnpm compile` passed and regenerated committed dist output. `pnpm morpheus pm index` made
no changes. `pnpm typecheck` is blocked by an existing import of removed `gray-matter` in
`tests/agentic-cto-skill.test.ts`; this branch does not edit that unrelated test. Full CI
and independent review remain pending. The first independent high-risk reviewer turn blocked
two scope bypasses: a `tests/` helper counted as a test file, and architecture/review-policy
prose was eligible as a finding path. The correction reuses the existing filename-only test rule,
excludes those authority files, and adds regressions for both cases. The same reviewer cleared
both findings at `01bf4e7`, with no scoped regression. The correction's ten focused cases passed.
No gate policy has been merged or activated.

## Independent review

The initial high-risk review blocked two substantive scope bypasses. The same reviewer cleared
both after the author narrowed test-file recognition and excluded review-policy prose. The
reviewer inspected generated output and the new regressions; they did not rerun the tests. The
draft remains unlabelled because the unrelated baseline typecheck failure prevents final
validation and the numeric standing-policy limits await approval.

```morpheus-review
{
  "version": 2,
  "base": "0a4722e7c2f6aa259174e56af7b638dd953e7be5",
  "reviewed": "b9dadd4221ba4c1f2f9829d07995b795ffd6c8d3",
  "covered": "01bf4e77d3f9516d8d8ca36e44e636cc0e5eb433",
  "authorSession": "01a16b3b-ef76-7539-a024-cf9f5fe9f00f",
  "reviewerSession": "/root/bounded_review_gate_reviewer",
  "risk": "high",
  "elapsedMinutes": 0.95,
  "timing": {
    "source": "clock",
    "durationMs": 57000,
    "evidence": "Author clock readings around the initial reviewer invocation: 2026-10-24 00:31:14 UTC to 00:32:11 UTC."
  },
  "outcome": "complete",
  "summary": "Initial review blocked two substantive scope bypasses; the same reviewer cleared both after filename-only test recognition and review-policy exclusions were added, with focused regressions.",
  "findings": [
    {
      "id": "SCOPE-TEST",
      "severity": "substantive",
      "description": "Classifying every file under tests/ as a test let an executable helper enter the automatic late-test pass and its larger line allowance.",
      "paths": ["src/review/local.ts", "tests/local-review.test.ts"],
      "disposition": "fixed",
      "response": "Reused the existing filename-only test rule and added a rejecting tests/helper.ts regression. The same reviewer cleared the correction."
    },
    {
      "id": "SCOPE-POLICY",
      "severity": "substantive",
      "description": "The fourth-turn finding-fix path check allowed architecture.md and the independent-review runbook, both policy authority files.",
      "paths": ["src/review/local.ts", "docs/runbooks/independent-review.md", "tests/local-review.test.ts"],
      "disposition": "fixed",
      "response": "Excluded architecture.md, the independent-review runbook and .agent/decisions.md, with one rejecting regression per path. The same reviewer cleared the correction."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/bounded_review_gate_reviewer",
      "commit": "01bf4e77d3f9516d8d8ca36e44e636cc0e5eb433",
      "outcome": "cleared",
      "elapsedMinutes": 0.3333333333333333,
      "timing": {
        "source": "clock",
        "durationMs": 20000,
        "evidence": "Author clock readings around the focused same-reviewer invocation: 2026-10-24 00:33:38 UTC to 00:33:58 UTC."
      },
      "summary": "Both scope findings cleared at 01bf4e7; filename-only tests and policy exclusions are enforced and covered by regressions."
    }
  ]
}
```
