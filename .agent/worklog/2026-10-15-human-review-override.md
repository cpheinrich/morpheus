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
