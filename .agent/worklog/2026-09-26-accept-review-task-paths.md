---
roadmap: MO-26-09-26-09.37.36
---

# Runner-issued review task paths

Issue #282 reproduced in Evo PR 286: its fresh reviewer has only a canonical task path,
which the UUID/hex-only schema rejected. Accept the exact task path with the existing
`authorSession` serving as globally scoped parent provenance. Compare structured records
for task-path reuse, retaining legacy UUID/hex handling, follow-up identity and all review
coverage/budget requirements. No new generic module or dependency is needed.

Codebase-memory tools are unavailable in this runner. The required installation check
reported no exact-checkout index; repair refused activation because other CBM sessions
are active. Preserved those sessions and used bounded source inspection of review
validation, prompt/scaffold, and local-review tests instead. No graph completeness claim.

Validation: typecheck, full Vitest suite, compile, generated PM index, and local PR checks.

Independent high-risk review found one substantive historical whitespace normalization gap. The author normalized both historical identity fields and added regressions within the reviewer’s exact conditional scope; all 57 focused tests, typecheck and compile passed. The reviewer condition clears the fix without another turn. Source inspection replaced unavailable graph tools; no full-suite reviewer rerun.

```morpheus-review
{
  "version": 1,
  "base": "c7daad0732a08d75f444b0613e29b6d80a2ef33b",
  "reviewed": "20bf80e566185eac8bacf32176b249e2a10968ec",
  "covered": "efd61e4a8269bea334b9f637cc349ae8ecc99582",
  "authorSession": "01a0de93-b404-7523-8314-506309e600d9",
  "reviewerSession": "01a0de9e-a287-7e43-b070-f0770a677a45",
  "risk": "high",
  "elapsedMinutes": 4,
  "outcome": "complete",
  "summary": "Independent high-risk review found one substantive historical whitespace normalization gap. The author normalized both historical identity fields and added regressions within the reviewer\u2019s exact conditional scope; all 57 focused tests, typecheck and compile passed. The reviewer condition clears the fix without another turn. Source inspection replaced unavailable graph tools; no full-suite reviewer rerun.",
  "findings": [
    {
      "id": "R1-normalization",
      "severity": "substantive",
      "description": "Historical identity fields were not trimmed, permitting same-parent reuse after surrounding whitespace in a prior accepted record.",
      "paths": [
        "src/review/local.ts"
      ],
      "disposition": "fixed",
      "response": "Normalize both historical fields with the same trim semantics used by current review records; added parameterized regressions for each field.",
      "condition": {
        "paths": [
          "src/review/local.ts",
          "tests/local-review.test.ts",
          "dist/review/local.js",
          "dist/review/local.js.map"
        ],
        "evidence": "Add whitespace regression cases for both historical fields; run focused local-review tests, typecheck and compile."
      },
      "conditionMet": "pnpm exec vitest run tests/local-review.test.ts passed all 57 tests; pnpm typecheck and pnpm compile passed. Only the four permitted paths changed after reviewed."
    }
  ]
}
```

Reviewer identity provenance: the same reviewer directly read its runner-provided
`CODEX_THREAD_ID=01a0de9e-a287-7e43-b070-f0770a677a45` in an administrative identity-only
follow-up. Its collaboration path is `/root/morpheus_reviewer_identity_fix/review_identity`.
This bootstrap PR records that issued UUID so current-main conventions can validate it;
no replacement reviewer or additional review turn was used.
