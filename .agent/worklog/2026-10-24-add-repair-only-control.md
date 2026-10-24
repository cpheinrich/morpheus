---
roadmap: MO-26-10-24-10.03.55
date: 2026-10-24
---
# Add repair-only control for CD worker

**Added:** `src/cd/repair-control.ts` (pure leaf with type-only imports; hash and store injected), `src/cd/repair-control-entry.ts` (closed `parseArgs` grammar over an injected store), `src/cd/worker-only-entry.ts` (injected unchanged `runWorker`), `tests/cd/repair-control.test.ts`, the runbook `docs/runbooks/cd-repair-control.md` and one `architecture.md` paragraph. No change to `cli.ts`, `worker.ts`, `controller.ts`, `store.ts`, `state.ts` or `invariants.ts`.

**Tests:** `pnpm exec vitest run tests/cd/repair-control.test.ts`, 15 passing. They use an in-memory store with GitHubStore's replay contract plus the real `assertTransition`, and drive the real normal reducers (`planAttempt`, `recordTests`, `claimUpload`, `recordUpload`, `deliver`, `repairWork`) to the delivered and rejected states. A local mutation check removed `claim-agent-invocation` from the guarded kinds, and separately disabled the readback refusal; both mutants failed the tests. `pnpm typecheck` is clean.

**Dead ends:** a race fixture first built its hold through `holdTransition`, which correctly refuses once work exists. The fixture now injects the entry directly to model a race-committed hold.

**Initial portable-test limits:** the public tests used the current root and did not execute the pinned F65 library. The private A3 qualification below subsequently exercised the real pinned library imports with named external fakes. No real CLI, native agent or provider ran. The consumer binding and live ownership/adoption remain separate gates.

**Real pinned runtime qualification (private, A3):** a hermetic library harness imported the unmodified pinned F65 `schema/store/state/invariants/worker` modules (hashes verified before import) and this branch's dist, with network and child-process exports tripwired and a strict in-memory GitHub API. Every check passed: real-store codec, replay and readback; the guarded kinds; the 79.9/80 quota boundary; real `runWorker` held, no-starvation, race and claim-winner cases; the accepted early race; deliver completing held repair; a genuine rejection staying held; and the actual journal accepting the nested result while refusing a flattened one. Port types assign strictly against the F65 declarations, and a negative type control fails as intended. Process boundaries (login exec, agent spawn, quota file) were explicit fakes; no real agent, provider or CLI ran.

**Review preparation:** the roadmap item is now `review`; no PR, CI or independent SOURCE review has run. Reused unchanged-code validation: `pnpm exec vitest run tests/cd/repair-control.test.ts` (15 passed), `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index` and `pnpm exec vitest run tests/agent-instructions.test.ts` (14 passed). The private A3 entrypoint `harness/qualify.mjs` ran with a cleared environment and fixture HOME/config/sourceDir: 21/21 cases, no tripwire hits; strict TypeScript port assignment against actual F65 declarations passed, and its negative control failed with two errors. A guard mutant was caught by three cases and the dist was restored byte-equal. Those private proof files remain separate from portable committed tests. The meter interval and hosted executor were not exercised; quota/login/agent boundaries were named fakes. Synthetic journal evidence grants no Apple, provider, native or OP acceptance. No unchanged suite is rerun for these metadata edits.

## Independent review

One fresh Claude Code reviewer session (`cf511d7b-2de9-4fa6-9b27-088235e9faf0`) reviewed `b6458429..8706393c` at HIGH risk and cleared it **conditionally on F1**.
- **F1 (substantive): hosted scheduling bypasses the hold.** `cd tick` → `scheduleHosted` uses the raw store and an exact-scope pause check, so held work is still hosted-dispatched. Wrapping `scheduleHosted` in `guardStore` would starve unheld work. The reviewer set a docs-only condition. `61e67a16` meets it: the runbook and the architecture paragraph now state all four required disclosures (hosted scheduling not held; never wrap `scheduleHosted`; route local workers through the worker-only entry and keep hosted scheduling off while any hold exists; `claim-hosted-agent-dispatch` is defensive only). The required evidence passed: `pnpm exec vitest run tests/cd/repair-control.test.ts tests/agent-instructions.test.ts`, 29/29 (15 + 14). `git diff --name-only 8706393c..61e67a16` lists only `architecture.md` and `docs/runbooks/cd-repair-control.md`.
- **F2 (minor): exit codes.** A malformed control or a store error throws from `runRepairControl` instead of returning 0/3/2. Documented, as the reviewer explicitly allowed: 0/3/2 cover returned results, `RepairControlInvalid` and store errors can throw and must be caught, and the malformed case writes nothing and fails closed.
- **F3 (incidental): result type.** `HeldAwareResult` is `unknown`. Documented: callers must validate and narrow it themselves.

No `src/`, `dist/` or test bytes changed after review, and there were no follow-up turns. **Limits:** the reviewer did not use graph tools and spot-verified inputs rather than re-authenticating every payload; its hosted probe used the current-root dist. The real meter, hosted scheduling under the pinned runtime, native agent or provider, a live CLI/ledger/host, the Evo binding and operational adoption all remain unproved.

```morpheus-review
{
  "version": 2,
  "base": "b6458429edd78d5301126a632df9c576a02e1c55",
  "reviewed": "8706393c1144b1aeee469e2d45fbc7cd56195a6a",
  "covered": "61e67a165cc00580934ff9efa9a8f3087eaa895f",
  "authorSession": "26cc26b1-9bdf-4df6-8d70-8ca09f2a7f01",
  "reviewerSession": "cf511d7b-2de9-4fa6-9b27-088235e9faf0",
  "risk": "high",
  "elapsedMinutes": 8.7284,
  "timing": {
    "source": "runner",
    "durationMs": 523704,
    "evidence": "Native runner result uuid 5edf67c4-f7e3-4d49-84f8-d58f2c1aba99 for reviewer session cf511d7b-2de9-4fa6-9b27-088235e9faf0, run 9c00fa0f-ee4e-4b5d-aa05-2753fe23b88f: duration_ms=523704. The separate coordinator dispatch clock (527536.597 ms) is not this runner duration."
  },
  "outcome": "complete",
  "summary": "Fresh HIGH review of b6458429..8706393c cleared conditionally on F1 (substantive: hosted scheduling via cd tick/scheduleHosted bypasses a repair: hold). The docs-only condition is met at 61e67a16 with the four required disclosures; F2 (minor, CLI throws on a malformed control or store error) and F3 (incidental, HeldAwareResult is unknown) are documented as the reviewer allowed. No source, dist or test change after review; no follow-up turns. Real meter, pinned hosted scheduling, native agent/provider, live CLI/ledger/host, Evo binding and adoption remain unproved.",
  "findings": [
    {
      "id": "F1-hosted-dispatch-unheld",
      "severity": "substantive",
      "description": "claim-hosted-agent-dispatch is issued only by scheduleHosted, which cd tick calls with the raw store; no entry in this change gates it and paused() ignores repair: scopes, so held work is hosted-dispatched. Wrapping scheduleHosted in guardStore would abort the loop and starve unheld work. The docs called the kind guarded and did not disclose the bypass.",
      "paths": ["src/cd/repair-control.ts", "src/cd/worker-only-entry.ts", "docs/runbooks/cd-repair-control.md", "architecture.md"],
      "disposition": "fixed",
      "response": "Documented at 61e67a16 within the condition paths: hosted scheduling is not held; never wrap scheduleHosted in guardStore; the unchanged cd worker/cd tick ignore the hold, so a consumer must route local workers through the worker-only entry and keep hosted scheduling off (no agents.hosted or no hosted scheduling on tick) while any hold exists, until a separately reviewed held-aware hosted scheduler exists; claim-hosted-agent-dispatch in GUARDED_KINDS is defensive only. No code change.",
      "condition": {
        "paths": ["docs/runbooks/cd-repair-control.md", "architecture.md", ".agent/worklog/2026-10-24-add-repair-only-control.md"],
        "evidence": "pnpm exec vitest run tests/cd/repair-control.test.ts tests/agent-instructions.test.ts all passing; git diff --name-only 8706393c1144b1aeee469e2d45fbc7cd56195a6a..<fix-commit> lists only the condition paths"
      },
      "conditionMet": "Ran pnpm exec vitest run tests/cd/repair-control.test.ts tests/agent-instructions.test.ts: 2 files, 29 tests passed (15 + 14), exit 0. git diff --name-only 8706393c1144b1aeee469e2d45fbc7cd56195a6a..61e67a165cc00580934ff9efa9a8f3087eaa895f lists architecture.md and docs/runbooks/cd-repair-control.md only."
    },
    {
      "id": "F2-cli-exit-contract",
      "severity": "minor",
      "description": "RepairControlInvalid (a malformed existing repair: control) and store errors escape runRepairControl as throws rather than the documented 0/3/2 exits; the malformed case fails closed with no writes.",
      "paths": ["src/cd/repair-control-entry.ts", "src/cd/repair-control.ts", "docs/runbooks/cd-repair-control.md"],
      "disposition": "fixed",
      "response": "Took the reviewer's documented alternative: the runbook states that 0/3/2 apply to returned results, that RepairControlInvalid and store errors can throw and the caller must catch them, and that a malformed control writes nothing and fails closed. It does not promise that an arbitrary store error never wrote. No code change."
    },
    {
      "id": "F3-heldaware-type-unknown",
      "severity": "incidental",
      "description": "HeldAwareResult includes | unknown, so the whole type is unknown and callers get no checking of the documented states.",
      "paths": ["src/cd/worker-only-entry.ts"],
      "disposition": "fixed",
      "response": "Took the reviewer's documented alternative: the runbook states that HeldAwareResult is unknown (it includes the injected worker's result) and callers must validate and narrow it; it is not a discriminated union. No code change."
    }
  ]
}
```
