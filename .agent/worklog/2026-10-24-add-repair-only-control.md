---
roadmap: MO-26-10-24-10.03.55
date: 2026-10-24
---
# Add repair-only control for CD worker

**Added:** `src/cd/repair-control.ts` (pure leaf with type-only imports; hash and store injected), `src/cd/repair-control-entry.ts` (closed `parseArgs` grammar over an injected store), `src/cd/worker-only-entry.ts` (injected unchanged `runWorker`), `tests/cd/repair-control.test.ts`, the runbook `docs/runbooks/cd-repair-control.md` and one `architecture.md` paragraph. No change to `cli.ts`, `worker.ts`, `controller.ts`, `store.ts`, `state.ts` or `invariants.ts`.

**Tests:** `pnpm exec vitest run tests/cd/repair-control.test.ts`, 15 passing. They use an in-memory store with GitHubStore's replay contract plus the real `assertTransition`, and drive the real normal reducers (`planAttempt`, `recordTests`, `claimUpload`, `recordUpload`, `deliver`, `repairWork`) to the delivered and rejected states. A local mutation check removed `claim-agent-invocation` from the guarded kinds, and separately disabled the readback refusal; both mutants failed the tests. `pnpm typecheck` is clean.

**Dead ends:** a race fixture first built its hold through `holdTransition`, which correctly refuses once work exists. The fixture now injects the entry directly to model a race-committed hold.

**Limits:** no real CLI, worker or provider was run. Binding the pinned runtime's store and `runWorker`, the full import closure and adoption are separate gates. The consumer-journal acceptance was proven privately earlier; the public test checks only the result shape and the creation-row filter.

**Real pinned runtime qualification (private, A3):** a hermetic library harness imported the unmodified pinned F65 `schema/store/state/invariants/worker` modules (hashes verified before import) and this branch's dist, with network and child-process exports tripwired and a strict in-memory GitHub API. Every check passed: real-store codec, replay and readback; the guarded kinds; the 79.9/80 quota boundary; real `runWorker` held, no-starvation, race and claim-winner cases; the accepted early race; deliver completing held repair; a genuine rejection staying held; and the actual journal accepting the nested result while refusing a flattened one. Port types assign strictly against the F65 declarations, and a negative type control fails as intended. Process boundaries (login exec, agent spawn, quota file) were explicit fakes; no real agent, provider or CLI ran.
