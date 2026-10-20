---
roadmap: MO-26-10-19-20.22.07
---

# Hosted Claude provider contract repair

The first actual Evo main capability run39363087252 installed Claude2.1.287 but
failed the shared App exchange parser before quota or model invocation. The
response itself was not logged, so its exact shape remains unknown. The shared
parser incorrectly restricted opaque tokens to letters/digits/underscore and
used nullish rather than empty-primary fallback. Current official action source
accepts token-or-app_token without that alphabet assumption:
https://github.com/anthropics/claude-code-action/blob/0a08a8678026bf8bad8cbf35bb2727fdd9d5f273/src/github/token.ts

The existing quota normalizer also discarded model-specific windows. An explicit
Opus executor needs shared and matching model capacity; shared windows alone
cannot establish Opus-specific capacity or distinguish unrelated model limits.

Implementation stays in the existing domain adapters: opaque printable ASCII
single-line tokens, percent-safe GitHub masking, exact protected output, no raw
credential values in summaries/errors. OIDC authority/default-branch checks,
requested/granted permission distinction, capability probe and revocation remain.
Explicit Claude models join shared five-hour/week and relevant model-family week
windows. Unknown/null/invalid/expired capacity waits. Telemetry files must attest
the configured model and every required window. Without a model, all available
runtime windows are retained conservatively. No new generic dependency is needed.

Tier2 graph evidence used Morpheus generation2026-10-20T03:04:37Z. Token/worker and
focused test paths metadata-matched without recorded gaps at discovery. The task
worktree is not separately indexed; read exact source/diff for all changes. The
quotaUsed reducer and both parser call paths were checked directly. These signals
are best effort, not completeness proof.

Validation actually run:

- `pnpm exec vitest run tests/cd/worker.test.ts tests/cd/adapters.test.ts`:35 passed.
- `pnpm typecheck`: passed before and after automatic trunk integration.
- Six mutants (nullish empty-token fallback, old token alphabet, omitted percent
  masking escape, ignored model window, wrong model file, incomplete model file)
  each failed focused worker tests. Restored sources before final verification.
- Merged current trunk1e8a877 before final tests; Git reproduced the merge without
  manual resolution. The already-reviewed validation waiver remains separate.
- `pnpm exec vitest run tests/cd/`:94 tests passed across7 files.
- `pnpm compile`, `pnpm morpheus pm index`, `git diff --check`: passed.

No full local repository suite: shared PM/check/session/review/template core was
not changed. No live provider health, model capacity, native execution or real
TestFlight delivery is credited. Reviewed consumer pin and actual no-model
capability/quota probe remain required before active rollout. No PAT was copied
to Actions, and no provider account/billing setting was changed.

Independent review is pending. The team runner reached its session limit and a
fresh Codex CLI default-model launch is unsupported for this CLI account. A fresh
persistent Claude Opus subscription session is the established fallback, with
read-only tools, full packet, actual timing/session ID and no account/API switch.
