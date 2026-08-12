---
roadmap: MO-26-08-02-02.48.16
date: 2026-08-09
summary: Made agent-review delivery observable and repaired the three re-review gate invariants raised in issues #70 and #76.
---

## What changed

The action running is not evidence that its review landed. The workflow now records the latest bot
comment before the Review action, then an `if: always()` step reads the final comment and asks typed
code whether this run delivered anything. Delivery requires a new comment with a substantive body;
the action's exact progress placeholder and its final error form both fail. The action's
`execution_file` is retained only for diagnosis, because healthy runs can have permission denials
and broken delivery paths need not.

The same change closes the three findings in #76. URL extraction preserves paths from GitHub blob
permalinks and percent-encoded Claude Fix-this queries before discarding the surrounding URL. The
incremental cursor is pinned to the cheap review/no-review gate by a workflow structure test; the
actual reviewer still sees the full PR. Finally, diff acquisition now keeps `null` (unreadable) and
`[]` (read successfully, no changes since the last review) distinct, so only the former fails open.

## Why the delivery warning stays advisory

The existing verifier-stack decision says rung 2 does not block: a model-graded gate that can fail
on its own noise gets bypassed. A missing review is infrastructure evidence rather than model
judgment, but the requested outcome is observability, and the workflow now provides it with a
warning annotation and an explicit "delivery not confirmed" job summary. If experience shows that
warning is insufficient, failing delivery should be a separate recorded decision rather than an
incidental shell exit in this item.

## Verification before the live PR run

- `pnpm typecheck`
- `pnpm exec vitest run --maxWorkers=1` — 27 files, 821 tests. One parallel run timed out in three
  unrelated temporary-Git-remote fixtures; all three exact cases passed serially in under a second
  each, and the full serial suite passed.
- Regression cases cover a successful review, an unchanged prior comment, the exact placeholder,
  the action error body, a GitHub blob permalink, a real-shape encoded Fix-this link, empty diff,
  and unreadable diff.
- Workflow structure tests require the Review step id, the always-running dependent delivery job,
  its comment-snapshot and action-conclusion plumbing, and the full-PR/cursor separation.

The final proof is the PR's own review run: the new delivery step must find the review comment the
action leaves on this branch and report delivery confirmed. That result will be recorded on the PR.

## The first live run changed the definition again

PR #110 showed the current action/model replacing the old placeholder almost immediately with a
`### Reviewing this PR` todo list. The review was still running for another six minutes. The
historical item's claimed biconditional — placeholder absent iff a review landed — had drifted, and
the first implementation would have certified that checklist if the model stopped there.

The job step order exposed a second flaw: a normal step after a composite action runs before that
action's post step, so it cannot observe the final `Claude finished` / `Claude encountered an error`
body. Delivery is now a separate job that needs the review job and runs `if: always()` after its post
steps. The Claude action is pinned to the exact v1 commit whose final body contract the predicate
parses; the predicate requires its positive finished marker and substantive content after the
separator. The next pass replaced the sampled progress heading with repository-owned evidence.

The independent review then found four wiring paths that could still lie, all addressed before the
second push: generic `github-actions[bot]` recency is replaced by this run's `[View job]` URL;
comment reads paginate and flatten every page; successful-no-prior, unreadable and missing snapshot
states are separate; and the skip reason is carried from typed code into the summary. It also
surfaced an older silent-no-op in the cursor (`gh api --jq --arg`, where `--arg` belongs to jq), now
replaced by an encoded GET plus jq over the response file.

## The second live run caught both kinds of borrowed evidence

The separate delivery job ran in the right order, but correctly reading its log — rather than its
green advisory conclusion — showed a warning. The completed review quoted the exact placeholder
while discussing the detector, and the global substring check called that a failure. The same
review had used a different in-progress heading before it completed, proving the sampled model
heading was not a contract either.

The final definition borrows no positive evidence from model prose. The CLI appends
`<!-- morpheus:review-delivered -->` to every assembled prompt after the caller's persona and item
context, so an older consumer persona cannot disagree with the detector. The predicate requires it
alongside the pinned action's final success header. Error matching is scoped to the action
header; placeholder matching is equality against the whole review section, so quoting either in a
real finding cannot fire. A model progress body that mentions the sentinel is rejected by the
pinned spinner asset on its first line, without depending on a model-authored heading or checklist.
The dependent job also treats a missing late `review_requested` output as review
required, so an early checkout/install/cursor failure produces delivery evidence rather than
silently skipping the detector.

## The third live run moved the contract to the assembled prompt

The sentinel-only version failed closed on a healthy run because the reviewer omitted it. Its own
review identified why the persona was the wrong transport: consumers own copied persona files,
while the detector ships from `morpheus-ref`, so they can drift independently. `buildReviewPrompt`
now appends the delivery contract last on every run, even for a caller persona that predates it.
The predicate accepts the sentinel anywhere in substantive review text because the action can leave
its branch-footer remnant after it, and the test fixture now carries that exact live shape.

The same pass tightened two fail-closed seams: `configured` and `review_requested` job outputs both
use `!= 'false'`, so an early review-job failure does not silently skip delivery; and the exact run
selector includes the closing `)` after the numeric id, so a run id cannot match a longer id by
prefix. The error marker now covers the pinned action's no-duration abort header as well.

## The fourth live run removed two model-position assumptions

The dependent delivery job now explicitly shares the review job's `pull_request` event scope. That
keeps the fail-closed late-output checks on PR runs without emitting a false delivery warning on
every healthy push to `main`, where no review is due and no pull request number exists.

Unfinished progress is also structural rather than positional: an actual pinned-action spinner image
is rejected anywhere in the review body, and an unticked checklist line is rejected outside fenced
code. A delivered review may still quote the bare asset id or a checklist inside a code sample, so
reviews of the detector itself do not trip the guard merely by explaining it.

## The fifth live run moved the marker past the action sanitizer

The pinned action sanitizes every body written through its comment tools and strips HTML comments.
That made the original `<!-- morpheus:review-delivered -->` marker impossible to deliver even when
the reviewer followed the prompt; the prior live delivery job had already warned for exactly that
reason. The marker is now a Markdown link-reference definition, which renders no visible prose but
survives the sanitizer. A regression fixture passes a completed body through an HTML-comment
stripper before assessment.

Progress detection now removes fenced code before looking for either the actual spinner image or an
unticked checklist, and an unbalanced fence fails closed instead of hiding every later signal. The
workflow's final selector also requires the pinned action's finished or error header, so a newer
second-channel model comment cannot displace the tracking comment merely by repeating the run URL.
