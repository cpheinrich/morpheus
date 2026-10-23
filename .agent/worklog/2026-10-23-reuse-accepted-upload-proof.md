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
