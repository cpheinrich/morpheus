---
roadmap: MO-26-10-22-17.44.48
---

# Cancelled, never-assigned Ubuntu companions

## Phase A — source design and local qualification

The actual complete five-job terminal census contains two executed successful
Ubuntu jobs, a cancelled native no-assignment job and cancelled Ubuntu/native
downstream placeholders. The qualify/upload completion precedes their creation by
one second, and creation/start are the same exact strings. The previous classifier
accepts only successful Ubuntu or skipped companions, so it creates repair work
instead of the intended ordinary hosted successor.

The acceptance design was written before the new regression and production fix.
The regression fails on the unchanged controller: `repairing` instead of `pending`.
The retained raw file is not edited or committed. Public tests retain all five
rows' classifier-used execution/timestamp fields; IDs, positive runner names and
the unique admission-label token are rebound/anonymized. The raw file hash and
field projection are preserved in the acceptance document/private evidence.

The new exception is restricted to completed cancelled Ubuntu companions with
`neverRan`, explicit null/zero/empty group identity and no steps. It additionally
requires actual executed successful Ubuntu preflight evidence in the complete
census. Failed or unverified preflight and assigned, started, malformed, foreign
or step-bearing companions refuse. Existing skipped/successful paths, queued
deadlines, native positive census, pagination, knownJob and failedRun's current
owner/tests/upload fences are unchanged. This small domain-specific guard needs
no dependency or generic framework.

The five-row sequence asserts failed a1 with truthful census quiescence,
pending/dispatch-hosted, no new repair work/cancel/old dispatch, then one ordinary
hosted a2 with NEW build9 while build8 remains burned. A later control-only main
is present in the source catalog with identical app inputs before the recovery
tick: a1 keeps its old run/control; a2 keeps the intent source/debt/deadline but
uses the new `controlRef=main`. No source/lane/history is manually changed. The
new dispatch has no inherited admission label/nonce argument. Actual consumer
admission scope and runtime adoption are separate acceptance work.

## Actual local checks

- Baseline: one selected actual-five-job regression FAILS on the old source;
  91 other tests were filtered out. Raw failure retained.
- Initial direct command named controller/state and a nonexistent actions-test
  path; Vitest actually ran two files,154 PASS. This is not claimed as three-file
  coverage. The broader CD-focused command below covers the complete CD test area.
- `pnpm exec vitest run tests/cd`:11 files,320 PASS,18.11s. This includes local
  hermetic adapter/worker/host-source tests, not live CD effects or a full repository
  suite. No `pnpm test` was run.
- Final `pnpm exec vitest run tests/cd/controller.test.ts`:126 PASS after the
  explicit new-main catalog and exact negative-state assertions. Production source
  is identical to the320-test run; the unchanged broader suite was not repeated.
- Eight targeted mutants are killed: remove the exception; bypass executed
  preflight; ignore never-ran; omit group, empty-step or completion proof; admit
  runner0 as executed preflight; omit step timestamp proof. Each raw failure is
  retained. Original production source is restored byte-for-byte afterward.
- `pnpm typecheck` passes on the final test source. `pnpm compile` passes and
  refreshes controller JavaScript/source map; exported declarations are unchanged.
- PM index, PM validation and `git diff --check` are recorded before local commit.

Graph Tier2 uses the primary M index (generation2026-10-23T00:44:56Z), positive
jobAdmission/failedRun evidence and inherited inbound callers reconcileIntent and
failedRun. Source controller coverage is metadata_match/no recorded issue; the
test's parse-partial line13 is the unchanged generic vi.mock and was read directly.
Generated dist is excluded and was read/compiled directly. This isolated branch
is not claimed indexed; exact source fallback supplies its evidence.

Normal PM claim created the isolated branch and carried the already-merged
MO-26-10-21-20.30.42 shipped reconciliation. No authored source push, PR, source
CI, independent review, provider/host action, controller activation, fault, new
observer or operational adoption is part of Phase A. The unrelated frozen fixture
and held consumer PRs are untouched. ROOT owns publication/funding and later exact
M/E coherence/operational releases; existing successful review/CI of older runtime
bytes cannot qualify this new runtime.

## Phase B — source publication and independent review

ROOT released the normal source review/CI loop after authenticating the local
qualification packet and exact implementation tree. The initial publication is an
unlabelled draft. The shared-controller change requires a fresh HIGH independent
source review after actual CI; operational raw-census/ledger-copy qualification
and coherent consumer adoption remain separate ROOT-owned gates. No runtime or
controller installation is authorized by this source publication.

## Independent HIGH source review

Fresh independent HIGH source review cleared the cancelled-companion correction with no findings. The reviewer passed 37 selected hermetic cases, inspected the original-source failure and all eight killed mutants, and verified generated JavaScript/source-map equality. Required CI must finish successfully before merge; runtime adoption and actual-ledger operational qualification remain separate.

The fresh reviewer received no author conversation. Its canonical task path is
paired above with the globally scoped parent runner UUID; the author child session
is `01a15730-01ee-7f52-a39c-6c4bd5e9812d`. Actual clock observations
01:17:38–01:21:00Z measure 202000ms, including tools/waits at one-second
resolution; no runner duration was available. No review extension/follow-up was
needed. The initial source CI has successful Node/PM/bridge checks but its browser
job was still installing Playwright dependencies at the pre-review observation.
That pending job is not reported as green. ROOT
independently reproduced the original 5258 wrong-repair result using the unmodified
provider census and a copy of the real ledger under effect denial; that corroborates
the baseline only, not corrected-runtime or live qualification.

```morpheus-review
{
  "version": 2,
  "base": "5258734031848b2a1ecbcf8b9633745e3958de0c",
  "reviewed": "469b70512c2931a909426e214f9ba0fc49a1eb47",
  "covered": "469b70512c2931a909426e214f9ba0fc49a1eb47",
  "authorSession": "01a1572f-2ae1-77f2-be54-4265b3baca43",
  "reviewerSession": "/root/morpheus_host/cancelled_companion_source_review453",
  "risk": "high",
  "elapsedMinutes": 3.3666666666666667,
  "timing": {
    "source": "clock",
    "durationMs": 202000,
    "evidence": "clock.curr_time immediately before fresh collaboration spawn at2026-10-23T01:17:38Z and after delivered final report at2026-10-23T01:21:00Z; one-second resolution, tool/wait interval included; private review-initial-timing.json, runner duration unavailable."
  },
  "outcome": "complete",
  "summary": "Fresh independent HIGH source review cleared the cancelled-companion correction with no findings. The reviewer passed 37 selected hermetic cases, inspected the original-source failure and all eight killed mutants, and verified generated JavaScript/source-map equality. Required CI must finish successfully before merge; runtime adoption and actual-ledger operational qualification remain separate.",
  "findings": []
}
```
