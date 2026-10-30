# Incomplete review continuation — 2026-10-30

Claim: MO-26-10-30-14.55.14. Christopher clarified that asking for human authorization merely
to let the original reviewer finish an incomplete review was unintentional. The prior rule
caused cpheinrich's SMS broker review to pause after its first turn lacked final UI captures,
even though the original reviewer and an ordinary follow-up slot were available. Christopher
authorized that specific continuation, which cleared the PR, and requested this lasting policy
change.

The validator now allows a same-reviewer continuation after an incomplete initial or follow-up
turn while the ordinary three-turn cap has room. It still requires the reviewer to clear the
covered commit, preserves `initialOutcome: incomplete`, keeps the original reviewer identity,
rejects over-budget turns and under-floor reviews, and requires human authorization for extra
turns beyond the cap and after finalization. AGENTS, the canonical reviewer prompt, runbook,
architecture and decisions now say the same thing. No dependency was added; the change is to
Morpheus's existing Zod/Git review validator.

Checks: `vitest run tests/local-review.test.ts` passed 148 tests; `vitest run tests/review.test.ts`
passed 79 tests; `pnpm typecheck` and `pnpm compile` passed. `pnpm morpheus pm index` hit a sandbox
permission error when `tsx` attempted its IPC pipe, so the compiled CLI ran `node dist/cli/index.js
pm index` successfully with no index changes. Independent review and CI follow.

The fresh independent reviewer of `587efb1` found REV-1: a zero-duration template placeholder
for an incomplete initial turn could be rescued by a later 30-second clearance, bypassing the
existing positive-duration invariant. It also found REV-2: one runbook sentence omitted
`incomplete` from permissible nonfinal follow-up outcomes. The author now rejects zero elapsed
duration for every turn of a resumed incomplete initial review, with regression cases for the
initial turn and an intermediate incomplete turn. The runbook sentence includes `incomplete`.
Focused review tests now pass 150/150, and typecheck and compile pass again. The original
reviewer will inspect this correction in an ordinary follow-up.

The original reviewer found REV-1 only partially fixed at `38801f2`: an intermediate incomplete
follow-up could still have zero measured duration when the initial turn was complete. The
positive-duration guard now applies to every version 2 turn before any rescue or continuation
logic. A new regression uses a complete initial review, a zero-duration incomplete follow-up,
and a later clearance without human authorization; validation rejects the placeholder. The
focused review suite passes 151/151. The same reviewer will inspect this final correction in
the remaining ordinary turn.

## Independent review clearance

The same reviewer cleared `56728da` in the third and final ordinary turn. It directly probed
zero-duration initial and intermediate incomplete records and a positive-duration continuation;
REV-1 and REV-2 are fixed with no new findings. The initial review and both follow-ups stayed
within their normal-risk budgets. The review's measured turns came from the Codex runner's
explicit task-start and task-complete timestamps.

Fresh review found a zero-duration timing bypass and a runbook contradiction. The first correction left an intermediate incomplete-turn path open; the reviewer blocked that follow-up. A shared timing guard, focused regression and runbook correction resolved both findings, and the original reviewer cleared the final commit in the remaining ordinary turn.

```morpheus-review
{
  "version": 2,
  "base": "46d1bc24af1717942ac68c36fcd2bce0cdf0c2b8",
  "reviewed": "587efb1da99085828a60e6a17b585f0dcab6ed1e",
  "covered": "56728da80b6a1e0a3e909bfaf42eead2f7d0e17e",
  "authorSession": "codex:01a18ddd-0316-74e2-bfe5-2c037f7d198f",
  "reviewerSession": "/root/morpheus_review_policy_reviewer",
  "risk": "normal",
  "elapsedMinutes": 0.6023166666666666,
  "timing": {
    "source": "clock",
    "durationMs": 36139,
    "evidence": "Codex reviewer rollout 01a18ed6-c90a-7dc1-b74e-b964df3ad69d: task_started 2026-10-30T22:03:23.299Z and task_complete 2026-10-30T22:03:59.438Z."
  },
  "outcome": "complete",
  "summary": "Fresh review found a zero-duration timing bypass and a runbook contradiction. The first correction left an intermediate incomplete-turn path open; the reviewer blocked that follow-up. A shared timing guard, focused regression and runbook correction resolved both findings, and the original reviewer cleared the final commit in the remaining ordinary turn.",
  "findings": [
    {
      "id": "REV-1",
      "severity": "substantive",
      "description": "A zero-duration template placeholder for an incomplete review turn could be accepted when a later same-reviewer turn cleared, bypassing the positive measurement requirement.",
      "paths": ["src/review/local.ts", "tests/local-review.test.ts", "dist/review/local.js", "dist/review/local.js.map"],
      "disposition": "fixed",
      "response": "The final shared timing loop rejects durationMs zero for every version 2 turn. Regressions cover a zero initial turn and a zero intermediate incomplete follow-up before a later clearance; focused review tests pass 151/151. The original reviewer directly probed both and cleared."
    },
    {
      "id": "REV-2",
      "severity": "minor",
      "description": "The runbook's nonfinal follow-up list omitted incomplete even though it now permits continuation after that outcome.",
      "paths": ["docs/runbooks/independent-review.md"],
      "disposition": "fixed",
      "response": "The runbook now includes incomplete among permissible nonfinal follow-up outcomes; original reviewer verified."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/morpheus_review_policy_reviewer",
      "commit": "38801f24e34a4d2a407d0eec36b5105762623a15",
      "outcome": "blocked",
      "elapsedMinutes": 0.1686,
      "timing": {
        "source": "clock",
        "durationMs": 10116,
        "evidence": "Same Codex reviewer rollout: task_started 2026-10-30T22:06:25.350Z and task_complete 2026-10-30T22:06:35.466Z."
      },
      "summary": "REV-2 fixed; REV-1 remained open for a zero-duration intermediate incomplete follow-up after a complete initial turn."
    },
    {
      "reviewerSession": "/root/morpheus_review_policy_reviewer",
      "commit": "56728da80b6a1e0a3e909bfaf42eead2f7d0e17e",
      "outcome": "cleared",
      "elapsedMinutes": 0.15015,
      "timing": {
        "source": "clock",
        "durationMs": 9009,
        "evidence": "Same Codex reviewer rollout: task_started 2026-10-30T22:10:22.331Z and task_complete 2026-10-30T22:10:31.340Z."
      },
      "summary": "Shared version 2 timing guard rejects both zero-duration paths; positive-duration same-reviewer continuation passes. REV-1 and REV-2 cleared with no new findings."
    }
  ]
}
```
