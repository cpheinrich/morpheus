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
excludes those authority files, and adds regressions for both cases. The original reviewer must
verify this fix. No gate policy has been merged or activated.
