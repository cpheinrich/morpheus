# The mandate

Read this when starting a delegated outcome, when the person changes its scope or budget, and
before any spend.

The mandate is the working agreement for one engagement. Write it into the durable record the
project already uses for the work — the roadmap item body, the task worklog, or a campaign
checkpoint — not only into a conversation, so a resumed or successor session acts on the same
terms. Quote or link the person's actual words for anything that grants authority or money.

## Fields

| Field | Record | When the person did not say |
|---|---|---|
| Outcome | The result in their words, and why it matters | Restate it; confirm with a non-blocking question |
| Acceptance | The person's success criteria as observable checks, and the evidence each needs — a third party's own record where success depends on one | Propose criteria scaled to the risk; proceed on reversible work meanwhile |
| Out of scope | What is excluded, and what the person chose to pursue without making it a success condition | Nothing excluded beyond the skill's gates |
| Authority | Repositories, branches, merges, deployments, provider settings, credentials and data you may change; guardrails explicitly waived | The project's ordinary rules only; no waivers |
| Approvers | Who may approve each kind of action — some projects require more than one principal for money | Whoever the project's records name for that kind of action, else the person who delegated; a grant counts only from someone who can make it |
| Budget | One line per currency or quota — see [Budget](#budget) | The project's recorded standing spend policy, if it has one; otherwise no new spend |
| Approval thresholds | What needs approval first: amounts, new vendors, kinds of action; which grants are standing and which one-shot | Every spend and every gate not already covered by a recorded standing grant |
| Liabilities carried in | Earlier spend, uncertain charges, open reservations and the agreed treatment of unknown usage | Unknown; count them at their maximum under the default reservation policy |
| Delegation | Which agents, models and providers may run work, and limits for each | Your own session and its ordinary subagents |
| Reporting | Channel, cadence, and what counts as meaningful | Milestones, decisions needed, blockers, completion |
| Stop | When the engagement ends or pauses, and any expiry on its grants | At acceptance, at budget exhaustion, or when told |

Authority and budget are never inferred. A large outcome, an urgent tone, an earlier engagement's
cap, or credentials that happen to work do not grant spending or access. "Use plenty of budget" is
a direction about how freely to use what was granted, not a grant of an unnamed amount: if no
amount was given for a currency, ask for one while doing the unpaid work.

A successor session inherits the mandate it finds recorded, for the same engagement only. A new
engagement starts a new mandate, even when the work looks similar.

## Blocker record

Before declaring a hard blocker or asking the person to unblock the work, document in the
existing task record:

- **What failed:** the exact symptom, evidence and observation time; separate facts from an
  untested explanation.
- **Why it prevents progress:** the specific missing capability, external limit or human-only
  decision. Trace a claimed rule to its source and check whether newer authority supersedes it.
- **What was tried:** reasonable authorized diagnoses, repairs or alternative routes and the
  actual outcome of each. Repeating an unchanged failed command is not a different approach.
- **What remains:** the other reasonable options and why each is unavailable, unsafe, outside
  authority or disproportionate to the task. If an option can proceed, take it instead of
  declaring the blocker hard.
- **What would unblock it:** the smallest necessary external action, the independent work that
  continues, and the evidence or event that should resume this path.

Only call it hard when reasonable options within the mandate have been exhausted. This does not
require every imaginable experiment or trying to bypass credentials, review or uncertain-effect
safety. A generic error, missing diagnosis or stale internal allowance is work to investigate,
not proof that the person must intervene. Revisit the record when evidence or authority changes.

## Budget

Keep one ledger per currency or quota — a provider's dollars, a subscription allowance, prepaid
credits, metered CI minutes. Each line records its cap, what it may buy, the reserve to keep and
its approval threshold.

Use the person's explicit spending policy for this engagement. If they choose spend-as-needed
without internal holds, record their words, scope and cap; track actual charges and pending or
unknown usage separately, without reserving every estimate at its maximum. Do not fabricate
settlements or erase prior expense records. Notify when the remaining budget cannot support
the next work; a willingness to add funds later is not an increase already granted. This changes
the engagement's accounting policy, not another principal's approval, the payment routes
authorized, or the project's review and credential controls.

The following reservation rules are the default when the mandate does not choose another policy.

**Headroom = cap − settled spend − open reservations − unsettled outcomes at their maximum −
liabilities carried in.** Missing telemetry or an unreadable bill is not headroom: until you can
measure, act as if none remains.

- **Reserve before spending.** Record the request, its identity and its maximum cost including
  retries, before the call. A maximum above the line's approval threshold needs that approval
  recorded first; one found afterwards without it is reported, not quietly absorbed. Concurrent
  executors share one ledger.
- **Settle from the provider's record**, not an estimate: release the unused part of a
  reservation, charge the actual amount.
- **An outcome you cannot confirm keeps its maximum liability** — a timed-out call, a crashed
  worker, a provider that did not answer. Settle it from evidence; never by assuming zero.
- **Stop admitting new paid work before the cap**, leaving room for what is in flight and the
  reserve. For a subscription quota, read actual usage; never estimate it from token counts.
- **Exhaustion is a pause.** Record what is paused and what will resume it. Never route around a
  cap through a payment path the mandate did not name — an API key, prepaid credits, "extra
  usage", a personal card, another vendor.
- **Report** actual spend, open reservations, unknowns and remaining headroom per line at each
  milestone and at the end.

## Example

An illustrative reliability engagement. Its values are placeholders for the shape, not defaults:
a mandate grants only what its own person wrote, and a one-off change would need far less
acceptance than this.

```markdown
## Mandate — 2026-11-03, from <person>'s request "<quoted request>"

Outcome: nightly builds reach internal testers again; the last good build is 9 days old.
Acceptance: five consecutive scheduled builds, including at least one recovered from an injected
  failure, each verified installable from the store's own build record (not the upload log).
  External review timing is pursued, not counted.
Authority: change and merge pipeline code in this repository and the shared workflows it calls;
  edit CI runner configuration; re-run release jobs. Waived: none. Not: signing environments,
  tester lists, production data.
Approvers: <person> for everything outside this authority.
Budget:
  - Inference provider X: cap USD 40 for this engagement; reserve before each call; approval
    above USD 5 per call.
  - Coding-agent subscription: keep 20% of the weekly allowance in reserve; below 40% remaining,
    hand work to the second provider's subscription. No API key, prepaid credit or extra usage.
  - Hosted CI: ordinary included minutes only.
Liabilities carried in: one provider X batch from the previous attempt, outcome unknown,
  maximum USD 6 — counted until settled.
Delegation: up to four parallel subagents, each in its own checkout.
Reporting: message on milestone, decision needed or completion; nothing when nothing changed.
Stop: at acceptance, or when any budget line reaches its reserve.
```

When the person later says "skip the waiting period for this run", add it under the mandate with
the date and their words, scope it to the named run, and leave the project's default unchanged.
