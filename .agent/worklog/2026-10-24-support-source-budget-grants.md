---
agent: codex
date: 2026-10-24
roadmap: MO-26-10-24-00.26.20
outcome: research
summary: "Prepared the reviewed source-only reservation implementation and hermetic local evidence; publication and independent source review remain pending."
---

# Reviewed source budget grants

Implemented an explicit source-publication reserve path with strict generic grant
and request contracts. The grant pins the actual target, epoch, supplied and stored
configuration identity, request, amount, aggregate ceiling and short admission
window. The new module uses existing Zod, hashing and normal GitHubStore CAS; no
generic dependency was added. CLI guards run before help/token/credential/other
command paths. Native configuration, state schema, reservePaid, store, invariants
and controller source are unchanged.

The normal paid object stores the envelope digest; the normal transaction event
and result retain the full authority receipt. Inputs are copied and frozen before
the first provider read. Replay is checked before transact and after delayed
replay; every CAS callback checks fresh time and liabilities. Readback verifies the
exact reserved paid object, complete receipt and normal owner. Legacy and settled
identities cannot be relabelled. The hash pin remains operator attestation and
input integrity, not human authentication or same-user confinement.

The pure prepared-snapshot and state-transition exports support separate in-memory
consumer compatibility checks. The production CLI supplies its own fresh clock;
there is no flag or environment clock override. Public tests use fictional targets
and two different amount/ceiling combinations, without copying a consumer ledger,
real grant, approval identity or campaign budget into the repository.

## Local validation

- `pnpm install --frozen-lockfile` reused the lockfile and cached packages; no
  dependency changes.
- `pnpm exec vitest run tests/cd/source-finance.test.ts tests/cd/source-finance-cli.test.ts tests/cd/store.test.ts tests/cd/request.test.ts tests/cli-args.test.ts tests/cli-dispatch.test.ts`
  passed 265 tests across six files. This scope covers the new protocol and public
  parser/files, direct store/CAS behavior, other CD request routing and global CLI
  compatibility. Token, credential, dispatch, child-process, fetch and real API
  routes are fail-closed even when negative-case guards regress.
- `pnpm typecheck` passed.
- `pnpm exec eslint src/cd/source-finance.ts src/cd/cli.ts src/cli/run.ts` passed.
- `pnpm compile` passed and refreshed the committed CLI/helper distribution.
- `pnpm morpheus pm index` left the static roadmap and generated goal/request
  indexes unchanged; `pnpm morpheus pm validate` passed all 322 roadmap items.
- Seven temporary source mutations were each detected by the relevant focused
  test: exact expiry, supplied-config binding, fresh callback admission, complete
  owner receipt, inclusive ceiling, CD command scope and the public router guard.
  All edited source was restored byte-for-byte. The retained reports named each
  failed case; no unchanged suite was rerun for mutation classification.

The first test run exposed three test-harness failures from array rows being
spread by `it.each`, plus explicit TypeScript `this` annotations. Corrected the
fixtures; no production guard was relaxed. The first mutation-summary script
incorrectly expected a JSON reporter field and the literal `AssertionError` label
that this Vitest version does not emit. The original assessment and raw failures
were retained, then inspected by exact test names/messages and empty suite-level
messages. All seven intended mutants were killed; there was no surviving mutant
hidden by that reporting mistake.

Codebase-memory bootstrap verified this exact worktree and enabled normal source
index/watch maintenance. Its active MCP transport closed during the installer
restart; source discovery and coverage requests could not complete afterward.
Used exact direct source reads for the bounded CD/CLI/test scope and disclosed
that limitation instead of claiming current graph coverage or repeating setup.

The full local suite was not run: this change touches CD and CLI routing, outside
the shared-core paths that permit it. CI must still run the full suite before merge.

## Publication and review status

The normal claim was created from `ff39c05c810e9639257050dd50b75d80735b8694` on
`mo-26-10-24-00.26.20-support-reviewed-source-budget`. The author runner is
`01a16ccb-5fa9-74a2-a8ff-724bfbc16a0d`. The claim commit also reconciled four
already merged roadmap items to shipped through the normal PM command.

This is a local implementation candidate, not independent source clearance or
operational authorization. No post-claim push, PR, source CI, review session,
label, merge, actual grant/reservation/settlement, native work or CD runtime effect
has been initiated. Publication requires its separately counted release. The
source review will use one fresh HIGH-risk reviewer with the complete final code,
actual focused results and actual draft CI evidence, under the current runbook.
