---
date: 2026-11-18
agent: codex
roadmap: MO-26-11-18-00.41.23
tags: [engineering, research]
---

# Replay review quality and avoidable work

The original audit author continued the work with the original audit reviewer as historical
evidence assessor and masked grader. Used the authorized Factory Claude gateway for fresh replay
sessions. The task worktree was claimed before implementation. Other projects were read-only.

The [report](../../qa/audits/2026-11-18-review-replay.md) gives the 50/50 corpus, causal
historical evidence and ranked experiments. Both arms caught the same six defects and made the
same redundant request once per repeat. The frozen reduced cases showed a ceiling.
Original-diff checks found two missed Git mechanisms, a suggestion to drop early target resolution, and
one attempt to block on evidence only obtainable after merge. This led to two scoped fixes.
The wider prompt remains an experiment fixture. The runbook records how to check requested
work against a supported path and avoid repeated minor notes.

A first Factory queue attempt for the fourth original-diff review could not start alongside
three active sessions. Retried after another session finished. All four produced review text.
One P02 review returned incomplete. One P01 review's structured wrapper summarized away the
requested shape; the original JSON finding list was recovered from its worker events. The
graph installer enabled watching but reported a desktop config ownership warning and stopped
before indexing the task. Direct indexing and exact coverage checks then succeeded.

The scorer tests paired outcomes with equal totals and opposite individual effects, and verifies
missing output stays unknown. The primary score reproduces both repeats from committed labels.
A disposable reconstruction reproduced the tested candidate SHA-256. The CLI regression exercises
a real Git checkout with a missing trusted ref, a same-named tag, and a candidate opting out of
review. Removing early lookup alone changed the diagnostic, but downstream checks still refused.
Replacing exact lookup at CLI entry with permissive revision lookup yielded a false waiver and
exit 0. The restored implementation returned 1 with the expected diagnostic.

The private ledger and raw Factory receipts are retained in the controller's task artifacts.
The raw graded output is hashed in the report. The benchmark cost listed there excludes the
separate review of this draft. No provider or review runs are required to score the saved results.
