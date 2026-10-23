# Reuse verified evidence for accepted CD uploads

## 2026-10-23 — design before implementation

Task MO-26-10-23-02.45.46 starts from main `e1532b96dcd8360aa48745e5073f05af20f31522`.
The observed failure is a repeated Actions artifact download returning an egress
503 after full tests and upload acceptance were already durably verified. Apple
observation and ordinary receipt creation were never reached. This source change
does not claim the physical build has a CD receipt or alter any live state.

The approved design reuses only the current active attempt's immutable compact
full-test proof and accepted upload after a fresh exact workflow sweep. It checks
identity, input/configuration, proof hashes/count/skips, artifact/validator refs and
upload claim/fence, and rechecks the validator from its pinned Git revision. Missing
eligibility keeps the old download path; inconsistent reusable data refuses before
Apple. The compact proof never enters `recordTests`. The existing CAS and Apple/
delivery path remain responsible for the result. Failed terminal cleanup and an
expired uploader lease do not invalidate an already accepted read-only recovery.

This is a domain-specific binding check under 100 lines, so no generic module or
dependency is needed. Phase A is local source/tests/records only. No source push,
CI, reviewer or runtime/consumer adoption is authorized yet.

## Local qualification

The production delta is one private controller guard (35 lines), one branch after
normal effect/run verification and duplicate control, and a type-only widening of
`verifyValidator` to accept `TestProof`. No behavior changed in actions, Apple,
state, schema, store, worker, package or lockfile. Compiled counterparts are refreshed.

- Final focused command: `pnpm exec vitest run tests/cd/controller.test.ts tests/cd/adapters.test.ts tests/cd/state.test.ts tests/cd/external.test.ts` — **310 passed, zero failed/skipped** across four files. It covers the real pinned Git validator, exact workflow/rerun/duplicate handling, missing proof and strict malformed/identity/fence/reservation boundaries, accepted post-upload failed cleanup, expired lease, allowed skip equality, pause/concurrent receipt races and ordinary Apple readiness/membership. An earlier four-file pass had 309 cases; the final strict boolean reservation boundary added one. An earlier command also supplied a nonexistent `invariants.test.ts` filter; Vitest executed only the same four actual files, not a standalone invariant suite.
- Private integration: a COPY of the retained affected ledger, original completed provider run and five captured Apple GET responses, with only the external-read fixture extended for an unrelated already-due empty-group follow-up. **One passed** on the final source. The ordinary controller makes the exact receipt, completes its existing matching repair work, preserves tests/verification time/upload bytes, burned builds, budgets, holds, prior receipts/cursors and lineage, and uses **zero artifact calls, zero upload/POST/dispatch/cancel**. The prior source against the same copy fails with artifact 503 and no receipt. These are synthetic providers and an isolated fake GitHub store; this is no live recovery or receipt credit.
- Nine focused mutants were run outside CI and inspected: repeated artifact download, skipped validator, omitted proof identity, zero execution admission, ignored current fence, success-only cleanup gate, ignored source catalogue, re-recording compact proof and truthy nonboolean reservation. Every mutant fails a behavioral assertion. The original-source actual-copy failure is retained separately from the nine mutants.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`, `pnpm morpheus pm validate` and `git diff --check` passed. No full local test suite, iOS build, provider request or runtime execution.

Initial local failures are preserved in the private qualification packet: the first
filtered test incorrectly expected no ordinary cursor (the fixture is ordinary,
not validation); the first actual-copy adapter lacked an unrelated due external
read and was corrected without altering the copied ledger or production policy;
and typecheck caught a test-only optional-index increment, corrected explicitly.
A final strict `burned === true` check rejects malformed truthy values rather than
trusting the TypeScript interface at a persisted-data boundary.

Source-only evidence and actual command clocks are retained privately for the
independent review packet. No independent review or CI is claimed. ROOT reserved
the five-dollar whole M source loop once; that is funding only, and Phase A stops
before source publication. Consumer role binding, full immutable runtime/profile
qualification and exact operational review remain separate future work. Existing
accepted bytes can recover through the old runtime if the provider outage resolves;
this commit does not authorize or perform that recovery.

The codebase-memory device check reports MCP 0.10.8 and enabled watching, but this
exact new worktree has no index and the installed general CLI is behind current
main. No global CLI/index install or update was performed under the source-only
no-host-effect scope. Tier 2 structural evidence uses the indexed primary
(generation 2026-10-23T09:45:52Z); it is best-effort and does not cover this branch.
All relied current task sources were read directly; the reported controller-test
line-13 parser gap was read explicitly. This limitation is distinct from the
passing source checks and PM index, and must accompany the review packet.

## Source publication release

ROOT authenticated the complete local packet and separate comparison-label
clarification, then released the normal M-only publication/review/CI loop under
the already reserved five-dollar source-cycle allocation. The comparison key
`unchangedComparedToInstalledMdc` was mislabeled: its six paths are changed paths
within the bounded fixed-Git CD/package/lock comparison. It proves no full-repo,
177-file consumer closure, dependency/tool/auth or live-install equality. The
original sealed packet is preserved with its correction alongside it.

The item is now review metadata for an unlabelled draft. No independent review
or CI has yet been claimed. Actual source merge remains distinct from consumer
coherence/runtime adoption, and the installed runtime is untouched.

## Independent HIGH source review

The independent HIGH source review cleared accepted-upload proof reuse with no findings or conditions. Fresh workflow and pinned-validator checks, strict proof/upload binding, and the existing Apple, CAS, pause, cursor and immutable receipt guards remain intact.

One fresh reviewer, no inherited author history or subreviewers, independently
inspected the exact committed source, both sealed packets and retained actual
results. No tests were rerun by the reviewer because no concrete execution
uncertainty remained. The initial exact-head CI had four successes and three
draft/legacy skips. Final record/readiness CI remains required before merge.
The copied ledger uses synthetic providers and no live receipt is claimed; the
primary-graph/exact-worktree indexing limitation is preserved.

Actual reviewer report completion is10:20:49.095938Z,306843.461ms from
author dispatch. The first author post-return reading is10:21:19.561481Z; the
record conservatively includes the complete337309.004ms invocation/capture span
from10:15:42.252477Z. The integer-millisecond field floors by0.004ms; both raw
measurements are retained rather than choosing a favorable boundary.

```morpheus-review
{
  "version": 2,
  "base": "e1532b96dcd8360aa48745e5073f05af20f31522",
  "reviewed": "abc9d3bff5641d5784314dac8a8fb239bdbeba15",
  "covered": "abc9d3bff5641d5784314dac8a8fb239bdbeba15",
  "authorSession": "01a15730-01ee-7f52-a39c-6c4bd5e9812d",
  "reviewerSession": "/root/morpheus_host/accepted_proof_source_review458",
  "risk": "high",
  "elapsedMinutes": 5.621816666666667,
  "timing": {
    "source": "clock",
    "durationMs": 337309,
    "evidence": "Actual pre-dispatch author clock 2026-10-23T10:15:42.252477+00:00 through first post-return author report-read clock 2026-10-23T10:21:19.561481+00:00, including reviewer tools/waits/final return and capture latency. Raw span337309.004ms retained; integer schema floors to337309ms. Reviewer report-completion clock2026-10-23T10:20:49.095938Z/span306843.461ms retained separately, not substituted. Raw report SHA256630796dd610c1eebffa871fa5ba2f4663b7d8dbe4617dc47251cd654ad164675; canonical reviewer runner thread01a16842-ace1-76e2-a43c-9e891be9d875. No duration estimate or idle segmentation."
  },
  "outcome": "complete",
  "summary": "The independent HIGH source review cleared accepted-upload proof reuse with no findings or conditions. Fresh workflow and pinned-validator checks, strict proof/upload binding, and the existing Apple, CAS, pause, cursor and immutable receipt guards remain intact.",
  "findings": []
}
```
