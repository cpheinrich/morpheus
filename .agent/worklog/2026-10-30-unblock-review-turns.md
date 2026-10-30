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
