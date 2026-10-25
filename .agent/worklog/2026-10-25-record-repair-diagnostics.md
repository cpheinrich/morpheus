---
roadmap: MO-26-10-25-06.05.12
tags: [engineering, devops, infrastructure]
---
# Evidence-only diagnostics for an existing failed repair

## Mandate and design — 2026-10-25

Restore ordinary delivery through the existing repair owner. This narrow source
task adds a supported diagnostic input after the latest execution attempt has
failed. It must not revive the attempt, manufacture history or create a second
repair owner. All public identifiers and test evidence are synthetic.

Use a strict finite JSON input with exact work/task and current failed execution
identity, canonical hashing and the existing GitHubStore CAS. The target must
remain the unique latest noncomplete work, its task hash must match, and its
undelivered intent must still be repairing at that failed attempt's source.
Only the work's evidence array may gain one deduplicated canonical JSON string.
Revalidate each new append and every CAS callback. Verify exact saved receipts
on replay/readback. A successful immutable note remains acknowledged if the normal
owner advances afterward, with `targetCurrent: false`; do not restore/wake work.
Existing normal
failure/test/upload/quiescence guards remain unchanged. The data is untrusted
diagnosis, never instruction, permission or funding.

This is a small CD-domain boundary using the already installed Zod, canonical
hashing and GitHubStore; no generic module or new dependency is needed.

Source-author authority is local edits, validation and commits only until the
root qualifies publication. The root separately earmarked a $5 source maximum
(eight full and four metadata CI runs); this author makes no new reservation or
settlement. Native/provider/host/model/runtime actions remain outside scope.

## Discovery

Primary graph project `Users-chrisheinrich-code-morpheus` was ready at generation
`2026-10-25T13:05:07Z`, primary head `5fbdee4`. Verify-tier discovery found the
`checkIdentity`, `repairWork` and `GitHubStore.transact` boundaries and all direct
callers of `checkIdentity`. Coverage reports no recorded gaps in the controller
files, which is a best-effort signal rather than completeness proof. Read exact
source. `tests/cd/cli.test.ts` does not exist; existing public CLI coverage uses
separate command-domain test files. The source-finance CLI test's partial range
19 was read directly. New diagnostic coverage will use the actual public parser,
configuration/files, normal store and fake Git database CAS semantics.

## Validation

The final focused command passed all 164 tests in six files:

```sh
pnpm exec vitest run tests/cd/repair-diagnostic.test.ts tests/cd/repair-diagnostic-cli.test.ts tests/cd/state.test.ts tests/cd/store.test.ts tests/cd/source-finance-cli.test.ts tests/cd/request.test.ts
pnpm typecheck
pnpm lint
pnpm compile
pnpm morpheus pm index
pnpm morpheus pm validate
git diff --check
```

The test scope covers the new pure reducer, actual CLI/file/store path, direct
state/store boundaries and existing public request/financial command routes.
Positive tests compare the entire state with exactly one evidence append; normal
failure/quiescence/test/upload guards continue refusing the failed attempt.
Tests cover dedupe, concurrent same-content callers, exact owner/event receipts,
identity/task/source substitution, stale and completed targets, CAS progression,
saved notes after normal completion, unknown final readback, UTF-8 and actual
file byte boundaries, strict fields/flags and a bounded receipt with a large ledger.
All listed checks passed. The full suite was not run locally: this change does
not touch the shared-core paths authorized for a local full run. Required CI is
still pending publication and must pass before merge.

Nine targeted local mutants were killed by actual assertions: byte equality,
UTF-8 versus UTF-16 counting, failed status, filling an unbound run, duplicate
append, moved intent source, omitted CAS target validation, omitted invocation
owner validation and returning full state. Inspected the failures and restored
the exact source hash before the final checks. The first mutation-runner setup
stopped after three mutants because one expression appeared in both admission
and readback; corrected its explicit first-occurrence selector and reran the
complete nine-mutant set. This was a harness failure, not a source failure.

`src/cd/state.ts`, `src/cd/schema.ts` and `src/cd/store.ts` are byte-identical to
protected base `5fbdee441c71e5634c2f14b28babbab8d25820b2`. Primary graph generation
`2026-10-25T13:13:16Z` has no metadata for the newly authored worktree-only files;
read their complete exact source directly. No exhaustive graph claim is made.

The API and command return only a bounded JSON receipt with observed head,
replayed flag, exact work/task/intent/attempt/content identity, event ID/owner,
verified readback head and `targetCurrent`. A genuine saved note remains
acknowledged after normal progression; this never establishes current capability
or permission to restart/adopt/dispatch. No provider/runtime validation is claimed.

Local implementation is complete and committed for root packet qualification.
No implementation publication, PR, reviewer, CI, reservation, settlement or
host/provider/ledger/model/native-owner action has occurred. Source publication
remains held for the root's exact cost/qualification release.
