---
roadmap: MO-26-11-02-13.16.08
date: 2026-11-02
agent: codex
outcome: completed
tags: [engineering, product]
---
# Prefer exact HQ record identities

## Result

Issue #478's punctuated roadmap ID becomes independent numeric tokens in MiniSearch. A
numeric-heavy inbox or body mention can therefore outrank the record, especially with the
ordinary roadmap-history weight. Reproduced with the exact reported LK-26-08-28-13.52.42 ID
and 42.02%/42.96% values; nine regressions failed on the original implementation.

Default ranking now puts complete title/path/filename identities and complete roadmap IDs
at the filename boundary first, before the result limit. It uses the existing canonical
roadmap grammar, including legacy forms. Partial IDs and body mentions retain ordinary
scores. Explicit project ranking callbacks retain full control. Existing serialized indexes
remain compatible. No UI layout, catalogue, permissions, consumer pin or deployment changes.

## Validation

`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint` passed. Focused
`pnpm exec vitest run tests/hq-search.test.ts` passed 19 tests, including serialized reload,
lowercase/whitespace, legacy IDs, exact title/path names, result limits, partial identifiers,
ordinary topic weighting and custom ranking. `pnpm compile`, `pnpm morpheus pm index`
and `git diff --check` passed. One full `pnpm test` passed 4,141 tests in 138 files in
114.86 seconds (the branch before integration of separately validated waiter PR580).

Graph tools were unavailable and bootstrap could not safely stop other active sessions.
Direct source inspection covered the shared search engine, builder, browser callers and
Lakina's real-catalog integration contract. No graph-completeness claim is made.

## Independent review

The independent reviewer conditionally cleared one substantive exact-title normalization defect and found no other issues. R1 was fixed within the named paths: identity comparison uses the trimmed original query while MiniSearch retains EIN token normalization. The regression failed before correction; all 20 search tests, typecheck, compile and diff checks passed afterward.

```morpheus-review
{
  "version": 2,
  "base": "132723413f0821d8b3e6295c81875582b7ca47d4",
  "reviewed": "4cc3376225701ebe668c2f529219e3f21c9a01a2",
  "covered": "af1c8ce129402d0140497335ca2403b32f75b00c",
  "authorSession": "01a19dd8-f59d-7583-99cf-870ebd3ca0f9",
  "reviewerSession": "/root/review_search",
  "risk": "normal",
  "elapsedMinutes": 3.066666666666667,
  "timing": {
    "source": "clock",
    "durationMs": 184000,
    "evidence": "Author clock around /root/review_search: 2026-11-02 21:23:07 UTC at dispatch and 2026-11-02 21:26:11 UTC on completed result receipt."
  },
  "outcome": "complete",
  "summary": "The independent reviewer conditionally cleared one substantive exact-title normalization defect and found no other issues. R1 was fixed within the named paths: identity comparison uses the trimmed original query while MiniSearch retains EIN token normalization. The regression failed before correction; all 20 search tests, typecheck, compile and diff checks passed afterward.",
  "findings": [
    {
      "id": "HQ-R1",
      "severity": "substantive",
      "description": "EIN number token normalization rewrote the identity query, so a complete Add EIN number lookup title lost to numeric/token relevance despite exact-title acceptance.",
      "paths": [
        "src/hq-search/index.ts"
      ],
      "disposition": "fixed",
      "response": "Use query.trim() for exact identity comparison and retain normalized for MiniSearch. Added exact-title and ordinary rewritten-query regressions.",
      "condition": {
        "paths": [
          "src/hq-search/index.ts",
          "tests/hq-search.test.ts",
          "dist/hq-search/index.js",
          "dist/hq-search/index.js.map",
          ".agent/worklog/2026-11-02-prioritize-exact-hq-identities.md"
        ],
        "evidence": "Derive identity comparison from the trimmed original query, preserving token-search normalization. Add a failing-before title-versus-inbox regression. Run focused search tests, typecheck, compile and git diff --check."
      },
      "conditionMet": "R1 regression failed before correction (1 failed,19 passed); after correction all20 search tests, pnpm typecheck, pnpm compile and git diff --check passed. Commit af1c8ce1 touches only four reviewer-allowed source/test/generated files."
    }
  ]
}
```

