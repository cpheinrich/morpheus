---
roadmap: MO-26-10-19-20.37.25
---
# Repair live provider probes

The first probe after the opaque-token correction, consumer run39367542830,
exchanged a usable App token, configured repository metadata access and revoked
the installation token. The shared capability command then returned HTTP404 on
the initial repository request. The exact source used a trailing slash for an
empty relative path, unlike the successful workflow metadata read. The command
now uses the exact repository route. Its contract test executes the complete
workflow-only creation, readback, ownership check and deletion with an HTTP-style
router that refuses unknown URLs; it performs no actual provider mutation.

The separate actual quota probe returned HTTP403. Its cause remains unknown.
Failed usage reads now report only HTTP status, one recognized error category
and a fixed recognized user:profile hint. Arbitrary response text is excluded
because it can echo a credential or injected output. Admission, quota windows,
backoff and reserve thresholds are unchanged. These bounded provider-specific
changes reuse the current adapters; no generic dependency is appropriate.

Actual workflow-writing authority and shared/Opus allowance remain required in
direct-child MO-26-10-19-21.10.52 after a reviewed consumer pin. The merged fixes,
synthetic tests and successful App parser do not grant live capacity or count as
TestFlight delivery. No PAT, private credential values or app/account details are
included here.

Tier2 graph verification used project Users-chrisheinrich-code-morpheus,
generation2026-10-20T03:44:06Z. The existing probe and quota paths were discovered
and traced earlier in the campaign. Coverage for src/cd/github-token.ts,
src/cd/worker.ts, tests/cd/worker.test.ts and tests/cd/adapters.test.ts reported
metadata_match with no recorded gap. This task worktree is not separately
indexed; the changed source and complete diff were read directly.

## Validation

- Focused worker/adapter tests: 37 passed before mutation checks. They cover the
  direct callers and provider boundaries changed here.
- Three targeted mutants were killed by the intended new tests: restoring the
  trailing slash, leaking provider message text, and exposing an unknown error
  type. Each mutation was restored; actual failure logs were inspected.
- Final `pnpm exec vitest run tests/cd/worker.test.ts tests/cd/adapters.test.ts`:
  40 passed, including non-JSON/null failures and exact safe error messages.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index` and
  `git diff --check` passed. Generated runtime output is included. The full suite
  belongs to CI for this adapter change.

## Independent review

Fresh independent Claude Opus review cleared the exact candidate with no findings; 27 worker tests passed independently. Actual provider authority and quota remain tracked in the direct child before activation.

The reviewer used a fresh read-only Max subscription session with explicit Opus,
no API key, no provider calls and no subagents. It inspected source, callers,
contracts, records and focused test output; it relied on author compilation and
adapter/mutation evidence, and did not compare dist output line by line. Actual
runner duration was43959ms; the separate process clock included launcher overhead.

```morpheus-review
{
  "version": 2,
  "base": "538d89b4a7f8c19e8958f1e309e926fc5dc04f6d",
  "reviewed": "6b5c8b03ff1e876a6690922aac45b402bcb92398",
  "covered": "6b5c8b03ff1e876a6690922aac45b402bcb92398",
  "authorSession": "01a1572f-2ae1-77f2-be54-4265b3baca43",
  "reviewerSession": "b134910a-d7a8-4d46-9220-0fdb33063983",
  "risk": "high",
  "elapsedMinutes": 0.73265,
  "timing": {
    "source": "runner",
    "durationMs": 43959,
    "evidence": "Claude CLI stream-json result session b134910a-d7a8-4d46-9220-0fdb33063983 initial turn duration_ms=43959; retained private result and timing files."
  },
  "outcome": "complete",
  "summary": "Fresh independent Claude Opus review cleared the exact candidate with no findings; 27 worker tests passed independently. Actual provider authority and quota remain tracked in the direct child before activation.",
  "findings": []
}
```
