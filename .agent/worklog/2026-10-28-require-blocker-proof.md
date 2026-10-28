---
date: 2026-10-28
agent: codex
roadmap: MO-26-10-28-14.29.09
tags: [engineering, devops]
outcome: review
summary: Require bounded evidence for a blocker candidate and independent CTO corroboration before accepting a hard block.
---

# Require evidence before accepting DevOps blockers

Chris requires proof that a DevOps agent tried every practical authorized unblocking route before reporting a blocker to the CTO. The CTO independently checks the evidence, current authority, available capabilities and remaining alternatives. A generic error, timer heartbeat or model self-attestation cannot establish exhaustion.

The approved design uses a bounded versioned proof envelope inside existing result evidence, bound to exact task, invocation, positive fence, frozen context, actual accepted claim and ownership deadline. It lists attempted and excluded routes with outcomes/references/times; explains the narrow missing capability and minimum external step; records independent work and next useful wake. A legitimate empty practical set requires a concrete human-only/access boundary and authority/capability evidence. No prohibited action is attempted merely to populate a list.

Invalid, stale or borrowed claims remain auditable attempted claims and become diagnostic checkpoints rather than accepted blocked cooldowns. A valid envelope is only a CTO-verification-required candidate with a digest. Shape validation cannot prove semantic exhaustion or self-approve the CTO. Existing telemetry/quota safety waits remain distinct from an accepted global hard block.

Canonical CTO/DevOps roles and references use the existing mirror/embedded-guide sync tool. The active delivery mandate retains fifteen-minute fresh internal reports and thirty-minute no-material-progress diagnosis; quiet user notifications do not stop supervision. No schema migration, new scheduler, generic proof registry or dependency is introduced.

## Implementation and validation history

The pure helper/guide/registry slice passed95 focused tests, typecheck and whitespace checks before worker integration. Three selected helper mutants failed by assertion and were restored. A first test startup failed before execution because concurrent pnpm wrappers linked the new checkout while Vitest started; the failure is retained, linking finished normally and the existing local binary was used without reinstalling. The owner integration then passed253 focused checks with zero skips; the final guide/registry scope passed53. Five selected final shadow mutants were assertion-killed: borrowed binding, stale context, unsupported outcome, lost completion-CAS evidence and trusted historical status. The original bootstrap failure remains recorded.

Root initially over-scoped a dependency wait to all development. To avoid an idle stall, Root checkpoints this source-only slice and merges the reviewed M540 branch into this separately claimed task tree for implementation. Publication/review base reconciliation and every runtime binding still require the actual protected dependency. No unprotected runtime adoption, borrowed task checkout, self-review or existing review-history reset is authorized.

Root normally integrated protected540 and current main2ad160e9b2300228814ad717dfc4242ca320256b before review (merge834c54fa). The three conflicts came from the separately squashed540 dependency; Root retained the complete new worker proof logic, its race tests and contract prose, while preserving all other incoming trunk changes. After integration, typecheck, compile, PM index and diff checks passed. The seven-file focused command passed318 tests with zero skips: `pnpm exec vitest run tests/cd/blocker-proof.test.ts tests/cd/native-worker.test.ts tests/cd/worker.test.ts tests/cd/repair-control.test.ts tests/cd/repair-checks.test.ts tests/agentic-cto-skill.test.ts tests/project-skills.test.ts`. This tests proof boundaries, the actual completion/retry owner, stale-evidence CAS races, related repair controls and distributed guides; no unchanged full suite was rerun locally.

The accepted lease expiry binds proof ownership; it does not extend model runtime or quota authority. A valid shape remains a candidate requiring CTO corroboration. Unsupported historical labels cannot qualify for cooldown, and a CTO rejection must reach the existing work through its supported diagnostic path. Source publication is separate from later exact consumer binding/runtime adoption, and cannot delay the already reviewed ordinary recovery rollout or substitute for a TestFlight receipt.

## Independent review

The fresh HIGH-risk independent review cleared the source with one minor documentation finding. Root fixed BF-1 by distinguishing failed-attempt repair-diagnostic from the existing exact-identity active-attempt failure evidence route. No substantive source findings or conditions remain; runtime binding and delivery remain separate.

The reviewer independently passed257 provider-free tests with zero skips and matched all seven generated JS/declaration/map outputs using an in-memory compiler emit. Its original minor severity and report remain retained. Root made only the narrow prose fix before the named protected-trunk integration; no repeated unchanged test suite was used for that prose correction. Initial draft CI reported no checks because the branch conflicted with newly protected main; Root diagnosed exact provider metadata and integrated normally rather than bypassing CI. New integrated-head checks are required.

```morpheus-review
{
  "version": 2,
  "base": "2ad160e9b2300228814ad717dfc4242ca320256b",
  "reviewed": "bbed92e500609099b0f498715332afcc8403807b",
  "covered": "49b72385798049b8f3cde4b240939ad9fe763592",
  "authorSession": "01a1572f-2ae1-77f2-be54-4265b3baca43",
  "reviewerSession": "/root/blocker_contract_independent_review_2221",
  "risk": "high",
  "elapsedMinutes": 5.416666666666667,
  "timing": {
    "source": "clock",
    "durationMs": 325000,
    "evidence": "Root invocation start2026-10-28T22:21:21Z through observed final return/end2026-10-28T22:26:46Z. Runner-issued reviewer /root/blocker_contract_independent_review_2221; final own clock22:26:20Z and report writing are distinct. Tools and waits included, author fix excluded."
  },
  "outcome": "complete",
  "summary": "The fresh HIGH-risk independent review cleared the source with one minor documentation finding. Root fixed BF-1 by distinguishing failed-attempt repair-diagnostic from the existing exact-identity active-attempt failure evidence route. No substantive source findings or conditions remain; runtime binding and delivery remain separate.",
  "findings": [
    {
      "id": "BF-1",
      "severity": "minor",
      "description": "The new unconditional repair-diagnostic rejection recipe refuses an active current attempt, preventing that evidence from reaching the owner. The route is failed-only; valid candidates can exist on active attempts.",
      "paths": [
        "docs/cd-v2-controller.md"
      ],
      "disposition": "fixed",
      "response": "At49b72385798049b8f3cde4b240939ad9fe763592 clarified repair-diagnostic for current FAILED attempts and existing record --kind failure with exact already-bound identity for current active attempts. Both preserve the same repair owner and prohibit state/lease/history/clock manipulation. Reviewer independently passed57 diagnostic tests, including active-attempt refusal, plus200 proof/native/guide tests; no new API or source change was needed."
    }
  ],
  "trunkIntegrations": [
    {
      "commit": "cd08833e45d137d6d9bb930bef11afea0c682a7a",
      "reason": "Normally integrate protectedmain3fd8e28e after review. Conflict only at appended decisions; retained the exact shared base and both complete appended decisions. Other incoming context-read enforcement files mechanically merged. Integrated typecheck/compile/diff passed. Initial CI wait97885 exit2/no-checks is retained; actualPRmetadata showed a real merge conflict and exact Actions inventory had0runs, so no green result was invented."
    }
  ]
}
```
