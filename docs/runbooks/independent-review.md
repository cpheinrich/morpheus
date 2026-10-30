# Independent review before merge

**The authoring agent owns the entire review loop.** Finish the relevant focused tests and inspect
their actual results before the initial review. Send the whole review packet, not fragments; a
missing packet caused one reviewer to find a basic issue only in a later turn. For UI work,
provide available simulator evidence at the start and replace it after fixes. The reviewer must
open each relevant image, inspect the rendered pixels and materially changed
states for visual defects, and inspect relevant recording frames when present. A link alone does
not establish a visual review. Missing, stale, or inaccessible required captures leave the review
incomplete until the author supplies final-build evidence.
If a test cannot
run, record the exact limitation and keep the PR draft until validation finishes. CI can run in
parallel, but an avoidable late test correction consumes a review turn. Aim for an initial review
and one focused response; five turns run without anyone's approval, and that is a ceiling, not a
plan. Commit implementation
and tests. When CI, visual evidence or PR metadata matters to review, move the item to `review`
and open an unlabelled draft first; the reviewer should see that evidence and the final ticket
state. Then
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
prepared packet and repository location, and retain the reviewer session ID so a follow-up can
resume it; when it cannot be resumed, a fresh reviewer takes the next turn
([below](#any-fresh-reviewer-may-take-a-turn)). A reviewer is a bounded task started by the
author, not a standing PR-monitoring agent.

The canonical contract ships in `src/review/local-prompt.ts`; the old `review prompt` command and
`.github/agent-review-prompt.md` remain for explicitly enabled legacy GitHub reviewers.

## Policy

`review.required` in `morpheus.json` defaults to true, including existing manifests. False is a
visible project opt-out. Records/board-only changes, exact dependency-only Dependabot PRs, and
marked dependency-only PRs from the exact `morpheus-security[bot]` App keep narrow exemptions.
The security-App exemption waives human authoring and independent review only; branch-protection
checks remain mandatory. This gate covers all other authors, not just particular model names.
The reusable PR conventions job and its callers do not use concurrency groups. GitHub treats a
cancelled required check as failing branch protection even if another conventions run on the same
head succeeds. Every `CI` and `Review metadata` run must finish, including bursts of metadata edits.
Superseded runs pass without checking anything, but never under the required name. A first `head`
job compares the event's head with the live PR. When the PR has provably moved since the event (its
copy is strictly newer), the required job is renamed `pr / superseded` and passes with
`::notice::superseded by <sha>; this run's result is moot`. Checks attach to the SHA the event named,
so a renamed pass cannot satisfy protection anywhere, not even if the PR is force-pushed back to that
SHA. A lagging or malformed read, a failed or cancelled `head`, or a move after `head` decided all
fail `pr / conventions` with their reason.
The legacy `review-waived:` line does not waive independent review; `check pr` reports it as
waiving legacy delivery only and says so in the same line.

Review scope follows consequences, not changed lines. Bugs caused, exposed or worsened by the PR,
and problems preventing acceptance criteria, are in scope. Other pre-existing bugs are incidental
follow-ups. Flag independently discovered critical risks for human judgment; do not silently widen
the PR. Blocking findings need a concrete failure scenario and a causal connection to this change.
Complexity the PR adds is in scope too ([`architecture.md` §2](../../architecture.md), principle
11). A simpler version with the same behaviour, in fewer parts or lines, is a minor finding. A gate,
approval step, state, option or mechanism that the requirements do not need is substantive. Its
failure scenario is the legitimate work it would stop or delay.

### Substantive findings block; notes do not

Chris, 2026-10-30: review feedback should be substantive, and a change should not be held because
of some trivial thing the reviewer flagged. A reviewer returns `blocked` only for a substantive
problem, recorded with severity `substantive`:

- a correctness bug;
- missing or wrong tests for behaviour the change introduces or alters;
- a security or data-loss risk;
- a broken contract: an interface, schema, workflow input or caller the change breaks;
- documentation the change has made untrue;
- a gate, approval step, state, option or mechanism the requirements do not need (Simplicity
  first: architecture principle 11, above).

Wording, style, naming, optional refactors, local simplifications and nice-to-haves are `minor`
notes. They never by
themselves make a turn `blocked`, and a review whose only findings are notes clears. The author
may decline a note with a one-line reason (disposition `disputed`, the reason as its `response`)
and spends no turn on it. The reviewer contract (`src/review/local-prompt.ts`) and the legacy
GitHub persona (`.github/agent-review-prompt.md`) say the same.

| Risk | Initial ceiling | Follow-up ceiling |
|---|---:|---:|
| Small, low consequence | 10 minutes | 5 minutes |
| Normal behavior change | 15 minutes | 7.5 minutes |
| High: authorization, billing, destructive operations, shared controls | 30 minutes | 15 minutes |

These are ceilings, not targets. One initial extension of at most 50% is allowed with a recorded
reason. Small was 5 minutes until the first two weeks showed that every small review needing
execution rather than reading overran it, and two worklogs chose between two elapsed figures by
which side of the ceiling each landed on; a ceiling that only produces accounting is not a ceiling.
There is also a floor: an initial review under 30 seconds at normal or high risk is refused.
Small risk has no floor. An under-floor initial turn can only be preserved as `"initialOutcome":
"incomplete"`; the record is then accepted when a later ordinary turn, the same reviewer resumed or
a fresh one, measures at least 30 seconds and clears. No one's approval is needed to continue after
an incomplete turn, and a late-correction `scopeReason` is not required of that turn.
The floor is waived when the validator, reading Git from `base` to `covered`, finds a trivial
change: at most 20 changed non-test lines and 40 lines in test-named files (`*.test.*`, `*.spec.*`,
`test_*.py`, `*_test.py|go`, `*Test(s).swift|kt|java`), every other file configuration, workflow or
prose (`.md .mdx .txt .yml .yaml .json .jsonc .toml`), worklogs and `hq/product/` not counted,
nothing binary, and every turn measured above zero — below that size the floor measures the diff,
not the reviewer. When the waiver applies, `check pr` prints `~ [review-floor] waived: review floor
(trivial diff: N non-test, M test lines)` and `review validate` prints the same text, so CI logs show
how often it fires; nothing is added to the record, whose committed range it is recomputed from.
The author must enforce deadlines and, where available, runner token/cost ceilings. Morpheus
validates reported durations; it cannot interrupt a provider's session or measure its billing.
No reviewer subagents or full-suite reruns by default. On timeout, budget exhaustion or missing
evidence, record that turn incomplete and keep the PR open; the next turn resumes the reviewer or
starts a fresh one, within the five automatic turns.

### Measure each turn; do not ask the reviewer to estimate it

The author owns elapsed-time measurement. Prefer the runner's duration for that invocation
(`total_duration_ms`, `durationMs`, or equivalent). If unavailable, capture actual clock readings
at invocation start and completion. Include tool execution and waits within the turn; exclude the
author's work between turns. A transcript can supply explicit turn boundaries, but a long gap
between messages is not evidence that the reviewer stopped working. Never segment by an idle-gap
heuristic, estimate from work volume, or delay to meet a floor.

`review prepare` emits version 2 records. Each initial and follow-up turn carries:

```json
{
  "elapsedMinutes": 5.21025,
  "timing": {
    "source": "runner",
    "durationMs": 312615,
    "evidence": "Runner result for reviewer session and turn ID: total_duration_ms=312615."
  }
}
```

Populate the real session/turn reference in `evidence`; use `source: "clock"` with the observed
start/end readings for clock measurement. Compute `elapsedMinutes = durationMs / 60000` without
rounding. The checker requires timing for every version 2 turn and rejects a mismatched conversion.
The source reference is an auditable attestation; CI does not fetch private provider transcripts.
Historical version 1 records remain valid; any timing attached to them is checked too. Do not
rewrite old outcomes from an estimated duration or manufacture a measurement to clear a gate.
Without a reliable measurement, record incomplete and obtain the evidence. Review ceilings,
outcomes and escalation rules are unchanged.

The author responds to every finding. For minor-only findings, one fix/response round is enough,
and a declined note needs only its one-line reason. For any substantive finding, a follow-up turn
assesses responses, fixes and their regressions (the original reviewer resumed, or a fresh one
given the earlier findings when it cannot be), unless the reviewer cleared it conditionally
(below). Preserve original severity. Reviewer retractions may clear a disputed finding, but author
disagreement alone cannot.

**A deferral is a ticket, not a sentence.** A finding left `deferred` or `open` names the roadmap
item that tracks it in `roadmap`, and `check pr` requires that item to exist on the branch. File
it with `pm new` before recording the deferral. If the reviewer discovered the finding after the
`reviewed` commit, the new item may be committed before
`covered` without spending a follow-up turn. The exception applies only to a valid direct-child
item named by a deferred or open finding and first added by an author commit in that range.
Editing an existing item, including one brought in by a trunk merge, or changing code still
needs review coverage.
After `covered`, only the review worklog may change. In the first two weeks a cron with no year field
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
commit between the reviewer's commit and `covered` touches only condition paths, the worklog,
and a newly filed deferred/open finding ticket;
minor fixes belong before the reviewer's final turn, and join the allowed set only when there is
no follow-up at all. A condition on a source file in a repository that commits generated output
must name the generated counterparts too, or the regenerated files fall outside it. Name the
documentation that explains the fix in the same way, for the same reason. A condition cannot be added, widened or disputed into clearance by the author;
an unconditional substantive finding still needs its turn. This is Alex's proposal from #241: a
two-line fix should not need a human or a fresh session re-deriving the whole context.

**Five review turns run without anyone's approval** (Chris, 2026-10-30, for every Morpheus
project): the initial review and up to four follow-ups, incomplete turns included. Three proved too
few; agents stalled waiting for a human to approve another round. A follow-up is spent one of
three ways. It resolves what the previous turn left `blocked` (or the substantive findings of the
initial review), after the author has addressed those concrete concerns. It continues after an
`incomplete` turn: a timeout, a crash, a lost session or missing evidence. Or it is a **late
correction after a clearance**: when full CI, or a test the reviewer did not run, shows a fix is
needed after a turn already cleared the code, the author commits the fix and spends a remaining
turn, naming the scope decision in that turn's `scopeReason` ("late CI correction: two legacy UI
tests assumed the old layout"); the author makes that scope decision within the task's budget, and
the record shows it. Otherwise a `cleared` turn ends the review.
New user-requested scope after clearance is not a late correction. Put separable work in its own
roadmap item and PR; if it is inseparable from this PR's acceptance, explain that in `scopeReason`
and use a remaining turn. The cap still applies.
Keep every verdict, incomplete ones included. A turn that renders a verdict (`cleared` or
`blocked`) must meet its budget, and authorization never waives that overrun. A turn that ran out
of time is recorded `incomplete` with its real measured duration; it clears nothing, and the next
turn continues, so a timed-out reviewer never blocks the record for good. The cap is what stops an author and reviewers
trading fixes and findings indefinitely, at a session's cost per turn. Each ordinary turn after
the fifth needs its own `humanAuthorization` ([below](#beyond-five-turns)). Unresolved substantive
concerns after the last turn, or a correction needed once the turns are spent and no human has
authorized another, mean blocked: remove `agent-reviewed`, disable auto-merge, and flag the
remaining work for the human.

### Any fresh reviewer may take a turn

A follow-up does not have to be the original reviewer session. Resume it when you can. When it
timed out, crashed or cannot be recovered, start a fresh reviewer exactly as the first was started
(a new session, no inherited author history) and give it the packet, every earlier finding with
its response, and the record so far. Nobody's approval is needed. Record that turn's own
`reviewerSession`, plus `handoff: { reason, findings }`: why the earlier reviewer did not continue,
and the ids of every finding recorded before this turn. A finding raised after the initial review
carries `turn` (1 is the initial review, the default), so the checker knows which findings came
earlier. Every `blocked` follow-up before a fresh reviewer's turn names the substantive findings
it blocked on in `blockedOn`, even when another turn (say, the same reviewer resumed and timed out)
came between them. The initial review cannot carry `blockedOn`; its blocking findings are its
substantive findings at `turn` 1.

That is what keeps replacement from becoming reviewer shopping: every turn stays in the record,
and nothing an earlier reviewer found disappears with its session. `check pr` refuses a fresh
reviewer's turn without a handoff, a handoff that leaves out an earlier finding or names one the
record no longer holds, an earlier `blocked` follow-up without `blockedOn`, and a `blockedOn` id
that is missing from the record or is not substantive. The guard is relative to the recorded
`turn`: relabelling a finding's turn is the same fabrication as leaving it out, which no check of an
author-written record can catch, and `blockedOn` is what anchors a blocked verdict to its findings.
A finding the fresh reviewer disagrees with stays
in the record at its original severity, with the reasoned response; it is visible, not silent. A
fresh reviewer's ordinary turn has the initial-review ceiling rather than the follow-up ceiling,
because it reads the change from scratch. It is still a fresh session: never the author, and never
one that appears in another worklog.

### Verification and finalization turns

**The legacy verification turn.** Records written under the three-turn contract may carry
`verification: { kind, paths, evidence }` on their third `followUps` entry (the fourth turn), and
it stays validated as it was: `late-test` covers only test files, `finding-fix` only a fixed
finding's paths and tests, the attested paths must exactly match the changed author-commit paths
(at most four, with 80 test and 40 non-test lines), normative policy is excluded, the turn is
capped at five minutes with cumulative ordinary time within twice the initial ceiling, it cannot
follow an incomplete turn or finalization, and it must clear. Under five automatic turns it is no
longer needed: spend an ordinary turn instead.

**One automatic finalization-only turn per pull request.** Finishing an approved change should
not cost a human decision. Beyond the cap — and after an authorized extra turn, if there was one —
a reviewer may spend one short turn whose only job is to close out work already cleared:
the explanatory prose describing that work, the review record itself, or the completion of a
condition it already set. Add `finalization: { paths, evidence, attestation }` to that
`followUps` entry, alongside a `scopeReason` naming what it finalized. The reviewer writes it;
an author cannot certify their own work by filling it in, and `authorSession` may not be the
reviewer.

The author writes the ordinary review record after the reviewer returns. Do not invoke a
finalization turn to repair a missing timing measurement, an incomplete review, or routine
record prose. It requires an already cleared turn and cannot assess new implementation. A failed
attempt to do paperwork does not create code-review clearance or justify asking for an extra
implementation review; use a remaining ordinary follow-up for an actual late correction.

It is bounded on every side, because an automatic turn that could approve implementation would
simply be a sixth review with no decision behind it:

- **One per pull request.** A second is recorded as an ordinary turn, under the five-turn cap.
- **Five minutes.** Anything that takes longer is a review and spends a turn.
- **Outside the count, not a back door.** It does not count toward the five. An ordinary turn may
  follow it only as a late correction with its `scopeReason`, within the five, or beyond them with
  `humanAuthorization`. Preserve the finalization record and validate its original scope and predecessor.
- **`cleared` only, and it follows a clearance.** A reviewer with a remaining concern records
  `blocked` or `incomplete`, and the pull request stays blocked — including when the turn before
  the finalization turn is the one that blocked. It cannot resolve a substantive finding: the
  preceding ordinary turn must have cleared it.
- **Scope, checked against the diff.** `check pr` verifies the commits the turn covers touch only
  the review worklog, paths whose condition the author actually **satisfied**, and the explanatory
  Markdown its `paths` attest. A condition left disputed or unmet was never discharged, so its
  paths are ordinary unreviewed source here. Attesting a documentation file does not clear an
  implementation change that rode along in the same commit.
- **No blanket documentation exemption.** `AGENTS.md`, `CLAUDE.md`, `morpheus.json` and anything
  under `.github/`, `.ci/` or `.morpheus/` are policy a project is operated by; a change there is
  substantive however it is described, and is refused outright in a finalization scope. Other
  Markdown — a runbook paragraph, an architecture note — is admitted only on the reviewer's
  attestation that it restates behaviour already reviewed. A runbook that states a *new* rule is
  normative too, and the reviewer is the one who has to say which it is. Matching is
  case-insensitive and applies at any depth, so `agents.md` and `apps/web/.github/...` are refused
  as well. One thing no pattern can catch: if a repository's `AGENTS.md` is a symlink to an
  ordinary `.md`, the real policy text sits at a non-normative path, and the reviewer's
  attestation is the only guard.

This is the narrow gap Evo #291 fell into: a conditioned fix was correct and cleared, and the one
commit carrying it also carried the paragraph explaining it. The author could not widen the
reviewer's condition, the commit was pushed so it could not be split, and after `covered` only the
worklog may change — so a correct change sat blocked on a paragraph. **Prevention is cheaper than
the exception: a reviewer setting a condition should name the related documentation and generated
counterparts in `condition.paths` from the start.** The finalization turn is the backstop, not the
plan.

### Beyond five turns

An explicit human decision may authorize each ordinary turn after the fifth. Add
`humanAuthorization: { approvedBy, approvedAt, reason }` to that `followUps` entry,
using an ISO timestamp and a reason identifying the human's decision and scope. Every
turn beyond the cap needs its own authorization; preserve all earlier turns.
This attestation is human-auditable, not cryptographic proof. Never infer approval from
a merge request or manufacture it. Clearance, coverage, budget and CI checks still apply.
Records written under earlier contracts that carry `humanAuthorization` on a turn inside the five
stay valid; the field is simply no longer needed there.
The parser accepts at most 20 recorded follow-ups as an input-size bound, not authorization.


## When the author is gone: the GitHub Manager

Everything above assumes an author who is still there to answer the review. When the authoring
session has ended and the pull request sits, the scheduled GitHub Manager takes it over
([gh-manager.md](gh-manager.md)). It is a fresh session that did not write the change, so it may
review; and it fixes its own findings in the same session, because handing them back to an absent
author is the stall again. That is a separate, narrower record (`morpheus-manager-review`, selected
by a `manager-reviewed` label that only `morpheus-gh-manager[bot]` may apply), not a turn in this
contract: the five-turn cap, `humanAuthorization` and finalization rules here are unchanged, and
an existing `morpheus-review` record is left as the history the manager read.

An author must still never wait for it. It acts only after a cooldown, it cannot clear a change to
normative policy, and its use is reported as a waiver on every check.

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
For follow-up turns, add `followUps`, at most four entries without authorization.
Human-authorized and finalization turns remain separately bounded. Each has the `reviewerSession`
of the session that took it, `commit`, `outcome` (`cleared`, `incomplete`, `blocked`),
`elapsedMinutes`, and `summary`, plus `handoff` when its reviewer differs from the turn before
and `blockedOn` on a `blocked` turn a fresh reviewer took over from. Every entry but the last must
be `blocked` or `incomplete`, or `cleared` when the entry after it carries a `scopeReason` for the
late correction it covers; the last must be `cleared`. A
follow-up that comes directly after an initial review with no substantive findings is that same
shape and needs a `scopeReason` too. An `incomplete` entry may be followed by any turn, and may itself record the overrun that made it incomplete. A single
`followUp` object, the shape from the two-turn contract, still validates as one turn. Each turn's
`commit` must descend from the previous one. `elapsedMinutes` at the top level measures the
initial review only. A follow-up by the same reviewer as the turn before it is checked against the
follow-up ceiling; a fresh reviewer's ordinary turn against the initial ceiling; and an
`incomplete` turn may record the overrun that made it incomplete.

`base` is the merge base; `reviewed` is the initial code commit; `covered` is the final commit
covered by reviewer clearance or the author's minor fixes. All are full 40-character SHAs and
must form an ancestor chain. The final follow-up must cover `covered`. Without a follow-up, changed
paths between `reviewed` and `covered` must belong to fixed minor findings (plus this worklog).
This is path-level verification: the reviewer/author remain responsible for ensuring those edits
are actually the stated fixes. Unrelated changes invalidate coverage and require an explicit scope
and budget decision, not an automatic restart.

After `covered`, only this worklog may change, except for trunk merges as described below and a
late correction that spends a remaining turn: commit the fix, have a reviewer (resumed, or fresh
with its handoff) clear it as the next `followUps` entry with its `scopeReason`, and move `covered`
to that commit. The commits
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
blocked; exhausting the five turns never means automatic merge regardless of findings.

Put a visible line in the PR body (not inside a comment or code fence):

    review-record: .agent/worklog/YYYY-MM-DD-task.md

Also link the worklog and summarize the outcome. Once complete, commit the worklog and run

    morpheus review validate [<worklog>] [--pr-body-file <file>]

before pushing. It calls the same `verifyReviewRecord` the CI gate calls, against committed `HEAD`,
so every record failure CI reports — the summary missing from the visible prose, more or less than
one JSON block, commits after `covered`, author fixes beyond the minor paths, a hand-resolved merge
left unnamed, an exhausted budget, a stale base — shows up here first. With no path it finds the one
worklog changed on the branch that carries a record. It does not consult the label, which is the
author's declaration that this check has passed. Then push and open the PR with the label already
applied (`gh pr create --label agent-reviewed`, creating the repository label if absent), so the
first conventions run validates the record instead of failing on a missing label. Never enable
auto-merge until review and CI are complete.

**Open the PR as a draft if it has to exist before review is recorded** (`gh pr create --draft`,
or `gh pr ready --undo`). The caller's `pr` job skips a draft that carries neither `agent-reviewed`
nor `manager-reviewed`, so `pr / conventions` is not reported at all: GitHub shows the required
check as expected and waiting, and merge stays blocked, but nothing is red. The skip has to be on
the caller job. A skip inside the reusable workflow would report `pr / conventions` as skipped, and
a skipped required check satisfies branch protection, as a pass would. The check itself never passes
a PR without the label. Labelling the draft or marking it ready runs the full check, so a ready PR
without the label fails as before. A draft carrying the label is validated in full.

The one window this leaves is the one that already exists for removing the label: a draft that
was labelled (and went green) and then unlabelled keeps that green result on the same head until
something re-runs it, and marking it ready re-runs it. Removing the label is deliberate; an
unreviewed draft that was never labelled has no result to inherit.

When a ready PR lacks the label, conventions reports that it is not marked merge-ready and that
record validation was not run. This also covers an author deliberately removing the label while
a correction or follow-up is pending (converting to draft does not re-run the check; only a draft never labelled waits unreported); the missing
label alone does not establish an incomplete record.
This is an auditable attestation, not a security boundary against an author fabricating evidence.

## Existing projects

The shared `pr-check.yml` enforces the gate automatically when using updated Morpheus. Each existing
caller must grant `contents: read` and `pull-requests: read` on its `pr` job and needs a separate metadata-only workflow for `edited`, `labeled`, and `unlabeled` events,
calling `pr-check.yml` under the same `pr` job name. The scaffold writes
`.github/workflows/review-metadata.yml`; re-running `morpheus init` adds it without overwriting
existing files. Do not add skipped build/test jobs there: skipped statuses can satisfy required
checks and must not replace a still-running build. The ordinary CI retains its normal triggers.
For an unreviewed draft to wait rather than fail, each caller's `pr` job also needs
`if: ${{ <PR_CHECK_CALLER_IF> }}`, the expression exported from `src/init/templates.ts`, and must
trigger on `ready_for_review`. This is a caller edit, so `@main` does not deliver it; a caller
without it keeps a red check on an unreviewed draft, which is the old behaviour, not a weaker one.
Until a caller is updated, rerun its conventions workflow after changing the body/label: the shared
check fetches live PR metadata, so reruns do not keep validating the original event snapshot.
Pushes still trigger verification normally. Keep legacy required delivery jobs wired in and skipped;
the paid `agent-review.yml` now defaults off and remains explicitly opt-in.

`morpheus init` preserves existing authored files. It can add a missing metadata workflow, but
it does not update existing CI grants or rewrite existing `AGENTS.md` review instructions.
Update those explicitly in each project's reviewed rollout; new projects receive the current
instructions from the scaffold.
