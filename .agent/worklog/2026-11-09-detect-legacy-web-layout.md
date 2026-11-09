---
roadmap: MO-26-11-09-09.59.47
date: 2026-11-09
tags: [engineering]
---
# Detect established web layouts

Issue #433: the shared survey selected a missing `apps/web` instead of an existing `web/` Next.js application. It now recognizes `web/app` with a Next.js dependency after the existing canonical and root-level choices. The same survey steers status and scaffolding, so additions stay inside the existing site. No new option, dependency or generic discovery framework is needed; this is a small domain-specific path extension. No early diagram is needed for this single-function correction.

## Validation

- Initial regression failed: the legacy app, HQ, gate, alias and test runner were all reported missing.
- `pnpm install --frozen-lockfile`: passed.
- `pnpm exec vitest run tests/web-scaffold.test.ts tests/consumer-auth.test.ts`: 70 passed, including legacy in-place scaffolding, unchanged HQ bytes, absence of a second app, precedence and invalid-directory cases.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`: passed. Initial omission of declaration-order churn was corrected after CI proved the same deterministic output is required there.
- `morpheus complexity check`: passes enforced CCN 15; seven touched functions, 80 measured functions in two files; no new finding. Hand inspection confirms one fixed candidate loop reuses existing detection.
- Read-only built-code survey against the reported consumer finds `webRoot: web`, app/HQ/gate present. No consumer files or cloud resources changed.
- `pnpm test` ran once: 4,275 passed, two skipped, six failures exclusively from absent `actionlint`. Installed pinned actionlint 1.7.12 in ignored operational tools; the affected `tests/workflow-expressions.test.ts` then passed all seven tests. No unchanged full-suite rerun.
- `pnpm lint` and `git diff --check`: passed.

## Independent review

Independent normal-risk review cleared the exact implementation with no findings. The reviewer verified detection precedence, malformed and missing packages, caller integration, generated output, documentation and roadmap reconciliation; all six new cases and the real consumer read-only survey passed.

```morpheus-review
{
  "version": 2,
  "base": "db1c3f76c367d0f39739126e20aeda0d2b5dea42",
  "reviewed": "cbcacb87342e1583e9063417c9117a42cbcfc2ff",
  "covered": "6f4890d6a56d52bc66fea084c5095183116b050c",
  "authorSession": "01a1c175-44ef-7342-81d5-6cdc6dde9451",
  "reviewerSession": "/root/review_web433",
  "risk": "normal",
  "elapsedMinutes": 1.7333333333333334,
  "timing": {
    "source": "clock",
    "durationMs": 104000,
    "evidence": "Parent start clock 2026-11-09T18:04:37Z; reviewer completion clock 2026-11-09T18:06:21Z, /root/review_web433 in author session 01a1c175-44ef-7342-81d5-6cdc6dde9451"
  },
  "outcome": "complete",
  "summary": "Independent normal-risk review cleared the exact implementation with no findings. The reviewer verified detection precedence, malformed and missing packages, caller integration, generated output, documentation and roadmap reconciliation; all six new cases and the real consumer read-only survey passed.",
  "findings": [],
  "followUps": [
    {
      "reviewerSession": "/root/review_web433",
      "commit": "6f4890d6a56d52bc66fea084c5095183116b050c",
      "outcome": "cleared",
      "elapsedMinutes": 0.4166666666666667,
      "timing": {
        "source": "clock",
        "durationMs": 25000,
        "evidence": "Parent start 2026-11-09T18:11:55Z; reviewer completion 2026-11-09T18:12:20Z, /root/review_web433 in author session 01a1c175-44ef-7342-81d5-6cdc6dde9451"
      },
      "scopeReason": "Required CI discovered deterministic generated declaration drift; retain compiler output and inspect the generated-only correction.",
      "summary": "Cleared with no findings: the two equivalent generated declaration key reorderings exactly match CI, and source/schema/runtime remain unchanged."
    }
  ]
}
```

## CI correction

Required Node CI on `197b6edf` failed build-clean verification only: `pnpm compile` also reorders two equivalent generated enum declaration keys in `dist/qa/comments.d.ts`. Retain the compiler output rather than leaving a dirty generated tree. No source/schema or runtime behavior changes. A second bounded review covers this CI-discovered generated-only correction.

Follow-up review cleared `6f4890d6` with no findings; original clearance remains intact. The generated correction exactly matches CI. `tests/qa-comments.test.ts` passed all 34 tests; a second compile followed by `git diff --exit-code -- dist` proved clean generated output.
