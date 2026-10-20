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


The same reviewer cleared F1–F4 on `31e5697` after running all 133 CD tests.
During that invocation, actual consumer evidence arrived showing an external
beta group's optional `hasAccessToAllBuilds` is null despite successful exact-build
external availability. Apple's BetaGroup attribute documentation marks it optional
and does not promise a false value for external groups. Corrected external handling
to reject only affirmative all-build access while preserving internal explicit-false
promotion requirements. Added all eight internal/external true/false/null/absent
cases. This acceptance correction receives the remaining same-reviewer turn; no
provider group was patched to satisfy a guessed contract.


## Final validation and review record

Initial review was blocked; no clearance or timing was rewritten. All three turns
used the same fresh subscription reviewer session. Final `pnpm exec vitest run
tests/cd` passed 141 tests in eight files; typecheck, compile, index and diff checks
passed. Full CI and merge remain the final author-managed gates.

The fresh independent high-risk review found two substantive defects and two minor issues, all fixed and cleared by the same reviewer. Follow-up verified historical receipt exclusion, bounded polling and internal-first work; the final late-correction turn verified Apple external null/absent all-build attributes while preserving strict internal guards. Final focused CD tests passed 141 cases across eight files. Provider tests are synthetic; consumer migration, live runtime adoption and operational acceptance remain separate.

```morpheus-review
{
  "version": 2,
  "base": "d8ab2ee2ff14b90a18402150788c784e425667db",
  "reviewed": "5b86ae700fdbb87a31b0328f39ef4f3b57e3209c",
  "covered": "7016f1c07c7096b7e13a01e1b103ccce78d2157c",
  "authorSession": "01a15730-01ee-7f52-a39c-6c4bd5e9812d",
  "reviewerSession": "c82fd4dd-05b4-45ae-ab80-3f6e6a16aa21",
  "risk": "high",
  "elapsedMinutes": 2.0093,
  "timing": {
    "source": "runner",
    "durationMs": 120558,
    "evidence": "Claude Opus Max session c82fd4dd-05b4-45ae-ab80-3f6e6a16aa21 initial result duration_ms=120558; /tmp/morpheus-431-opus-review-result.json, started2026-10-20T06:33:00.329559Z."
  },
  "outcome": "complete",
  "summary": "The fresh independent high-risk review found two substantive defects and two minor issues, all fixed and cleared by the same reviewer. Follow-up verified historical receipt exclusion, bounded polling and internal-first work; the final late-correction turn verified Apple external null/absent all-build attributes while preserving strict internal guards. Final focused CD tests passed 141 cases across eight files. Provider tests are synthetic; consumer migration, live runtime adoption and operational acceptance remain separate.",
  "findings": [
    {
      "id": "EXT-F1",
      "severity": "substantive",
      "description": "Reviewer F1: opt-in would backfill historical ordinary deliveries and consume review/notification admission on old builds.",
      "paths": [
        "src/cd/controller.ts",
        "src/cd/state.ts",
        "tests/cd/external.test.ts"
      ],
      "disposition": "fixed",
      "response": "Require immutable receipt configurationDigest to equal the opted-in current config both at tick/reconcile and claim boundaries. Regression proves old receipts have zero external calls/fields and unchanged internal state; same reviewer cleared31e5697."
    },
    {
      "id": "EXT-F2",
      "severity": "substantive",
      "description": "Reviewer F2: terminal and rejected external states would poll forever at normal cadence and compete with internal work.",
      "paths": [
        "src/cd/controller.ts",
        "src/cd/schema.ts",
        "src/cd/invariants.ts",
        "tests/cd/external.test.ts"
      ],
      "disposition": "fixed",
      "response": "Expired evidence is terminal/immutable; blocked/rejected readback is daily, unknown review readback hourly, safe transient reads retain normal cadence. Internal obligations run first and external reconciliation is bounded to two per invocation. Boundary/backlog tests passed; same reviewer cleared31e5697."
    },
    {
      "id": "EXT-F3",
      "severity": "minor",
      "description": "Reviewer F3: docs promised explicit rejected-claim resolution but core provided no such command.",
      "paths": [
        "docs/cd-v2-controller.md"
      ],
      "disposition": "fixed",
      "response": "Documented that core never erases/retries completed rejection; subsequent builds proceed after repair, while consumer-owned provider tooling may resolve an exact build and daily observation records availability. Same reviewer cleared wording."
    },
    {
      "id": "EXT-F4",
      "severity": "minor",
      "description": "Reviewer F4: AppleRequestError rejection branch had an unreachable429 exception because real transport emits CdWait.",
      "paths": [
        "src/cd/controller.ts"
      ],
      "disposition": "fixed",
      "response": "Removed the dead check; transient lost-group-response test uses actual CdWait semantics. Same reviewer confirmed resolution."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "c82fd4dd-05b4-45ae-ab80-3f6e6a16aa21",
      "commit": "31e569710c1ede2a3ad63e729a42585bce208b8d",
      "outcome": "cleared",
      "elapsedMinutes": 0.6643833333333333,
      "timing": {
        "source": "runner",
        "durationMs": 39863,
        "evidence": "Same Claude Opus Max session focused result duration_ms=39863; /tmp/morpheus-431-opus-followup-result.json, started2026-10-20T06:38:34.725959Z."
      },
      "summary": "Cleared F1\u2013F4 after inspecting fixes and running all133focused CD tests; no regressions found. Nonblocking future-config migration observation documented in final turn."
    },
    {
      "reviewerSession": "c82fd4dd-05b4-45ae-ab80-3f6e6a16aa21",
      "commit": "7016f1c07c7096b7e13a01e1b103ccce78d2157c",
      "outcome": "cleared",
      "elapsedMinutes": 0.4288166666666667,
      "timing": {
        "source": "runner",
        "durationMs": 25729,
        "evidence": "Same Claude Opus Max session late-correction result duration_ms=25729; /tmp/morpheus-431-opus-final-result.json, started2026-10-20T06:40:38.943322Z."
      },
      "scopeReason": "Late acceptance correction: actual Apple external group returned optional hasAccessToAllBuilds:null; verify null/absent support externally while retaining strict internal guard, generated output, boundary tests and matching docs.",
      "summary": "Cleared exact7016f1c after checking internal callers, all eight role/value cases, unchanged F1\u2013F4 fixes and141focused CD tests; no new findings or regressions."
    }
  ]
}
```
