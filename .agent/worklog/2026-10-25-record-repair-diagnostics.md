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

The initial local qualification passed all 164 tests in six files:

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

## Independent hash-contract oracle — 2026-10-25

Root packet inspection initially assumed `hash(encoded)` JSON-encoded a string
again. Exact `src/cd/schema.ts` source showed that `hash` hashes string arguments
as raw bytes, while it canonicalizes object arguments. Root acknowledged that
inspection assumption was incorrect. The existing diagnostic ID already equals
SHA-256 of canonical parsed input UTF-8 bytes; there was no implementation defect
or changed ID, and the runtime calculation remains unchanged.

Add an independent Node `createHash("sha256").update(canonical(parsedInput),
"utf8")` oracle for both the normal store event/receipt and actual CLI file path.
The fixture includes non-ASCII text, quotes, a backslash and a newline and
distinguishes the canonical-input digest from JSON-string double encoding.
The oracle passed against the unchanged runtime. Preserve the complete initial
packet and its nine-mutant results; a separate revision packet records the new
golden test and an additional actual double-encoding mutant.

The stable CLI/API/file schema was sent directly to the consumer source owner.
Its runtime manifest must explicitly admit the additional `dist/cd/index.js`
entry and transitive imports, including `dist/cd/repair-diagnostic.js`; existing
CLI reachability is not evidence of that package entry. No consumer files were
changed by this author.

Revision validation passed 165 focused tests in the same six-file scope,
typecheck, lint, compile, PM index/validation and diff checks. All ten targeted
mutants were killed; inspected the added mutant's actual failed Node-golden
receipt/event assertions. Production `src/` and `dist/` bytes are unchanged from
`15c05a7255fd5de4f77d7d1bba03704aab8e81aa`. The prior packet manifest remains
`2836e03ee67dd78a24949305920954cd183daecf6bdfe3292970853cb6c32515`.
The revision adds contract tests, entry-manifest documentation and this record
only; source publication, reviewer, CI and operational effects remain held.

## Protected integration and conditional source release — 2026-10-25

The lead agent inspected the exact source/qualification packet and conditionally
released one initial implementation push, unlabelled draft PR, CI wait and one
fresh high-risk independent review, with the author owning findings, record,
CI and protected merge. The same $5 maximum and eight full/four metadata event
ceilings remain held; there is no new reservation or settlement.

Integrated actual protected workflow correction `30d412a7e4194b502088fc359c72c88b1d78f964`
(PR517), which already includes PR511. Git's automatic merge reproduced tree
`2672b5956e63871c5cf8b23a09f9c62c26499311` exactly; no conflict or semantic
resolution was needed. Diagnostic runtime bytes and all three protected workflow
payloads are preserved. The existing development post-merge hook installed the
current Morpheus CLI; no frozen delivery runtime, service or native owner was changed.

Requalification includes actionlint 1.7.12's actual local checker and regression
tests. The protected CI input adds a pinned, checksummed Linux X64 checker within
the existing required Node job, with a three-minute step and 90-second download
limit. It adds no runner job, cache, artifact or model call. Standard public
runner labels, one-day 66 MiB per-event artifact ceiling and actual 10 GiB cache
limit preserve the previously qualified conservative $0.704296875 storage maximum.

Before marking the draft ready, wait for the record head's full CI and all
metadata runs to finish, then wait separately for the fresh ready-event CI.
This preserves executed required checks instead of cancelling them through
overlapping readiness events. CI/review completion remains outstanding here.
No actual diagnostic note or operational host/CD-provider/CD-ledger/native-owner
effect is released.

The integrated qualification passed 380 tests in ten focused files: the six CD
files above plus workflow-expression, artifact-workflow, workflow and CI-scope
tests. Real `actionlint -shellcheck= -pyflakes=`, typecheck, lint, compile,
PM index/validation, diff checks and exact protected-payload preservation checks
passed. No local full suite was run. Protected PR517's main CI run
`40198124460` completed successfully, including the actionlint-enabled Node job
and browser/artifact checks, before this source's first independent review.

## Independent review and minor response — 2026-10-25

Initial source CI run `40198696299` passed on published head
`9e3dd02cf17c1ea855f5b2efb9d44a6501d831fc` with six passed and three skipped
checks. The fresh reviewer inspected `da72f97819c09215e3648630a51776f97465bab7`,
which differed only by recording PR518 in the roadmap; implementation and test
bytes matched the successful CI head. An initial launch was refused for a full
agent pool before creating any reviewer session. After a slot became available,
the one fresh reviewer started with no inherited history; the refused launch
consumed no review turn or timing.

Independent high-risk review cleared the source with one minor FIFO-input finding; the nonblocking descriptor open and compiled-CLI regression fix it. No substantive findings or unresolved review questions remain.

The reviewer reproduced a FIFO without a writer blocking in `open()` before the
regular-file check. Open with `O_RDONLY | O_NONBLOCK`, then retain the existing
descriptor type and byte checks. The new POSIX regression runs the actual
compiled CLI with an unopened FIFO and an inert GitHub-command sentinel: it
exits 1 before the deadline with no stdout or provider invocation. Removing the
nonblocking flag compiled successfully and failed that regression after the test
supervisor terminated its own blocked child; restored all exact fixed bytes.
The regression is inapplicable on Windows, which has no POSIX FIFO fixture.

The fix stays within the reviewer's four named paths and is covered as a fixed
minor finding under the normal policy; no follow-up turn was needed. After the
fix, 381 tests in the ten-file focused scope passed, as did real actionlint,
typecheck, lint, compile, PM index/validation and diff checks. The original ten
mutation results remain preserved, and the additional FIFO mutant was killed.
The reviewer independently ran 117 tests in four files and changed no source.
CI for the record head and subsequent ready event remains required before merge.
Consumer adoption and an actual diagnostic note remain outside this source task.

```morpheus-review
{
  "version": 2,
  "base": "30d412a7e4194b502088fc359c72c88b1d78f964",
  "reviewed": "da72f97819c09215e3648630a51776f97465bab7",
  "covered": "1b8605855db3f30bf2d472cbc28dcf3dbcd1177c",
  "authorSession": "01a17329-4d8c-7390-bf79-63dd1893f7db",
  "reviewerSession": "/root/normal_repair_diagnostic_source/independent_source_review",
  "risk": "high",
  "elapsedMinutes": 4.533333333333333,
  "timing": {
    "source": "clock",
    "durationMs": 272000,
    "evidence": "Author clock readings around the fresh reviewer: 2026-10-25T13:50:54Z before dispatch and 2026-10-25T13:55:26Z at the completion observation. The reviewer reported its last observed clock as 2026-10-25T13:55:01Z; the interval includes final-result delivery and observation. The refused 13:47 launch created no session and is excluded."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review cleared the source with one minor FIFO-input finding; the nonblocking descriptor open and compiled-CLI regression fix it. No substantive findings or unresolved review questions remain.",
  "findings": [
    {
      "id": "RD-01",
      "severity": "minor",
      "description": "Opening the evidence path before checking its type blocks indefinitely on a FIFO with no writer, so the regular-file refusal never executes. The reviewer reproduced this through the compiled CLI.",
      "paths": ["src/cd/cli.ts", "dist/cd/cli.js", "dist/cd/cli.js.map", "tests/cd/repair-diagnostic-cli.test.ts"],
      "disposition": "fixed",
      "response": "Use O_RDONLY | O_NONBLOCK, then keep the existing descriptor type and byte guards. The compiled-CLI FIFO regression exits 1 before its deadline and proves the GitHub-command sentinel was never invoked. The blocking-open mutant compiled and failed that actual regression; all fixed bytes were restored. All 381 focused tests, actionlint, typecheck, lint, compile and PM checks passed. Only the named minor paths changed before covered."
    }
  ]
}
```
