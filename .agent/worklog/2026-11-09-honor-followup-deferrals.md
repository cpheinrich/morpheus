---
date: 2026-11-09
roadmap: MO-26-11-09-15.15.57
tags: [engineering]
---

# Honor a newly filed deferral after follow-up clearance

Issue #615 showed the final-turn structural check ran before the documented Git-based allowance for a newly filed deferral. The validator now asks the same Git logic whether the covered tail contains a qualifying ticket. Existing ancestry and per-commit checks still control the tail, and record-only callers still require equality or a conditional clearance.

The focused local-review and PR-check suites passed all 291 cases. New cases prove acceptance for a newly filed deferred item after clearance and rejection for unrelated source changes or edits to an existing item. Enforced complexity passed, with an existing validator advisory.

High-risk independent review reproduced an existing roadmap ID passing under a second pathname. The conditional fix now rejects the ID itself if it was present at clearance while retaining the original path checks. Both focused suites passed all 292 tests, including the duplicate-ID regression. The reviewer also identified a pre-existing submodule-pointer census issue, tracked separately.

```morpheus-review
{
  "version": 2,
  "base": "e8f51de685cd89ba691fc3f6d0ad5a9abd01932f",
  "reviewed": "949dffb15a1bb480075e97abf8786175978029ce",
  "covered": "84828de4705c958377e4dc853764684369b06ccc",
  "authorSession": "01a1c292-3f10-7f40-9f9d-6a426fca2c75",
  "reviewerSession": "/root/review_deferral_tail",
  "risk": "high",
  "elapsedMinutes": 1.40445,
  "timing": {
    "source": "runner",
    "durationMs": 84267,
    "evidence": "Parent Codex transcript recorded reviewer spawn at 2026-11-09T23:19:46.337Z and the final verdict at 2026-11-09T23:21:10.604Z."
  },
  "outcome": "complete",
  "summary": "High-risk independent review reproduced an existing roadmap ID passing under a second pathname. The conditional fix now rejects the ID itself if it was present at clearance while retaining the original path checks. Both focused suites passed all 292 tests, including the duplicate-ID regression. The reviewer also identified a pre-existing submodule-pointer census issue, tracked separately.",
  "findings": [
    {
      "id": "F01",
      "severity": "substantive",
      "description": "An earlier-sorting duplicate pathname can make the same existing roadmap ID look newly filed after clearance.",
      "paths": [
        "src/review/local.ts"
      ],
      "disposition": "fixed",
      "response": "Check that the finding ID itself had no valid committed item at clearance, in addition to all existing path and author-addition checks. Added an earlier-sorting duplicate regression.",
      "condition": {
        "paths": [
          "src/review/local.ts",
          "tests/local-review.test.ts",
          "dist/review/local.js",
          "dist/review/local.d.ts",
          "dist/review/local.js.map"
        ],
        "evidence": "Retain existing path and author-addition checks, add a lexically earlier duplicate regression, and rerun both focused suites, typecheck, compile, complexity and diff check."
      },
      "conditionMet": "292 focused tests passed, including the duplicate regression. Typecheck, compile, enforced complexity and git diff --check passed. The conditional source/test/generated commit changed only the allowed paths."
    },
    {
      "id": "F02",
      "severity": "incidental",
      "description": "A submodule pointer can be absent from the existing changed-path census when .gitmodules uses ignore = all.",
      "paths": [
        "src/review/local.ts"
      ],
      "disposition": "deferred",
      "response": "Filed a separate roadmap item with the Git reproduction shape and path-census acceptance.",
      "roadmap": "MO-26-11-09-15.23.10"
    }
  ]
}
```
