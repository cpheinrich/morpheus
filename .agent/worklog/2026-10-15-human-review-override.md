# Human override of an incomplete review — 2026-10-15

Issue #248's legacy `review-waived:` confusion was resolved earlier; this task addresses the
remaining case where an honest `incomplete` independent-review record cannot be merged even after
Chris accepts its limits. Chris approved a documented human-requested override and an explicit
GitHub marker.

The implementation uses a `review-override` label and a comment authored by a configured human.
The comment names the full current PR head and a specific reason. Approver authority comes from
protected trunk's committed `morpheus.json`, so a PR cannot add its own approver. The same base
check prevents a PR setting `review.required=false` to waive itself. The reviewer record retains
its incomplete verdict, measured duration, provenance, findings and code coverage. The exception
is reported as a human override, not agent clearance. I created the repository label with a
description explaining the contract.

Dead ends: the codebase-memory installer could not safely stop existing sessions, so I used the
review checker, workflow and focused test sources directly. The one permitted local full-suite run
passed 2,202 of 2,203 tests; the remaining scaffold-instructions size test rejected extra prose I
had added. I shortened the scaffold pointer and its focused test then passed. The final CI run
must confirm the entire suite. Focused `tests/local-review.test.ts` and `tests/workflows.test.ts`
passed; `pnpm typecheck`, `pnpm compile` and `pnpm morpheus pm index` passed.

The first independent review blocked clearance on five substantive findings. F01: a disputed
substantive finding could pass with an incomplete final turn; the override now refuses it. F02:
zero or absent timing could pass; every overridden turn now needs positive measured timing, even
on a historical version 1 record. F03: the Manager's alternate checker could accept a PR's own
`review.required=false` change; both paths now read that policy from protected trunk. F04: a
human could remove their comment after a green check; comment edit/delete events now rerun the
existing PR-head conventions job, which reads the current comments. F05: a generic comment could
pass the length check; the comment now has separate review-limit and accepted-risk lines, and
generic approvals are refused. Focused regression tests cover each case.

The comment revocation workflow selects the existing metadata run by current PR head SHA and
branch. GitHub's Actions run API returned an empty `pull_requests` array for older metadata runs,
so selecting by that array would have missed a real prior check. This was caught with a read of
the repository's existing runs before finalizing the workflow.

After the correction, `pnpm exec vitest run tests/local-review.test.ts` passed 142/142 and
`pnpm exec vitest run tests/workflows.test.ts tests/manager-review.test.ts` passed 186/186.
`pnpm typecheck` and `pnpm compile` passed. The local full-suite allowance was already spent;
CI will run the complete suite on the corrected commit.
