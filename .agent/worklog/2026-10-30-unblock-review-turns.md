---
roadmap: MO-26-10-30-14.56.24
tags: [engineering, devops, review]
---

# Five automatic review turns; any fresh reviewer may continue — 2026-10-30

## Why

Evo's CD staging channel had been stuck since 2026-10-26. Its test-only repair PR (evo#665) had an
initial review return `incomplete`. Under the three-turn contract the next turn needed
`humanAuthorization` and the same reviewer session. Robbie authorized it on 2026-10-29, but the
original reviewer session could not be recovered, so the PR could never validate. Chris (owner),
2026-10-30: reviews must never block on approval, any fresh session may continue, and the
automatic limit is five turns for every Morpheus project, with substantive-only blocking.

## What changed

- `src/review/local.ts`: `MAX_REVIEW_TURNS = 5` counts the initial review and incomplete turns;
  each ordinary turn after the fifth needs `humanAuthorization` (finalization stays outside the
  count). No authorization is needed after an incomplete turn, after finalization within the cap,
  or to rescue an under-floor initial review. The same-reviewer rule is gone. A follow-up whose
  session differs from the turn before is a fresh reviewer: it records `handoff { reason,
  findings }` naming exactly the findings recorded before it (per-finding optional `turn`, default
  1), and a handed-over `blocked` turn names its substantive findings in `blockedOn`. Every reviewer
  session in the record must differ from the author and must not appear in another worklog. A fresh
  reviewer's ordinary turn gets the initial ceiling. Budgets bind turns that render a verdict; an
  incomplete turn may record the overrun that made it incomplete (the timed-out reviewer case that
  PR414 wanted a human override for). The legacy `verification` fourth turn stays validated at its
  old index.
- Merged #565 (same-reviewer continuation within three turns) and kept its positive-duration rule;
  `decisions.md` marks the broader parts superseded.
- Reviewer contract (`src/review/local-prompt.ts`), legacy persona (`.github/agent-review-prompt.md`),
  runbook, architecture, AGENTS.md and the scaffold template now say: five turns without approval,
  any fresh reviewer with the earlier findings, block only on substantive problems, notes never block
  and may be declined in one line.
- `doctor` gains a "five review turns" instruction anchor, so consumer AGENTS.md files still stating
  the three-turn cap are reported.

## Dead ends and choices

- Considered requiring only "every handoff id exists in the record". That does not catch a finding
  silently omitted from the handoff, so the handoff must equal the set of earlier findings, which
  needs per-finding `turn` attribution. Records without fresh reviewers never need either field.
- Considered letting a blocked turn followed by a fresh reviewer be backed by any earlier
  substantive finding. That lets the author drop the finding the replaced reviewer actually blocked
  on; `blockedOn` names it, and it must stay in the record and in the handoff.
- First pass kept "every turn must meet its budget". That would leave a timed-out reviewer's record
  invalid forever, which is the stall this item exists to remove, so verdict turns keep their
  ceilings and incomplete turns record their real duration.
- The AGENTS.md (20 KB) and scaffold (16 KB) budgets were exceeded at first; the review paragraphs
  were tightened instead of raising the budgets.

## Independent review

Fresh high-risk review cleared the five-turn policy with one documentation finding cleared on condition and minor notes. The author named every blocked turn before a fresh reviewer (REV-1), stated the guard's limits (REV-2), corrected the ceiling sentence (REV-3), fixed a stale skill citation (REV-4), declined one design note (REV-5) and filed MO-26-10-30-16.30.49 for a pre-existing gap (REV-6). The same reviewer cleared those fixes and the hand-resolved merge of trunk #566 in a second turn; its one wording note (REV-7) was declined.

```morpheus-review
{
  "version": 2,
  "base": "c31b8830179592548fdaa94b9fad2e118baa6f8c",
  "reviewed": "a6884edb55ed4d29dc48e0e612ba5e254a150804",
  "covered": "c5bb3200874af9a0e0587ae806089787485b4ad4",
  "authorSession": "claude-code/2e8c6704-50d3-4322-a8a0-085bfea03671",
  "reviewerSession": "claude-code-subagent/a0ee8e925ca10579b",
  "risk": "high",
  "elapsedMinutes": 10.661483333333333,
  "timing": {
    "source": "runner",
    "durationMs": 639689,
    "evidence": "Claude Code Agent tool result for reviewer subagent a0ee8e925ca10579b, first invocation started 2026-10-30T23:13:03Z: duration_ms=639689."
  },
  "outcome": "complete",
  "summary": "Fresh high-risk review cleared the five-turn policy with one documentation finding cleared on condition and minor notes. The author named every blocked turn before a fresh reviewer (REV-1), stated the guard's limits (REV-2), corrected the ceiling sentence (REV-3), fixed a stale skill citation (REV-4), declined one design note (REV-5) and filed MO-26-10-30-16.30.49 for a pre-existing gap (REV-6). The same reviewer cleared those fixes and the hand-resolved merge of trunk #566 in a second turn; its one wording note (REV-7) was declined.",
  "findings": [
    {
      "id": "REV-1",
      "severity": "minor",
      "description": "blockedOn was required only when the blocked turn immediately preceded the fresh reviewer, so a resumed incomplete turn in between let the blocked turn's findings go unnamed.",
      "paths": [
        "src/review/local.ts",
        "tests/local-review.test.ts",
        "dist/review/local.js",
        "dist/review/local.js.map",
        "docs/runbooks/independent-review.md"
      ],
      "disposition": "fixed",
      "response": "checkHandoffs now requires blockedOn on every earlier blocked follow-up at a fresh reviewer's turn, with a regression for blocked, incomplete, fresh; the runbook names the initial review's turn-1 substantive findings as its blocking findings. The reviewer verified it in turn 2."
    },
    {
      "id": "REV-2",
      "severity": "minor",
      "description": "The per-finding turn is bounded only from above, so relabelling a finding's turn passes the handoff check.",
      "paths": [
        "docs/runbooks/independent-review.md"
      ],
      "disposition": "fixed",
      "response": "The runbook states the guard is relative to the recorded turn, that relabelling is the same fabrication as omission, and that blockedOn anchors a blocked verdict. Accepted in turn 2."
    },
    {
      "id": "REV-3",
      "severity": "substantive",
      "description": "The runbook still said each follow-up is checked against the follow-up ceiling, contradicting the fresh-reviewer initial ceiling and the incomplete-overrun rule.",
      "paths": [
        "docs/runbooks/independent-review.md"
      ],
      "disposition": "fixed",
      "response": "Rewrote the Record and publish sentence: same-reviewer follow-up uses the follow-up ceiling, a fresh reviewer's ordinary turn the initial ceiling, and an incomplete turn may record its overrun.",
      "condition": {
        "paths": [
          "docs/runbooks/independent-review.md",
          "src/review/local-prompt.ts",
          "dist/review/local-prompt.js",
          "dist/review/local-prompt.js.map"
        ],
        "evidence": "pnpm exec vitest run tests/agent-instructions.test.ts, plus pnpm compile if the prompt changed."
      },
      "conditionMet": "Only the runbook changed; pnpm exec vitest run tests/agent-instructions.test.ts passed 16/16 at ace51ef7, and the reviewer confirmed the condition met in turn 2."
    },
    {
      "id": "REV-4",
      "severity": "minor",
      "description": "The agentic-cto provenance note cited the old same-reviewer authorization lines of the runbook.",
      "paths": [
        "src/cto/skill.ts",
        ".claude/skills/agentic-cto/references/provenance.md",
        ".agents/skills/agentic-cto/references/provenance.md",
        "dist/cto/skill.js"
      ],
      "disposition": "fixed",
      "response": "Both provenance copies cite the Beyond five turns section; skill.ts and dist regenerated with scripts/sync-agentic-cto-skill.mjs; the agentic-cto skill tests pass."
    },
    {
      "id": "REV-5",
      "severity": "minor",
      "description": "Freshness is judged only against the previous turn, so A, B, A treats the returning A as fresh with the initial ceiling.",
      "paths": [
        "src/review/local.ts"
      ],
      "disposition": "disputed",
      "response": "Deliberate and consistent with the handoff rule: a reviewer returning after another session takes over again, and it is harmless."
    },
    {
      "id": "REV-6",
      "severity": "incidental",
      "description": "A substantive finding recorded as raised on the final clearing turn passes although no later turn checked its fix; pre-existing.",
      "paths": [
        "src/review/local.ts"
      ],
      "disposition": "deferred",
      "response": "Filed MO-26-10-30-16.30.49 with the boundary check and its regression test as the approach.",
      "roadmap": "MO-26-10-30-16.30.49"
    },
    {
      "id": "REV-7",
      "turn": 2,
      "severity": "minor",
      "description": "Two substantive-only lists say gate, approval step or mechanism where #566 says gate, approval step, state, option or mechanism.",
      "paths": [
        "src/review/local-prompt.ts",
        ".github/agent-review-prompt.md"
      ],
      "disposition": "disputed",
      "response": "Wording only: #566's full sentence sits beside each list, so no reviewer misreads it; not worth a code change after coverage."
    }
  ],
  "trunkIntegrations": [
    {
      "commit": "8682e1b3aa45e208462cd6a709bb6ec2edeca4af",
      "reason": "Merged trunk #566: kept both doctor anchors and folded its unneeded-gate category into the substantive-only lists; reviewed in follow-up turn 2."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "claude-code-subagent/a0ee8e925ca10579b",
      "commit": "c5bb3200874af9a0e0587ae806089787485b4ad4",
      "base": "130884ce3e687d7727e495a0931e0072b95443d9",
      "scopeReason": "Late correction after the initial clearance: the REV-1-REV-4 fixes and the hand-resolved trunk integration of #566.",
      "outcome": "cleared",
      "elapsedMinutes": 1.4644833333333334,
      "timing": {
        "source": "runner",
        "durationMs": 87869,
        "evidence": "Claude Code task notification for resumed reviewer subagent a0ee8e925ca10579b, turn sent 2026-10-30T23:31:04.331Z: duration_ms=87869."
      },
      "summary": "Cleared REV-1-REV-4 fixes, REV-3's condition, REV-5's decline, REV-6's ticket and the #566 merge resolution; one wording note, REV-7."
    }
  ]
}
```
