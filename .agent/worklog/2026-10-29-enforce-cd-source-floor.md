---
roadmap: MO-26-10-29-16.10.51
tags: [engineering, devops, cd]
---

# Admit CD sources against the physical-device floor; never re-adopt an attempted source

**Ask.** Fix upstream the defect behind Evo's 2026-10-29 failed attempt (#562): CD V2 repair
adoption could pick a source that cannot pass the configured physical-device test plan, and could
re-adopt the source that had just failed. The policy was only enforced when test evidence and the
upload claim arrived, after a build number was reserved.

**What was built.**

- `tests.physicalDevice.sourceFloor` (optional full SHA): the first first-parent main commit whose
  source carries the test plan. Absent keeps every existing configuration's bytes and digest
  (pinned in a test against the pre-change digest).
- `assertSourceAdmissible` refuses an older source, and refuses a floor the ledger has not observed
  on main rather than treating it as no floor. `planAttempt` calls it first, so the controller's
  existing reconcile catch turns the refusal into repair work carrying the message, before any
  build number is reserved.
- `assertRepairAdmissible` (post-resume guard, no backwards move, strict descent past every
  attempted source, floor). `adoptRepair` runs it before mutating anything.
- The worker runs the same check after `verifyRepair` and before the completion CAS. A refused
  merge becomes an ordinary checkpoint whose summary names the reason, instead of a
  `worker-error` transaction failure.
- The repair prompt gains a `Repair source admissibility (controller facts)` line with `lastMain`,
  the attempted sources and the policy's profile, test IDs and floor, plus one sentence of the rule.

**One deliberate change of shape.** The brief asked for `lastMain` and the policy inside the
prompt's delivery context. That context is hashed into the capability-wait digest, and existing
tests and `docs/cd-v2-controller.md` require that main moving on its own does not wake a
capability-blocked repair. Putting `lastMain` there would wake such work on every merge, so the new
facts sit on their own line outside the digest; existing digests and receipts are unchanged.

**Result.** All four guards are pinned by tests that fail when the guard is removed or its boundary
is shifted (Appendix A). 1140 CD tests pass, as do typecheck and lint.

**Not changed.** Automatic slot selection still picks the newest eligible source and does not skip
below-floor sources. Below-floor intents now go to repair with an explicit message instead of
dispatching. Consumer adoption (Evo config with the floor, ledger configuration migration, worker
pin bump) is separate work in the Evo repository. Adding the floor changes the consumer's
configuration digest.

## Appendix A: validation

- `pnpm typecheck`, `pnpm lint`: clean.
- `pnpm exec vitest run tests/cd/state.test.ts tests/cd/physical-device.test.ts tests/cd/post-resume.test.ts tests/cd/native-worker.test.ts tests/cd/claude-executor.test.ts tests/cd/controller.test.ts tests/cd/repair-checks.test.ts tests/cd/worker.test.ts`:
  564/564 before the new tests, 580/580 with them.
- `pnpm exec vitest run tests/cd`: 27 files, 1140/1140.
- Scope: only `src/cd/` changed, so the CD directory is the focused set; no shared core
  (`src/pm`, `src/check`, `src/session`, `src/review`, templates) was touched, so no full-suite run.
- Mutation checks, each run against the focused tests and then reverted:
  - worker calls `loadSources` instead of `admitRepairSource`: both worker refusal cases fail.
  - `planAttempt` without `assertSourceAdmissible`: the floor plan, unknown-floor and controller
    routing tests fail.
  - strict descent `>` weakened to `>=`: the state re-adoption case and the worker re-adoption case fail.
  - floor `>=` tightened to `>`: the at-floor plan and adoption cases fail.

## Appendix B: new tests

- `tests/cd/physical-device.test.ts` "physical-device source floor": digest pin for an existing
  policy, malformed floors, plan below/at/above the floor, unknown floor, adoption below/at floor
  without mutation on refusal.
- `tests/cd/state.test.ts` "repair adoption descends past attempted sources": re-adopting an
  older or the attempted source refuses without mutation; the next newer source adopts; an
  unattempted current source still adopts as before.
- `tests/cd/controller.test.ts` "physical-device source floor at planning": a tick against a floor
  above the source routes to repair with the exact message, reserves no build and dispatches
  nothing; a floor at the source plans and dispatches.
- `tests/cd/native-worker.test.ts` "repair source admissibility at verification": a merged repair
  at the attempted source or below the floor ends as a checkpoint with the reason (no
  `worker-error`, no lineage/source change); a merge at the floor is adopted, and the prompt's
  admissibility line is present while the capability digest still covers only the delivery context.
