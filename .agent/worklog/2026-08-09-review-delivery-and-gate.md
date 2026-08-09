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
- `pnpm test` — 27 files, 817 tests
- Regression cases cover a successful review, an unchanged prior comment, the exact placeholder,
  the action error body, a GitHub blob permalink, a real-shape encoded Fix-this link, empty diff,
  and unreadable diff.
- Workflow structure tests require the Review step id, the always-running delivery step, access to
  `execution_file`, and the full-PR/cursor separation.

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
separator, and explicitly rejects the live progress heading.

The independent review then found four wiring paths that could still lie, all addressed before the
second push: generic `github-actions[bot]` recency is replaced by this run's `[View job]` URL;
comment reads paginate and flatten every page; successful-no-prior, unreadable and missing snapshot
states are separate; and the skip reason is carried from typed code into the summary. It also
surfaced an older silent-no-op in the cursor (`gh api --jq --arg`, where `--arg` belongs to jq), now
replaced by an encoded GET plus jq over the response file.
