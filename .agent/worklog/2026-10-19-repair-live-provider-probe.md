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

Pending the fresh reviewer and exact final candidate. No live rollout clearance
is claimed by this worklog.
