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

The first released publication pushed implementation commit
`feecb7091b4803f269dbcba92e19ed431bc66430` and opened unlabelled draft
[PR 474](https://github.com/cpheinrich/morpheus/pull/474). One normal
`pnpm morpheus wait-ci 474 --repo cpheinrich/morpheus` completed successfully.
Exact-head pull-request run 40076253876, attempt 1, passed the full 103-file,
2942-test suite, typechecking, lint and committed-build validation. Six known
checks succeeded and three expected draft/legacy checks skipped. Required
`pr / conventions` remains unreported on the unlabelled draft, so that observed
CI success does not establish merge readiness.

## Independent review and exact condition

One fresh HIGH-risk review found substantive P2 SF-NATIVE-001: the new acceptance and documentation overstated the paid reservation ceiling as a broader native admission cap. The author accepted the finding, corrected only the seven reviewer named paths and satisfied the exact conditional clearance with 95 passing tests, typechecking and diff validation. No follow-up turn or runtime change was needed. Operational grant use, publication and final CI remain separate.

The reviewer was fresh, received the complete committed implementation, actual
265-test focused results and actual draft CI packet before its initial turn, and
used HIGH-risk scope with a 30-minute ceiling and 30-second floor. Its returned
canonical session was
`/root/m_financial_authority_source_author/fresh_high_source_review_474`.
The native runner reported 381426 ms, exactly 6.3571 minutes, for turn
`01a16cf4-6308-7e20-a59e-0bfe0a44ac69` in session
`01a16cf4-62f9-7132-b1a5-249c5fcc05e7`. The explicit runner duration, rather
than an earlier artifact clock taken before serialization or author observation,
is the recorded measurement. It meets both floor and ceiling. The initial
verdict was conditional clearance, with one substantive P2 finding and no
additional source-logic or incidental findings; this was not an unconditional
clearance of the original head.

SF-NATIVE-001 showed why the new wording was wrong: the unchanged paid ceiling
rejects new paid reservations above its limit, but otherwise eligible local
intent creation and attempt planning still succeed. The author accepted the
finding and committed the exact seven-path correction as
`a7dbbdef1793d9e8304d61de6c7a0bed7049a44f`. The corrected source-finance test uses a fictional
source reservation that raises aggregate liability to 267000000 while the paid
limit remains 250000000. It asserts new paid refusal, pending local intent,
active intended local attempt, unchanged complete budget and zero FakeGitHub
calls; no actual dispatch occurs. The existing exact old paid replay remains
covered. No production or generated counterpart changed.

Actual condition validation:

- `pnpm exec vitest run tests/cd/source-finance.test.ts tests/cd/source-finance-cli.test.ts`
  passed 95 tests across two files. These are the two reviewer required finance
  suites, including real-router/file/parser tests with blocked external routes.
- `pnpm typecheck` passed.
- `git diff --check` passed.

The conditional fix touches exactly the reviewer named paths; no follow-up turn
was launched or needed under that condition. This record preserves the original
severity, failure scenario, exact condition and actual timing. The earlier full
CI result is for `feecb709`; the corrected head has not been published or run in
CI. The draft remains unlabelled with auto-merge off. This local record and
prepared PR body must pass normal committed-record validation before any later
released publication. No actual grant, budget reservation, settlement, native
work, provider operation or CD runtime effect has been initiated by this task.

```morpheus-review
{
  "version": 2,
  "base": "ff39c05c810e9639257050dd50b75d80735b8694",
  "reviewed": "feecb7091b4803f269dbcba92e19ed431bc66430",
  "covered": "a7dbbdef1793d9e8304d61de6c7a0bed7049a44f",
  "authorSession": "01a16ccb-5fa9-74a2-a8ff-724bfbc16a0d",
  "reviewerSession": "/root/m_financial_authority_source_author/fresh_high_source_review_474",
  "risk": "high",
  "elapsedMinutes": 6.3571,
  "timing": {
    "source": "runner",
    "durationMs": 381426,
    "evidence": "Native Codex reviewer session 01a16cf4-62f9-7132-b1a5-249c5fcc05e7, canonical task /root/m_financial_authority_source_author/fresh_high_source_review_474, turn 01a16cf4-6308-7e20-a59e-0bfe0a44ac69: task_started 2026-10-24T08:08:37.916Z; task_complete 2026-10-24T08:14:59.336Z carries duration_ms 381426. This runner duration includes the reviewer turn and excludes author/setup time; complete raw result and semantic timing events retained."
  },
  "outcome": "complete",
  "summary": "One fresh HIGH-risk review found substantive P2 SF-NATIVE-001: the new acceptance and documentation overstated the paid reservation ceiling as a broader native admission cap. The author accepted the finding, corrected only the seven reviewer named paths and satisfied the exact conditional clearance with 95 passing tests, typechecking and diff validation. No follow-up turn or runtime change was needed. Operational grant use, publication and final CI remain separate.",
  "findings": [
    {
      "id": "SF-NATIVE-001",
      "severity": "substantive",
      "description": "[P2] Qualify the native ceiling guarantee as new paid reservation admission. The PR newly says that new native requests continue to wait above native headroom, and uses broader native CD admission language. With an unchanged configured $250 limit and fictional aggregate liability of $257, reservePaid rejects a new paid reservation, but createIntent creates a pending local delivery and planAttempt creates an active local attempt with dispatch intended. Controller.reconcileIntent then calls dispatch without consulting this paid ceiling. An operator treating the new acceptance text as a runtime safety guarantee could resume local delivery believing it will wait. This is a defect in the new financial acceptance/documentation guarantee, not a request to fix or redesign pre-existing native runtime behavior. The source implementation correctly preserves that existing behavior.",
      "paths": [
        "qa/acceptance/MO-26-10-24-00.26.20.md",
        "architecture.md",
        "hq/product/roadmap/MO-26-10-24-00.26.20-support-source-budget-grants.md",
        "docs/cd-source-finance.md",
        "docs/cd-v2-controller.md"
      ],
      "disposition": "fixed",
      "response": "Accepted without disagreement. The correction names only NEW PAID reservation admission via reservePaid/ordinary cd budget reserve, preserves exact old reserved identities, explicitly distinguishes local intent creation/planning/dispatch from this dollar guard and states that a source grant authorizes no native operation. The hermetic test proves that distinction with unchanged production behavior. Fixed in a7dbbdef1793d9e8304d61de6c7a0bed7049a44f. Only the seven exact condition paths changed from the reviewed commit; no production source, schema, controller, store, invariant, workflow, dependency or dist changed. The source-finance test now establishes fictional aggregate liability 267000000 above configured paid ceiling 250000000 after a valid source reservation, rejects a new reservePaid call, creates a pending otherwise-eligible local intent and active intended local attempt, and asserts the complete budget unchanged and zero FakeGitHub calls. Existing old reserved identity replay assertions remain. Actual commands: pnpm exec vitest run tests/cd/source-finance.test.ts tests/cd/source-finance-cli.test.ts passed 95 tests / 2 files; pnpm typecheck exited 0; git diff --check exited 0. No real dispatch, credentials, subprocess, network, grant, financial or native runtime effect was performed. The reviewer explicitly required no follow-up when this exact condition is met; normal CI and record validation remain separate.",
      "condition": {
        "paths": [
          ".agent/decisions.md",
          "architecture.md",
          "docs/cd-source-finance.md",
          "docs/cd-v2-controller.md",
          "hq/product/roadmap/MO-26-10-24-00.26.20-support-source-budget-grants.md",
          "qa/acceptance/MO-26-10-24-00.26.20.md",
          "tests/cd/source-finance.test.ts"
        ],
        "evidence": "Limit the correction to the new source-finance prose in the listed Markdown files and hermetic assertions/test naming in tests/cd/source-finance.test.ts. State that the at-most-$250 configured guard constrains NEW PAID budget reservation admission via reservePaid/cd budget reserve. When aggregate liability exceeds it, new paid reservations refuse; exact old paid identities still replay. State expressly that local delivery intent creation, attempt planning and dispatch are not gated by this dollar guard; existing native/controller behavior remains unchanged. A source grant itself authorizes no native operation.\n\nRename the existing native-admission test to identify paid reservation admission, and add or extend a hermetic in-memory counterexample after a valid source grant raises liability above the configured native paid ceiling: a new reservePaid attempt refuses, while createIntent and planAttempt for an otherwise eligible local delivery succeed, with the budget unchanged. No actual dispatch/provider/native work, credentials, subprocess or network is permitted.\n\nRun pnpm exec vitest run tests/cd/source-finance.test.ts tests/cd/source-finance-cli.test.ts and pnpm typecheck; inspect actual results. Run git diff --check. Record exact evidence and the conditionMet response in the author worklog. Normal required CI and record validation remain separate requirements.\n\nNo production source, state/configuration schema, controller, store, invariant, workflow, package/dependency or generated dist change is covered by this condition. No generated counterpart is required for this prose/test-only correction. Any implementation change or unrelated author path needs an explicitly authorized review scope; this condition does not grant another reviewer turn, publication event, financial use or provider operation."
      },
      "conditionMet": "Fixed in a7dbbdef1793d9e8304d61de6c7a0bed7049a44f. Only the seven exact condition paths changed from the reviewed commit; no production source, schema, controller, store, invariant, workflow, dependency or dist changed. The source-finance test now establishes fictional aggregate liability 267000000 above configured paid ceiling 250000000 after a valid source reservation, rejects a new reservePaid call, creates a pending otherwise-eligible local intent and active intended local attempt, and asserts the complete budget unchanged and zero FakeGitHub calls. Existing old reserved identity replay assertions remain. Actual commands: pnpm exec vitest run tests/cd/source-finance.test.ts tests/cd/source-finance-cli.test.ts passed 95 tests / 2 files; pnpm typecheck exited 0; git diff --check exited 0. No real dispatch, credentials, subprocess, network, grant, financial or native runtime effect was performed. The reviewer explicitly required no follow-up when this exact condition is met; normal CI and record validation remain separate."
    }
  ]
}
```
