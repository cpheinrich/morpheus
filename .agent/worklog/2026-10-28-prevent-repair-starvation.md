---
id: MO-26-10-28-12.59.13
title: Prevent CD repair queue starvation
date: 2026-10-28
tags: [engineering, devops]
---

# Fair ordinary repair selection

## Mandate and scope

Chris authorized fresh heartbeat state, supported normal read/write recovery and
an audit of the gates that can stall Evo delivery. The same USD350 campaign cap,
spend-as-needed/no-internal-holds policy and uncertain liabilities remain. Root
owns public/PM/operations, review, CI, merge and separate runtime qualification.

M536/cb502558 is protected merged with final CI7PASS2SKIP and independent HIGH
clearance. This new task is independent of its completed review and changes only
the ordinary worker's default selection. The audit's queue mechanism is verified;
no empirical incident-cause or delivery credit is claimed.

## Design

Read current due/lease-eligible candidates without changing native ordering.
Rank by latest actual invocation start, using creation time for never-invoked
work and code-unit ID order for ties. Choose an ordinary/unpaused candidate before
returning a blocked candidate's diagnostic. Keep explicit work-id behavior and
all later source/task/quota/pause/typed/CAS/reservation/fence/host/session checks.
This small domain selection uses existing arrays/timestamps; no generic scheduler
or dependency is introduced. The paused/typed failure cases are proved against
the unchanged source before implementation.

## Evidence and validation in progress

The new worktree starts at the protected M536 main. Required records were compared
byte-for-byte with the read/reviewed merged tree, refreshed and claimed normally.
Prior graph Tier2 evidence and exact current source fallback are used because
MCP transport/exact-worktree indexing are unavailable. No graph completeness
claim or repeated installer workaround is made.

Source author setup failures are retained: sharing a channel for the second
ordinary fixture correctly refused the state, and a synthetic typed-origin write
was correctly refused. The selection boundary instead uses separate ordinary
channels and a one-read typed projection; this is a unit boundary fixture, not a
whole typed-ledger acceptance. Both selection regressions then failed unchanged
source as expected. No live model, provider/account/host probe, native state edit
or source adoption is part of the source work.

## Source validation and test plan

Final source-author commands actually run:

- `pnpm exec vitest run tests/cd/native-worker.test.ts tests/cd/worker.test.ts tests/cd/repair-control.test.ts`:110PASS, zero skips.
- `pnpm typecheck`: passed.
- `git diff --check`: passed.

Root inspected the selection/doc diff, verified the final worker source byte
hash, and ran `pnpm compile` successfully. CI owns the full suite; no unchanged
local full suite was run.

Six actual provider-free selector mutants each exited1 with AssertionError:
remove blocked filtering, rank by creation, rank by renewed next check, use
insertion-order ties, require strict due<, and require strict lease-expiry<.
Source bytes were restored in finally; final worker SHA256 is
b5760baea249fbda4d6261b854436ac62ed853cd3d4950137880d5cae56fd2b9,
identical to the final110-test source. No mutation score or live effect is claimed.

Tests cover equality boundaries, deterministic ID ties across reversed insertion,
explicit not-yet-due target behavior, missing/digest/paused/typed explicit guards,
and no-runnable diagnostics. Preserve earlier harness failures: second ordinary
work originally shared a channel and correctly refused; synthetic typed-origin
mutation correctly refused; two corrected boundary regressions then failed on
unchanged code; a later local variable named after shadowed the imported fixture
helper and caused TDZ/test/typecheck errors before being corrected. None is
reported as a product regression or erased.

Runtime remains the original normal Q8ba/R5ede pair until a new reviewed carrier
and exact operational qualification adopt the final protected M source. The
closed R verifier pins M HEAD, full manifest and constants, so common-path edits
alone cannot deploy this source. The independent Root operator and existing typed
controller roles stay unchanged. Source tests do not prove actual fair dispatch,
quota availability, TestFlight delivery or any optional empirical acceptance.
