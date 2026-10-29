---
roadmap: MO-26-10-28-17.44.08
tags: [engineering, devops, infrastructure]
---

# Preserve sanitized native reader startup diagnostics

A configured CLI helper can emit a specific startup phase and kind, then exit before RPC initialization. The quota reader previously discarded that stderr and reported only the configured reader's exit code. This loses the detail needed to distinguish a startup defect from unavailable quota telemetry; it does not prove quota exhaustion.

The reader now recognizes only the existing helper's fixed diagnostic vocabulary and canonical numeric bounds. It scans at most 4096 bytes with a 128-byte newline-terminated line buffer and retains one diagnostic. An available diagnostic joins the quota error; a diagnostic arriving after rejection is emitted once to private stderr with reader PID, read phase and elapsed time. Arbitrary/trailing/secret text stays discarded. Admission failures still reject immediately, and RPC deadlines, cleanup and model-stop behavior are unchanged.

Used existing built-in byte/string handling for this small domain-specific protocol. A generic logging package adds no needed capability and broadens the surface that could expose provider output. No dependency was added.

Validation: `pnpm exec vitest run tests/cd/quota-reader.test.ts tests/cd/native-worker.test.ts` passed 216 tests with zero skips on restored source; `pnpm typecheck`, `pnpm compile` and `git diff --check` passed. This focused scope covers the changed stream boundary and its direct worker consumer. The quota file's 102 cases include every phase/kind, number and exact scan boundary, chunking, duplicate/trailing/secret text, both stream orderings and an offline real synthetic-process cleanup test. No full local suite or provider/native-account probe was run; CI owns the full suite.

Three temporary source mutants were assertion-killed and restored: grammar end-anchor removal (3 failed/99 passed), scan bound4096->4095 (1 failed/101 passed), and late-diagnostic suppression (2 failed/100 passed). Each selected mutation run executed the full102-test quota file with no filtered skips. Private raw fixture logs remain outside the repository.

Source implementation is a766cca4479cab1a33a6acf611dbf52122c689a2. Independent HIGH review, CI, protected merge and consumer/runtime adoption remain separate gates. This change does not itself establish healthy subscription admission, incident recovery, proof-before-blocking consumer adoption or TestFlight delivery.

## Initial review finding and correction

Fresh independent HIGH review completed blocked with substantive SD-001: the actual compiled CLI forced `process.exit`, discarding late recognized stderr and active cleanup after the immediate quota failure. The reviewer reproduced both `cd quota` and `cd worker`. This was a complete blocked turn, not incomplete or conditional clearance; its severity and history remain preserved pending same-reviewer follow-up.

Correction commit3ccf65af scopes natural completion to `cd quota` and `cd worker`, allowing their existing owned stream and cleanup handles to drain through `process.exitCode`. Immediate error/budget-wait output and the existing three-second cleanup fuse remain unchanged. Option handling covers flags before positional commands, equal-value syntax and `--`; unrelated commands, including the lightweight read hook, retain immediate exit. No quota parsing, deadline, model-stop or admission change.

The actual compiled executable regression suite passed24/24. The focused command `pnpm exec vitest run tests/cd/quota-reader-cli.test.ts tests/cd/quota-reader.test.ts tests/cd/native-worker.test.ts tests/cli-dispatch.test.ts tests/session-evidence.test.ts` passed385/385 with zero skips. Its scope covers executable lifecycle, quota protocol, direct worker consumer, dispatch and read-hook behavior. Typecheck, compile and diff check passed. The early-exit mutant caused18 assertion failures/6 passes, then source was restored; an earlier16-case run caused12 failures/4 passes and remains retained. Both use synthetic provider-free fixtures.

Merged current trunk83883151 explicitly; its opt-in physical-device proof policy was read and retains legacy configuration when absent. After integration, Root repeated typecheck, compile, the same focused385-test scope (zero skips), PM index and diff check, all passing. CI retains full-suite responsibility. This correction remains in the same task and PR; no replacement reviewer or review-history reset.

## Independent review

The initial complete HIGH review blocked on substantive SD-001: forced executable exit discarded late sanitized diagnostics and active cleanup. The author corrected the two quota-owning CLI paths and added actual executable regressions. The same reviewer independently replayed both original failures, ran169 tests with zero skips and cleared the integrated correction with no remaining findings or conditions. Root post-integration validation passed385 focused tests with zero skips, typecheck, compile and diff check. CI, consumer/runtime adoption and actual TestFlight recovery remain separate.

```morpheus-review
{
  "version": 2,
  "base": "5e9335e57739da68f314e484deb5b21b064f42d2",
  "reviewed": "76fedb01a83118f66cad575e3332f523b120c939",
  "covered": "0156e5502f8e27cf3411bb7e54210a8b9fa85e70",
  "authorSession": "01a1572f-2ae1-77f2-be54-4265b3baca43",
  "reviewerSession": "/root/reader_startup_diagnostic_independent_review_0057",
  "risk": "high",
  "elapsedMinutes": 4.933333333333334,
  "timing": {
    "source": "clock",
    "durationMs": 296000,
    "evidence": "Root observed initial same-reviewer invocation start2026-10-29T00:57:41Z and final return2026-10-29T01:02:37Z. Report written01:02:21.596991Z is separate; includes tools and waits."
  },
  "outcome": "complete",
  "summary": "The initial complete HIGH review blocked on substantive SD-001: forced executable exit discarded late sanitized diagnostics and active cleanup. The author corrected the two quota-owning CLI paths and added actual executable regressions. The same reviewer independently replayed both original failures, ran169 tests with zero skips and cleared the integrated correction with no remaining findings or conditions. Root post-integration validation passed385 focused tests with zero skips, typecheck, compile and diff check. CI, consumer/runtime adoption and actual TestFlight recovery remain separate.",
  "findings": [
    {
      "id": "SD-001",
      "severity": "substantive",
      "description": "Actual CLI process.exit discarded a helper startup diagnostic arriving after the quota control failure and could end existing cleanup early. Both cd quota and cd worker executable reproductions failed the acceptance requirement.",
      "paths": [
        "src/cli/index.ts",
        "dist/cli/index.js",
        "tests/cd/quota-reader-cli.test.ts"
      ],
      "disposition": "fixed",
      "response": "Correction3ccf65af selects process.exitCode only for cd quota/worker, including valid options before commands, while preserving immediate result/error and existing cleanup fuse. Twenty-four executable cases pass; the same reviewer replayed both original reproductions and cleared the fix at0156e550. Initial substantive blocked history retained."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/reader_startup_diagnostic_independent_review_0057",
      "commit": "0156e5502f8e27cf3411bb7e54210a8b9fa85e70",
      "base": "83883151baafacd6d59da58154de04905f52ae74",
      "scopeReason": "Verify substantive SD-001 correction and regressions on explicit current-trunk integration1b3af070; initial base/reviewed and blocked history retained.",
      "outcome": "cleared",
      "elapsedMinutes": 2.9,
      "timing": {
        "source": "clock",
        "durationMs": 174000,
        "evidence": "Root observed same-reviewer follow-up1 invocation start2026-10-29T01:19:47Z and final-return boundary2026-10-29T01:22:41Z. Reviewer report-written01:22:17.692420Z is distinct. Includes tools and waits, excludes author work between turns."
      },
      "summary": "SD-001 fixed with original substantive severity preserved. Both original executable reproductions now retain exactly one late diagnostic. Independent169 tests passed with zero skips, typecheck and diff check passed; no new findings or conditions."
    }
  ]
}
```
