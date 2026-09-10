# Independent review before merge

The author owns review scheduling and responses. CI verifies evidence without invoking a model.
Run `morpheus review prepare --base origin/main` after committing implementation and tests. Give
its output to one fresh session with repository access, without the author's conversation history.
The canonical contract ships in `src/review/local-prompt.ts`; the old `review prompt` command and
`.github/agent-review-prompt.md` remain for explicitly enabled legacy GitHub reviewers.

## Policy

`review.required` in `morpheus.json` defaults to true, including existing manifests. False is a
visible project opt-out. Records/board-only changes and exact dependency-only Dependabot PRs keep
their existing exemptions. This gate covers all other authors, not just particular model names.
The legacy `review-waived:` line does not waive independent review.

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

After `covered`, only this worklog may change, avoiding the hash loop from committing the review
record itself. A code, generated-output, documentation or other file edit makes the record stale.
Reconcile the base before review; incorporating a different merge base invalidates the record too.

Put a visible line in the PR body (not inside a comment or code fence):

    review-record: .agent/worklog/YYYY-MM-DD-task.md

Also link the worklog and summarize the outcome. Once complete, apply `agent-reviewed` (create the
repository label if absent), commit the worklog and push. Run local conventions with the actual PR
body and `MORPHEUS_PR_LABELS=agent-reviewed`. Never enable auto-merge until review and CI are complete.
This is an auditable attestation, not a security boundary against an author fabricating evidence.

## Existing projects

The shared `pr-check.yml` enforces the gate automatically when using updated Morpheus. Each existing
caller needs a separate metadata-only workflow for `edited`, `labeled`, and `unlabeled` events,
calling `pr-check.yml` under the same `pr` job name. The scaffold writes
`.github/workflows/review-metadata.yml`; re-running `morpheus init` adds it without overwriting
existing files. Do not add skipped build/test jobs there: skipped statuses can satisfy required
checks and must not replace a still-running build. The ordinary CI retains its normal triggers.
Until a caller is updated, rerun its conventions workflow after changing the body/label: the shared
check fetches live PR metadata, so reruns do not keep validating the original event snapshot.
Pushes still trigger verification normally. Keep legacy required delivery jobs wired in and skipped;
the paid `agent-review.yml` now defaults off and remains explicitly opt-in.
