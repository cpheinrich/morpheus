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
prepared packet and repository location, and retain the reviewer session ID for the one allowed
follow-up. A reviewer is a bounded task started by the author, not a standing PR-monitoring agent.

The canonical contract ships in `src/review/local-prompt.ts`; the old `review prompt` command and
`.github/agent-review-prompt.md` remain for explicitly enabled legacy GitHub reviewers.

## Policy

`review.required` in `morpheus.json` defaults to true, including existing manifests. False is a
visible project opt-out. Records/board-only changes and exact dependency-only Dependabot PRs keep
their existing exemptions. This gate covers all other authors, not just particular model names.
The legacy `review-waived:` line does not waive independent review; `check pr` reports it as
waiving legacy delivery only and says so in the same line.

Review scope follows consequences, not changed lines. Bugs caused, exposed or worsened by the PR,
and problems preventing acceptance criteria, are in scope. Other pre-existing bugs are incidental
follow-ups. Flag independently discovered critical risks for human judgment; do not silently widen
the PR. Blocking findings need a concrete failure scenario and a causal connection to this change.

| Risk | Initial ceiling | Follow-up ceiling |
|---|---:|---:|
| Small, low consequence | 5 minutes | 2.5 minutes |
| Normal behavior change | 15 minutes | 7.5 minutes |
| High: authorization, billing, destructive operations, shared controls | 30 minutes | 15 minutes |

These are ceilings, not targets. One initial extension of at most 50% is allowed with a recorded
reason. The author must enforce deadlines and, where available, runner token/cost ceilings. Morpheus
validates reported durations; it cannot interrupt a provider's session or measure its billing.
No reviewer subagents, full-suite reruns by default, or automatic repeated sessions. On timeout,
budget exhaustion or missing evidence, record incomplete and keep the PR open.

The author responds to every finding. For minor-only findings, one fix/response round is enough.
For any substantive finding, resume the original reviewer exactly once to assess responses, fixes
and their regressions. Preserve original severity. Reviewer retractions may clear a disputed
finding, but author disagreement alone cannot. Unresolved substantive concerns mean blocked: remove
`agent-reviewed`, disable auto-merge, and flag the remaining disagreement for the human. No third
automatic round or replacement reviewer to obtain approval.

## Record and publish

Keep one `morpheus-review` JSON fence
in the task's `.agent/worklog/YYYY-MM-DD-task.md`, using the template emitted by `review prepare`.
Repeat its `summary` as a normal paragraph. Record even a clean review. The paragraph should state
what was found, what the author did, any disagreement, the second-pass outcome, and limitations.
The JSON retains finding details so the short paragraph does not erase the audit history.

Each finding has `id`, `severity` (`minor`, `substantive`, `incidental`), `description`, repository-relative
`paths`, `disposition` (`fixed`, `disputed`, `deferred`, `open`) and a substantive `response`.
For a second pass, add `followUp` with the same `reviewerSession`, `commit`, `outcome`
(`cleared`, `incomplete`, `blocked`), `elapsedMinutes`, and `summary`.
`elapsedMinutes` at the top level measures the initial review only.

`base` is the merge base; `reviewed` is the initial code commit; `covered` is the final commit
covered by reviewer clearance or the author's minor fixes. All are full 40-character SHAs and
must form an ancestor chain. The follow-up must cover `covered`. Without a follow-up, changed
paths between `reviewed` and `covered` must belong to fixed minor findings (plus this worklog).
This is path-level verification: the reviewer/author remain responsible for ensuring those edits
are actually the stated fixes. Unrelated changes invalidate coverage and require an explicit scope
and budget decision, not an automatic restart.

After `covered`, only this worklog may change, except for the verified documentation integration
below. This avoids the hash loop from committing the review record itself. Other edits make the
record stale.
Reconcile the base before review. If trunk advances during the review, preserve the initial
`base`/`reviewed` and make an explicit scope decision to use the one same-session follow-up for
integration and affected paths. Set `followUp.base` to the new merge base and `followUp.scopeReason`
to that decision. The original base must precede the new base, which must precede `covered`.
This remains two passes total, even if the initial review was clean or minor-only; do not invent
substantive initial findings. A base change without this evidence invalidates the record.

### Already reviewed documentation may be integrated without another round

A cleared review stays cleared when an author integrates already reviewed documentation from
trunk and the deterministic proof below passes. This is author-owned verification, not a third
review, a budget reset, or a request for human permission. Preserve the original `base`, `reviewed`,
`covered`, findings and follow-up exactly. Append `documentationIntegrations` entries in merge order:

```json
{
  "base": "<full new trunk SHA>",
  "commit": "<full integration merge SHA>",
  "reason": "Integrate the separately reviewed README update; executable files are unchanged.",
  "sources": [{
    "commit": "<full incoming trunk commit SHA>",
    "reviewRecord": ".agent/worklog/YYYY-MM-DD-docs.md"
  }]
}
```

Each entry must name an actual two-parent merge with the new trunk as its second parent.
Every incoming trunk commit must be linear (the normal squash-merge shape), carry its own
complete independent review record based on its trunk parent, and change only regular,
non-executable Markdown in the allowlist: root `README.md`, `docs/`, `.agent/worklog/`,
`.agent/inbox-archive/`, `.agent/decisions.md`, `.agent/learned.md`, `hq/product/`, or `hq/team/`.
`AGENTS.md`, `CLAUDE.md` and `SKILL.md` are excluded everywhere. Symlinks, executable bits,
source, tests, templates, configuration, generated output and other paths are refused.

`check pr` validates each source record's completion, reviewer identity, findings and budgets.
Squashed source commits retain their original review SHAs: this checks the committed attestation,
not a new GitHub review or a re-review of that PR. It does not authenticate a dishonest record.
The author must confirm the incoming documentation was reviewed and does not change the reviewed
feature's requirements or acceptance criteria. If it does, use the remaining review pass or
escalate when the budget is exhausted; do not label a substantive change harmless.

Git must reconstruct exactly the integration commit's tree with `merge-tree --write-tree`.
Conflicts and hand-edited merges fail; before, between and after these merges, only the named
feature worklog may differ from cleared coverage. The PR's merge base with trunk must equal the
final recorded integration base; GitHub's up-to-date rule covers anything trunk adds after that.
Reconstruction runs without rename detection, so a merge that resolved a trunk-side rename against
a feature-side edit is refused rather than trusted. Record the source PR links, verification and
limitations in visible prose.
No model call is needed for this mechanical proof. CI must still pass before merge.

Without this evidence the existing freshness rule still applies. Unresolved substantive findings,
incomplete reviews and changed executable files remain blocked; two rounds never mean automatic
merge regardless of findings.

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
