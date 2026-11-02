---
roadmap: MO-26-11-02-13.06.19
date: 2026-11-02
agent: codex
outcome: completed
tags: [engineering, devops]
---
# Reconcile superseded cancelled CI runs

## Result

The PR waiter rejects cancelled duplicates even after the same workflow succeeds on the same
head. Live Evo #734 evidence has run 41350128338 cancelled and run 41350128661 successful,
both created 2026-11-01T21:05:01Z; the API lists the cancelled run first. The census now
uses stable workflow identity and creation-time/run-ID order to recognize that replacement.
Only cancellations are superseded. Real failures, sole/newest cancellations, different
workflows and malformed/incomplete evidence keep refusing green. A pending replacement waits,
and the final rollup is still confirmed before success.

## Validation

The new regressions failed against the original implementation (11 failures, 42 passes).
They cover both reported shapes, reversed API ordering, pending replacement/timeouts,
unmatched cancellation, genuine failure, foreign/malformed metadata, cancelled visible
jobs and the 100-row incomplete-census boundary. Final focused suite: `pnpm exec vitest run tests/wait-ci` passed 233 tests.
`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm compile`,
`pnpm morpheus pm index` and `git diff --check` passed. The compiled CLI against
Evo PR734 returned green with six checks (five passed, one skipped) in four seconds.
One full `pnpm test` is in progress, explicitly requested by this automation mandate;
no repeat of the full local suite is planned.

## Investigation limits

Graph tools were absent from the session. The supported bootstrap repair refused activation
because other active CBM sessions could not safely stop. Those sessions were left alone;
source and direct tests were used, with no graph-completeness claim. The separate existing
missing-required-check roadmap item MO-26-10-28-15.00.57 remains outside this fix.
