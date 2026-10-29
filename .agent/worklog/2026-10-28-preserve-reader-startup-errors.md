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
