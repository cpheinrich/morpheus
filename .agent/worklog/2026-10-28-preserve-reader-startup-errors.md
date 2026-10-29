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
