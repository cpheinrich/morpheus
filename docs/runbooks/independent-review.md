# Independent review before merge

**The authoring agent owns the entire review loop.** After committing implementation/tests,
run `morpheus review prepare --base origin/main`; this prints a review packet and does not
launch a reviewer. The packet carries the contract, the repository path, the test commands derived
from the project's manifests, the review range, and the ticket. An unclaimed change or one without
declared acceptance is described as such and reviewed against the PR title and body; do not create
an item to fill the line. The authoring agent must spawn one fresh reviewer subagent/session with
repository access and that packet, without inheriting the author's conversation history.
The reviewer returns findings to the author; the author manages fixes, any allowed follow-up,
the review record, CI, and merge. Do not wait for a PR monitor, another standing agent, or
GitHub Actions to start this review. CI checks the evidence; it does not perform the review.
If the runner cannot start an independent session, report that concrete limitation and keep
the PR open with auto-merge disabled; never substitute self-review or assume a monitor will act.

The author is the agent/session implementing the PR, including OpenClaw, Codex, or Claude.
Use its runner's fresh-session/subagent facility with history inheritance disabled. Supply the
prepared packet and repository location, and retain the reviewer session ID for the allowed
follow-up turns. A reviewer is a bounded task started by the author, not a standing PR-monitoring agent.

The canonical contract ships in `src/review/local-prompt.ts`; the old `review prompt` command and
`.github/agent-review-prompt.md` remain for explicitly enabled legacy GitHub reviewers.

## Policy

`review.required` in `morpheus.json` defaults to true, including existing manifests. False is a
visible project opt-out. Records/board-only changes, exact dependency-only Dependabot PRs, and
marked dependency-only PRs from the exact `morpheus-security[bot]` App keep narrow exemptions.
The security-App exemption waives human authoring and independent review only; branch-protection
checks remain mandatory. This gate covers all other authors, not just particular model names.
The legacy `review-waived:` line does not waive independent review; `check pr` reports it as
waiving legacy delivery only and says so in the same line.

Review scope follows consequences, not changed lines. Bugs caused, exposed or worsened by the PR,
and problems preventing acceptance criteria, are in scope. Other pre-existing bugs are incidental
follow-ups. Flag independently discovered critical risks for human judgment; do not silently widen
the PR. Blocking findings need a concrete failure scenario and a causal connection to this change.

| Risk | Initial ceiling | Follow-up ceiling |
|---|---:|---:|
| Small, low consequence | 10 minutes | 5 minutes |
| Normal behavior change | 15 minutes | 7.5 minutes |
| High: authorization, billing, destructive operations, shared controls | 30 minutes | 15 minutes |

These are ceilings, not targets. One initial extension of at most 50% is allowed with a recorded
reason. Small was 5 minutes until the first two weeks showed that every small review needing
execution rather than reading overran it, and two worklogs chose between two elapsed figures by
which side of the ceiling each landed on; a ceiling that only produces accounting is not a ceiling.
There is also a floor: an initial review under one minute at normal or high risk is refused. The
PR that adopted this policy on one project was "reviewed" in 42 seconds. Small risk has no floor. The author must enforce deadlines and, where available, runner token/cost ceilings. Morpheus
validates reported durations; it cannot interrupt a provider's session or measure its billing.
No reviewer subagents, full-suite reruns by default, or automatic repeated sessions. On timeout,
budget exhaustion or missing evidence, record incomplete and keep the PR open.

The author responds to every finding. For minor-only findings, one fix/response round is enough.
For any substantive finding, resume the original reviewer to assess responses, fixes and their
regressions, unless the reviewer cleared it conditionally (below). Preserve original severity.
Reviewer retractions may clear a disputed finding, but author disagreement alone cannot.

**A deferral is a ticket, not a sentence.** A finding left `deferred` or `open` names the roadmap
item that tracks it in `roadmap`, and `check pr` requires that item to exist on the branch. File
it with `pm new` before recording the deferral. In the first two weeks a cron with no year field
was deferred on one day and still firing a week later, an "operator's Owner login stays active"
finding was deferred to an inbox note, and one gap was deferred three separate times; none had
anywhere to be picked up from. This applies to incidental findings too, because those are the
ones that rot.

**Conditional clearance.** A reviewer may pre-clear a finding instead of blocking on it: "fix
TE-7 within these paths, run this evidence, and it is clear." The reviewer, never the author,
sets the finding's `condition` with exact `paths` and the `evidence` to run. The author fixes it
within those paths, records `conditionMet` with what was run and its result, and marks it
`fixed`. A substantive finding cleared this way needs no follow-up turn, and a final follow-up
may clear on condition with `covered` moving to the fix commit. `check pr` verifies that every
commit between the reviewer's commit and `covered` touches only condition paths and the worklog;
minor fixes belong before the reviewer's final turn, and join the allowed set only when there is
no follow-up at all. A condition on a source file in a repository that commits generated output
must name the generated counterparts too, or the regenerated files fall outside it. A condition cannot be added, widened or disputed into clearance by the author;
an unconditional substantive finding still needs its turn. This is Alex's proposal from #241: a
two-line fix should not need a human or a fresh session re-deriving the whole context.

**A review is capped at three turns**: the initial review and at most two same-reviewer
follow-ups, each at the follow-up ceiling. A follow-up is spent one of two ways. It resolves what
the previous turn left `blocked` (or the substantive findings of the initial review), after the
author has addressed those concrete concerns. Or it is a **late correction after a clearance**:
when full CI, or a test the reviewer did not run, shows a fix is needed after the initial review
or a follow-up already cleared the code, the author commits the fix and spends a remaining turn
on the same reviewer, naming the scope decision in that turn's `scopeReason` ("late CI
correction: two legacy UI tests assumed the old layout"). A clean initial review therefore has two
such slots and a review that already used a fix follow-up has one; the author makes that scope
decision within the task's budget, and the record shows it. Otherwise a `cleared` turn ends the
review, and an `incomplete` one exhausted its budget and escalates; nothing follows it. The cap is
what stops an author and a reviewer trading fixes and findings indefinitely, at a session's cost
per turn. Unresolved substantive concerns after the last turn, or a correction needed once the
turns are spent, mean blocked: remove `agent-reviewed`, disable auto-merge, and flag the remaining
work for the human. No automatic fourth turn or replacement reviewer to obtain approval.

An explicit human decision may authorize one additional same-reviewer turn. Add
`humanAuthorization: { approvedBy, approvedAt, reason }` to that extra `followUps` entry,
using an ISO timestamp and a reason identifying the human's decision and scope. Every
turn beyond the default cap needs its own authorization; preserve all earlier turns.
This attestation is human-auditable, not cryptographic proof. Never infer approval from
a merge request or manufacture it. Clearance, coverage, budget and CI checks still apply.
The parser accepts at most 20 recorded follow-ups as an input-size bound, not authorization.


## Record and publish

Keep one `morpheus-review` JSON fence
in the task's `.agent/worklog/YYYY-MM-DD-task.md`, using the template emitted by `review prepare`.
Repeat its `summary` as a normal paragraph. Record even a clean review. The paragraph should state
what was found, what the author did, any disagreement, the second-pass outcome, and limitations.
The JSON retains finding details so the short paragraph does not erase the audit history.

Each finding has `id` (at least three characters), `severity` (`minor`, `substantive`, `incidental`),
`description`, repository-relative `paths`, `disposition` (`fixed`, `disputed`, `deferred`, `open`)
and a substantive `response`. A `deferred` or `open` finding also carries `roadmap`, the id of the
item tracking it. A reviewer-set `condition` (`paths`, `evidence`) with the author's `conditionMet`
records a conditional clearance. `reviewerSession` is the id the runner issued for the reviewer
session: the subagent id a tool result reports, or a thread id, optionally behind a provider
prefix such as `claude-code-subagent/`. It is never a label the author composes, and `check pr`
refuses an id that already appears in another worklog on the branch, because a reviewer session
reviews one task.
Codex collaboration runners may instead issue a canonical task path such as
`/root/health_sync_review` or `/root/author/reviewer`. Record that exact returned path,
and put the globally scoped runner-issued parent thread/session ID in `authorSession`.
The pair identifies the reviewer: another root session may issue the same task path,
but the same path within the same parent session cannot review another task. Follow-ups
retain the exact path and inherit the record's parent provenance. A task name supplied
to a spawn request is not evidence; use the canonical path the runner actually returns.
These fields attest provenance; their syntax cannot prove a session was launched.
For follow-up turns, add `followUps`, an array of at most two entries in order, each with the
same `reviewerSession`, `commit`, `outcome` (`cleared`, `incomplete`, `blocked`), `elapsedMinutes`,
and `summary`. Every entry but the last must be `blocked`, or `cleared` when the entry after it
carries a `scopeReason` for the late correction it covers; the last must be `cleared`. A
follow-up that comes directly after an initial review with no substantive findings is that same
shape and needs a `scopeReason` too. An `incomplete` entry cannot be followed. A single
`followUp` object, the shape from the two-turn contract, still validates as one turn. Each turn's
`commit` must descend from the previous one. `elapsedMinutes` at the top level measures the
initial review only; each follow-up's is checked against the follow-up ceiling on its own.

`base` is the merge base; `reviewed` is the initial code commit; `covered` is the final commit
covered by reviewer clearance or the author's minor fixes. All are full 40-character SHAs and
must form an ancestor chain. The final follow-up must cover `covered`. Without a follow-up, changed
paths between `reviewed` and `covered` must belong to fixed minor findings (plus this worklog).
This is path-level verification: the reviewer/author remain responsible for ensuring those edits
are actually the stated fixes. Unrelated changes invalidate coverage and require an explicit scope
and budget decision, not an automatic restart.

After `covered`, only this worklog may change, except for trunk merges as described below and a
late correction that spends a remaining turn: commit the fix, have the same reviewer clear it as
the next `followUps` entry with its `scopeReason`, and move `covered` to that commit. The commits
between the previous clearance and that turn are covered by the reviewer's clearance of it, the
same way the `reviewed`..`covered` range is covered by any follow-up; a hand-resolved trunk merge
already named in `trunkIntegrations` there stays named and valid. This avoids the hash loop
from committing the review record itself. Other edits make the record stale.
Reconcile the base before review. If trunk advances during the review, preserve the initial
`base`/`reviewed`; a follow-up that inspected the integration records that turn's `base` as the
new merge base and its `scopeReason`. The original base must precede the new base, which must
precede that turn's commit; a later turn may move the base again only forward. No turn is needed
merely to merge trunk (below); spend one only when a reviewer should actually look at the
combination. Do not invent substantive initial findings.

### Merging trunk never invalidates a cleared review

As on a human team, integrating `main` after review does not send the change back for another
look, and it spends no turn. Chris's call (2026-09-18): the review gate is a large step up from no
review at all, CI still has to pass on the integrated result, and a gate that goes stale every
time trunk moves punishes exactly the PR that is waiting patiently for CI. If it leaks, tighten it
then. `check pr` walks the first-parent commits after `covered` (and between `reviewed` and
`covered` when no follow-up cleared that range) and accepts each of these:

- **A merge Git reproduces exactly.** The commit has two parents, the second is on trunk, and
  `git merge-tree --write-tree` of the parents yields the commit's tree. Nothing was edited by
  hand, so nothing needs recording.
- **A hand-resolved merge that the record names.** A conflict resolution, or any edit folded into
  a merge commit, is authoring nobody reviewed. It is still accepted, but only when
  `trunkIntegrations` carries `{ "commit": "<full merge SHA>", "reason": "..." }` for it, so the
  unreviewed resolution is visible in the audit trail rather than hidden inside a merge.
- **A commit touching only this worklog.**

Everything else invalidates coverage: a plain commit that changes code, a merge whose second
parent is not trunk history, an octopus merge, or a `trunkIntegrations` entry naming a commit that
is not such a merge. The recorded base must be trunk history behind the PR's merge base; trunk
moving on past it is expected, not stale. **Merge, do not rebase, after review**: a rebase rewrites
the reviewed commits, and the record's SHAs then name commits that are no longer on the branch.

Records written under the 2026-09-16 documentation-only rule may still carry
`documentationIntegrations`; the field is parsed and no longer enforced, because the merge proof
above covers those merges too.

Unresolved substantive findings, incomplete reviews and code commits after coverage remain
blocked; exhausting the three turns never means automatic merge regardless of findings.

Put a visible line in the PR body (not inside a comment or code fence):

    review-record: .agent/worklog/YYYY-MM-DD-task.md

Also link the worklog and summarize the outcome. Once complete, apply `agent-reviewed` (create the
repository label if absent), commit the worklog and push. Run local conventions with the actual PR
body and `MORPHEUS_PR_LABELS=agent-reviewed`. Never enable auto-merge until review and CI are complete.
This is an auditable attestation, not a security boundary against an author fabricating evidence.

## Existing projects

The shared `pr-check.yml` enforces the gate automatically when using updated Morpheus. Each existing
caller must grant `contents: read` and `pull-requests: read` on its `pr` job and needs a separate metadata-only workflow for `edited`, `labeled`, and `unlabeled` events,
calling `pr-check.yml` under the same `pr` job name. The scaffold writes
`.github/workflows/review-metadata.yml`; re-running `morpheus init` adds it without overwriting
existing files. Do not add skipped build/test jobs there: skipped statuses can satisfy required
checks and must not replace a still-running build. The ordinary CI retains its normal triggers.
Until a caller is updated, rerun its conventions workflow after changing the body/label: the shared
check fetches live PR metadata, so reruns do not keep validating the original event snapshot.
Pushes still trigger verification normally. Keep legacy required delivery jobs wired in and skipped;
the paid `agent-review.yml` now defaults off and remains explicitly opt-in.

`morpheus init` preserves existing authored files. It can add a missing metadata workflow, but
it does not update existing CI grants or rewrite existing `AGENTS.md` review instructions.
Update those explicitly in each project's reviewed rollout; new projects receive the current
instructions from the scaffold.
