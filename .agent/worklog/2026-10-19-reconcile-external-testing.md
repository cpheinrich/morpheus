---
roadmap: MO-26-10-19-23.23.55
---
# External TestFlight follow-up

Chris requested external distribution for every Evo build while retaining internal
availability as delivery acceptance. Implemented reusable opt-in configuration,
exact-build external readback and separate post-delivery status. Consumer identities,
configuration migration, runtime pinning and live deployment remain separate work.

Internal receipts, attempt/test/upload history and cursors remain untouched.
Separate historical validation never reaches ordinary external groups. Review
claims precede POST, are shared by app/build across groups, and retain uncertainty.
Explicit conflict retries wait an hour and conservative app admission counts no
more than six claims in 24 hours; metadata/permission rejections do not spam.

Read Apple's actual documentation data for ExternalBetaState, exact build review,
submission and autoNotifyEnabled. Existing upload exports already support external
testing. No action/archive changes or generic package were needed. Provider tests
verify exact routes and request bodies; all provider responses in local tests are
synthetic, not operational delivery proof.

The first new test run exposed two test-driver mistakes: Vitest spread the array
cases into arguments, and a conflict-boundary test ignored the poll schedule.
Corrected the table shape and scheduled the boundary after the preceding poll.
The unchanged production behavior was retained; subsequent tests passed.

## Validation

`pnpm exec vitest run tests/cd` passed 129 tests across eight files. After adding
one multi-group case, `pnpm exec vitest run tests/cd/external.test.ts` passed all
29 external cases. `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index` and
`git diff --check` passed. This scope covers CD adapters, reducer/invariants,
controller, store, workers and CLI-facing policy; no full repository suite was
run locally. CI owns the full suite. Provider tests assert exact request bodies;
state tests cover zero/one-hour/24-hour boundaries and uncertainty/concurrency.

## Independent review

Pending fresh independent review; auto-merge remains disabled until cleared and CI
passes. No live runtime, service, Apple provider or ledger mutation was performed.

The fresh independent Opus reviewer inspected `5b86ae7` and found two substantive
issues before merge: old configuration receipts would be backfilled, and terminal
external work would poll indefinitely at the normal cadence. Corrected eligibility
to the receipt's exact current configuration digest, retained old receipts without
external fields, stopped expired builds, and bounded blocked/rejected work to daily
readback. Internal reconciliation runs first and optional external work is limited
to two deliveries per tick. Unknown review claims read hourly; safe transient
provider observations retain the configured poll cadence.

Also clarified the minor rejected-submission recovery documentation: the core does
not erase or retry a completed rejection; subsequent builds proceed, and separately
owned provider resolution is observed without rewriting claims. Removed the dead
transport-specific 429 rejection check. Same-session independent follow-up is
required before clearance; full initial findings/timing will be retained below.
