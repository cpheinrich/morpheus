---
date: 2026-11-04
agent: claude
roadmap: MO-26-11-04-15.07.12
outcome: review
tags: [engineering, devops]
summary: An exited unattended gateway-worker admission whose guardian could not verify cleanup at exit can now be re-proven with an explicit `--reconcile`. It runs a fresh read-only census with the existing owned-process tracker and writes one snapshot-bound proof that the guardian's admission gate and `--status` both accept; nothing is signalled and `process.json` is never changed.
---

# Reconcile an exited worker's termination from fresh owned-process proof

## Ask

A real unattended admission exited normally but kept `cleanupVerified: false`. Minutes later all
nine recorded owned processes and the guardian were gone, yet `--status` still reported
termination unverified, `--resume` was refused and the workspace stayed held. The CLI offered no
supported way to re-prove termination. The requirements:
- an explicit command that writes positive, snapshot-bound proof;
- the guardian's gate and the public status both accept that proof;
- every other case fails closed;
- no signals, no relaunch, no manual flag reset.

## Cause

The guardian computes `cleanupVerified` once, at exit, from `owned.empty()` after a 2 s TERM and a
2 s KILL loop. The tracker's `verified` flag latches false on any census error or identity
ambiguity, and a tool can outlive the window. Nothing re-evaluates the flag afterwards. The guardian
gate (`guardian.py`) and `workerResult` both read it directly.

## What changed

- **`src/termination_proof.py`** (new, about 120 lines, standard library plus the existing tracker):
  - `reconcile(dir, runId)` acts only on a record that matches the run, is exited and not rejected,
    has `cleanupVerified` exactly `false`, a non-empty and well-formed `ownedProcesses`, and a
    recorded `guardianPid` and `guardianIdentity`.
  - It holds while the recorded guardian identity is alive, or while its PID cannot be read.
  - It seeds `OwnedProcesses` with the recorded identities and calls `empty()` once. That covers
    the marker, those identities and their descendants, and fails on an unreadable census. It
    never signals.
  - Only then does it link one `reconciliation.json` into place, exclusive and never replacing an
    existing file. The proof holds version 1, the admission id, the method, the SHA-256 of
    `process.json` and of `admission.json` as read before the census, a count and a timestamp.
  - `valid(dir, runId)` re-checks the record and both digests.
- **`guardian.py`**: the admission gate accepts the previous run when `cleanupVerified` is true *or*
  `termination_proof.valid(...)` holds. Everything else in the gate is unchanged.
- **`gateway-worker.mjs`**: `workerResult` treats a valid proof as verified termination, through the
  same Python `valid`. The timing evidence says when cleanup was proven later. `reconcileWorker`
  and `--reconcile ADMISSION_ID` run the reconcile and return status plus
  `{proven, reason}`; the exit code is 0 only when termination is verified. `--status` stays
  read-only.
- `scripts/check.mjs` parses the new file; the README documents the command and its limits.

## Result

- **Before the fix:** both new tests fail against `origin/main`'s plugin (2 fail,
  `/tmp/mo-reconcile-before.log`), because `--reconcile` does not exist and resume stays refused.
- **End-to-end, with a real guardian, CLI and fake `codex` executor:**
  - A `ps` shim fails only the guardian's pre-signal identity lookup. That leaves a
    SIGTERM-ignoring detached tool unsignalled and a real `cleanupVerified: false` record with
    complete identities.
  - Resume is refused at first.
  - `--reconcile` holds while the tool is alive: nothing is written, and the tool's heartbeat keeps
    moving, so it was not signalled.
  - After the tool exits, the proof is written; status is verified with the original timing; and
    the `process.json` bytes are unchanged.
  - A repeat reconcile is idempotent, leaving the proof bytes unchanged.
  - Changing one byte of `process.json` makes status and the guardian gate refuse; restoring it
    makes both accept again.
  - `--resume` through the guardian then completes on the same binding and the retained session,
    with a distinct new admission whose own cleanup is verified.
- **Fail-closed table:**
  - These are refused and write nothing: a recorded identity alive, an unrecorded marked process,
    a live recorded guardian, a malformed, missing or empty identity, a missing guardian identity,
    another run, a running record, a never-launched admission, and a mismatched existing proof.
  - A rejected record and an already-verified one are not reconciled; they keep their existing
    terminal status.
  - A PID reused by an unrelated process, for an owned process and for the guardian, does not
    block, and both unrelated processes are left alive.
- The full plugin suite passes 180/180, `scripts/check.mjs` passes, and the root `pnpm typecheck`
  and `pnpm compile` pass with no generated changes.
- All 7 guard mutations fail the tests (Appendix A).

## Limits

The proof meets the guardian's own standard and no more. Identity is uid plus start time to the
second, and descendants are found by the inherited marker and by parent links from known owners. A
same-user tool that both cleared its marker and was reparented before any census is invisible
here, as it is to the guardian (the README's cooperating-tools limit). An empty or missing
ownership record fails closed, because it means the guardian never learned the group.

## Open questions

None. The live use, running `--reconcile` against the real exited admission, is root's after
review and merge.

## Appendix A — commands and mutations

- `cd plugins/factory && pnpm install --frozen-lockfile --ignore-workspace` (the plugin keeps its
  own lockfile).
- `node --test --test-name-pattern 'reconcile' tests/unattended-worker.test.mjs`: 2/2 now; 0/2
  against `git archive origin/main plugins/factory` with the new test file.
- `node --test tests/*.test.mjs`: 180/180. `node scripts/check.mjs`: exit 0.
- `pnpm typecheck`, `pnpm compile` (no `dist/` change), `pnpm morpheus pm index`.

Scope: the plugin's own suite covers every caller of the guardian and of `workerResult`. Root
`src/` is unchanged, so the root suite is left to CI.

Mutations, each run as the two reconcile tests in a temp copy; every one makes them fail:

| Mutant | Failures |
|---|---|
| A: the guardian gate ignores the proof | 1 |
| B: status ignores the proof | 2 |
| C: the proof is not bound to `process.json` bytes | 1 |
| D: the guardian liveness check is skipped | 1 |
| E: the census is skipped | 2 |
| F: a 5-word identity is accepted | 1 |
| G: already-verified records are reconciled | 1 |
