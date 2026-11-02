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
- `assertSourceAdmissible` refuses an older source; `planAttempt` calls it first, so the
  controller's existing reconcile catch turns the refusal into repair work carrying the message,
  before any build number is reserved. A floor the ledger has not observed on main is not read as
  "no floor": it is a `CdWait` (`wait-physical-source-floor`), so the intent waits for a
  configuration migration instead of starting repair agents (review finding REV-F2).
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
is shifted (Appendix A). 1141 CD tests pass, as do typecheck and lint.

**Not changed.** Automatic slot selection still picks the newest eligible source and does not skip
below-floor sources. Below-floor intents now go to repair with an explicit message instead of
dispatching. Consumer adoption (Evo config with the floor, ledger configuration migration, worker
pin bump) is separate work in the Evo repository. Adding the floor changes the consumer's
configuration digest.

## Independent review

Fresh independent review at normal risk. The initial turn (e083f039) cleared with no substantive findings: REV-F1 (minor) noted the prompt rule omitted the at-or-after-current-source condition; REV-F2 (minor) noted an unknown floor sent every due intent to repair agents that cannot fix a configuration error; REV-F3 (incidental, pre-existing) noted intent.blocker stayed empty for a refused repair because an empty missingCapability short-circuited the verification error. The author fixed all three in d78d167a (prompt sentence names all three conditions; unknown floor is a CdWait that waits with wait-physical-source-floor and starts no agent; blocker uses missingCapability || verificationError) with tests and mutants, and spent one same-reviewer follow-up because the incidental fix is outside the minor-fix allowance. The follow-up cleared d78d167a with no new findings, 416 focused tests passing and committed dist matching a fresh build. Limitation: one optional nit was left as is: the comment above the planAttempt call still says a plain error routes to repair, while the unknown-floor case now waits; the comment inside assertSourceAdmissible explains it.

Follow-up: Same reviewer cleared d78d167a: REV-F1, REV-F2 and REV-F3 resolved, controller catch handles the CdWait before repairWork, intent.blocker has no reader that depends on an empty string, no new findings; 416 focused tests, typecheck and eslint clean, dist matches a fresh build.

```morpheus-review
{
  "version": 2,
  "base": "a4680c9fe2fb51162e61a321a3fe8d797cbc588c",
  "reviewed": "e083f0399da63277ff320f02440e01dc77f126cc",
  "covered": "d78d167a651417db9ad7e3916ea80cdc3834a63a",
  "authorSession": "claude-code/cae29785-49d9-41ff-9b32-6350ae76eb63",
  "reviewerSession": "claude-code-subagent/a9711d7d81dd8f205",
  "risk": "normal",
  "elapsedMinutes": 7.48505,
  "timing": {
    "source": "runner",
    "durationMs": 449103,
    "evidence": "Claude Code Agent tool result for reviewer subagent a9711d7d81dd8f205, initial turn: duration_ms=449103."
  },
  "outcome": "complete",
  "summary": "Fresh independent review at normal risk. The initial turn (e083f039) cleared with no substantive findings: REV-F1 (minor) noted the prompt rule omitted the at-or-after-current-source condition; REV-F2 (minor) noted an unknown floor sent every due intent to repair agents that cannot fix a configuration error; REV-F3 (incidental, pre-existing) noted intent.blocker stayed empty for a refused repair because an empty missingCapability short-circuited the verification error. The author fixed all three in d78d167a (prompt sentence names all three conditions; unknown floor is a CdWait that waits with wait-physical-source-floor and starts no agent; blocker uses missingCapability || verificationError) with tests and mutants, and spent one same-reviewer follow-up because the incidental fix is outside the minor-fix allowance. The follow-up cleared d78d167a with no new findings, 416 focused tests passing and committed dist matching a fresh build. Limitation: one optional nit was left as is: the comment above the planAttempt call still says a plain error routes to repair, while the unknown-floor case now waits; the comment inside assertSourceAdmissible explains it.",
  "findings": [
    {
      "id": "REV-F1",
      "severity": "minor",
      "description": "The repair prompt's admissibility sentence named strict descent past attempted sources and the floor but not the at-or-after-current-source rule assertRepairAdmissible also enforces, so an agent could return an older reviewed merge that is still refused.",
      "paths": [
        "src/cd/worker.ts",
        "tests/cd/native-worker.test.ts"
      ],
      "disposition": "fixed",
      "response": "The sentence now says the merged source must be at or after the delivery context's source, strictly after every attemptedSources entry and at or after any floor; the delivery context already carries the current source, so it is not duplicated. A native-worker test asserts the sentence. Fixed in d78d167a; cleared by the follow-up."
    },
    {
      "id": "REV-F2",
      "severity": "minor",
      "description": "An unknown floor raised a plain invariant error, so the controller routed every due intent to repair agents that cannot correct a configuration error, spending subscription quota before human escalation.",
      "paths": [
        "src/cd/state.ts",
        "tests/cd/physical-device.test.ts",
        "tests/cd/controller.test.ts",
        "docs/cd-v2-controller.md"
      ],
      "disposition": "fixed",
      "response": "assertSourceAdmissible throws CdWait with code physical-source-floor for an unknown floor; the reconcile catch sets waiting and wait-physical-source-floor with the message as blocker and starts no agent, and re-plans each poll so a corrected configuration recovers. A below-floor source still routes to repair. Tests assert the CdWait code and the controller outcome (no agents, no attempt, no dispatch); the docs say so. Fixed in d78d167a; cleared by the follow-up."
    },
    {
      "id": "REV-F3",
      "severity": "incidental",
      "description": "Pre-existing: intent.blocker = stopped ?? missingCapability ?? verificationError kept an empty missingCapability string, so a refused repair's reason never reached intent.blocker or cd status, and hosted executors do not get the checkpoint summary back.",
      "paths": [
        "src/cd/worker.ts",
        "tests/cd/native-worker.test.ts"
      ],
      "disposition": "fixed",
      "response": "Now stopped ?? (missingCapability || verificationError): stopped and a nonempty missingCapability keep precedence; an empty-capability checkpoint without a verification error gets an undefined blocker instead of an empty string, and status is the only reader. The refusal tests assert the blocker message. Fixed in d78d167a under a same-reviewer follow-up, since an incidental fix is outside the minor-fix allowance."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "claude-code-subagent/a9711d7d81dd8f205",
      "commit": "d78d167a651417db9ad7e3916ea80cdc3834a63a",
      "outcome": "cleared",
      "elapsedMinutes": 2.85445,
      "timing": {
        "source": "runner",
        "durationMs": 171267,
        "evidence": "Claude Code Agent tool result for reviewer subagent a9711d7d81dd8f205, follow-up turn: duration_ms=171267."
      },
      "scopeReason": "The initial turn cleared with minor and incidental findings only; the author fixed both minor findings and the incidental REV-F3 in one commit, and the incidental fix plus the REV-F2 behaviour change needed the same reviewer's verification.",
      "summary": "Same reviewer cleared d78d167a: REV-F1, REV-F2 and REV-F3 resolved, controller catch handles the CdWait before repairWork, intent.blocker has no reader that depends on an empty string, no new findings; 416 focused tests, typecheck and eslint clean, dist matches a fresh build."
    }
  ]
}
```

## Appendix A: validation

- `pnpm typecheck`, `pnpm lint`: clean.
- `pnpm exec vitest run tests/cd/state.test.ts tests/cd/physical-device.test.ts tests/cd/post-resume.test.ts tests/cd/native-worker.test.ts tests/cd/claude-executor.test.ts tests/cd/controller.test.ts tests/cd/repair-checks.test.ts tests/cd/worker.test.ts`:
  564/564 before the new tests, 580/580 with them.
- `pnpm exec vitest run tests/cd`: 27 files, 1140/1140 at e083f039 and 1141/1141 at d78d167a (review fixes).
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
