---
owner: cpheinrich
date: 2026-09-16
agents:
  - claude
previous: .agent/inbox-archive/2026-09-16-0425-cpheinrich.md
---
# Inbox — 2026-09-16

A sweep of every open PR and issue. Merged: [#246](https://github.com/cpheinrich/morpheus/pull/246)
(per-job iOS output directories; closes #240, which had recurred ten times while the fix sat
unmerged), [#179](https://github.com/cpheinrich/morpheus/pull/179) (motion-design skill) and
[#209](https://github.com/cpheinrich/morpheus/pull/209) (launch-company skill), the last two after
resolving two-week-old conflicts and running the independent review they predated. The launch
skill's step 7 had endorsed a local `.git`-stripped production deploy as "the durable agent
workflow"; the reviewer caught it and it now routes production through `vercel-deploy.yml`.
[#195](https://github.com/cpheinrich/morpheus/pull/195) was re-staked with `pm claim` as
[#254](https://github.com/cpheinrich/morpheus/pull/254) because its branch was hand-named; review
found its scaffolded upload job called a script `init` never writes, so every scaffolded project
would have failed on first dispatch — rewritten around the `ios-testflight-upload` action.
[#253](https://github.com/cpheinrich/morpheus/pull/253) (preserve cleared reviews across reviewed
doc merges; closes #252) was reviewed with two minor fixes and merged.
[#255](https://github.com/cpheinrich/morpheus/pull/255), merged, fixes the two ergonomics halves
of Alex's issues #248 and #241: `check pr` now says `review-waived` waives legacy delivery only,
and the review packet carries the repository path and derived test commands. You approved
[#250](https://github.com/cpheinrich/morpheus/pull/250) mid-sweep; a fresh high-risk review from
our side tested the nested-code signing case my earlier triage had flagged and found it works, so
that concern is withdrawn; two minor fixes were applied and it merges after its follow-up. Roadmap items are filed for
#249 (simulator shutdown under a concurrent lane) and #251 (keychain state across signing runners),
both P1, unclaimed. Everything below needs you.

## ❗ 1. Post-clearance trunk advances and late CI findings: pick the rule · `claude`

Three PRs stalled on the same gap in the two-pass contract, and Alex hit it on Lakina too. #236
(weekly OSV scans) had both passes cleared when #234 landed on main; the original reviewer
declined a third pass. #238 (shared Firebase release action) had both passes cleared, then the
author found and fixed a real credential-isolation bug afterwards. Evo #242 and #244 hit the same
two shapes ([#245](https://github.com/cpheinrich/morpheus/issues/245),
[#247](https://github.com/cpheinrich/morpheus/issues/247)). Today's sweep needed a serial merge
order for the same reason: strict protection plus one follow-up means every merge invalidates
every other cleared PR. #253 covers only the documentation-merge case.

- **A — one bounded integration-only pass after clearance (recommended).** Permit at most one
  additional original-reviewer pass per PR after all substantive findings have cleared, capped at
  half the initial budget, recording old and new base, the integrated commit, affected paths,
  reason, reviewer and result. Another trunk advance does not reset it. Late CI findings that are
  fixes in already-covered paths use the same slot; anything else stays an explicit decision.
  This is the triage proposal already on #245 and unblocks #236 and #238 as written.
- **B — let the author make the scope decision and record it.** Read "explicit scope and budget
  decision" as the author's call within the task's budget, serialised as a second `followUp`
  entry, with no cap. Cheapest, but it is the grinding loop the fixed round count exists to stop.
- **C — keep two passes; require a human for anything after clearance.** Status quo, stated
  plainly. #236 and #238 then wait on you each time, and any two concurrent PRs can only merge
  serially with a human in the loop.
- **Other —** a different frame, for example dropping strict up-to-date protection so a cleared PR
  merges without integration.

~

## ❗ 2. Conditional clearance: may a reviewer return "cleared if X"? · `claude`

From Alex ([#241](https://github.com/cpheinrich/morpheus/issues/241)): a Lakina reviewer
returned `blocked` on one finding and wrote "fix TE-7 and this is clear" — a two-line fix — and the
contract left no move short of a human or a fresh reviewer re-deriving 100k tokens of context.

- **A — allow `cleared-if` with mechanical conditions only (recommended).** The reviewer names
  exact conditions, affected paths and the deterministic regression evidence; the author records
  compliance verbatim and may not add, widen or dispute its way to clearance. `check pr` verifies
  the record carries both halves. The reviewer, not the author, decides a finding is small enough
  to pre-clear. This is the triage proposal on #241.
- **B — allow it as prose.** Reviewer writes the condition, author says it is met, no validator
  support. Faster to ship, weaker to audit.
- **C — decline.** Keep the fixed stopping rule; a blocked review with a trivial fix goes to a
  human as today.
- **Other —**

~

## ❗ 3. A human override for an incomplete local review · `claude`

The second half of Alex's [#248](https://github.com/cpheinrich/morpheus/issues/248): Lakina #323
cleared on substance twice but honestly recorded `incomplete` because the follow-up ran 18 minutes
against a 15-minute allowance. You approved merging; nobody there has repo admin; the PR cannot
merge. Escalation has an outcome with nowhere to go.

- **A — `review-override: <reason>` accepted only from a listed human principal (recommended).**
  Honoured when the PR body line is present *and* the label or approving review comes from a
  GitHub handle in `hq/team/members.md`. Recorded beside the `incomplete` record, never replacing
  it, and printed as `~ waived` with the reason. The record stays honest; the merge becomes
  possible without admin.
- **B — raise the budget instead.** Treat the elapsed-minutes ceiling as advisory (warn, do not
  fail) when the outcome is otherwise clean. Solves this instance, not the general one.
- **C — no override; use admin bypass.** Give Alex admin on Lakina and keep the contract strict.
- **Other —**

~

## ✅ 4. #250 from robbie-del: merged on your approval · `claude`

You approved it on GitHub mid-sweep. Workflow runs were approved (build and tests green), a fresh
high-risk review from our side found four minor findings and nothing substantive — and, by
actually ad-hoc signing an app with unsigned nested frameworks, showed the nested-code refusal my
read-only triage predicted does not happen (`codesign` refuses unsigned subcomponents on verify,
not on sign). Temp-file cleanup and the credential-free build-settings query were fixed; resolving
`$(AppIdentifierPrefix)`-style variables from the profile is a follow-on item. Acceptance is still
a real nightly run plus a device install showing the HealthKit prompt; the item stays open until
that evidence exists.

## ❗ 5. Two stale claims · `claude`

`MO-055` (a new contributor gets an inbox in one command) has held its branch for 45 days with no
PR. `MO-26-09-16-00.36.07` (safely clean completed task) was claimed today by another session with
no PR yet; I left it alone. MO-055 reads as abandoned.

- **A — release MO-055 (recommended).** Delete its remote branch so `pm claim` can stake it
  again; the partial work stays in reflog and the worklog.
- **B — keep it.** You or a session intend to resume it.
- **Other —**

~
