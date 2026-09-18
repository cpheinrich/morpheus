---
date: 2026-09-18
agent: claude
roadmap: MO-26-09-18-08.14.37
outcome: in-progress
summary: Merging trunk never invalidates a cleared review; hand-resolved merges are named, not hidden.
---

Chris was concerned that an agent not actively driving a merge would watch `main` keep moving,
each move triggering a new review or exhausting the allocated turns. He chose the human-team
convention: merging `main` never invalidates a review, CI still has to pass, and the gate can be
tightened later if it leaks. This closes the 2026-09-16 inbox question and #245.

The implementation walks the first-parent commits in the ranges no reviewer cleared and accepts
three shapes: a trunk merge Git's `merge-tree --write-tree` reproduces exactly, a hand-resolved
trunk merge named in `trunkIntegrations` with a reason, and a worklog-only commit. That replaced
the `documentationIntegrations` proof from #253 (allowlisted Markdown, source review records,
rename-free reconstruction), which is now subsumed: its field is still parsed so the two records
on trunk that carry it remain valid, but nothing enforces it.

Two choices worth recording. First, reconstruction now runs with Git's default rename detection,
where #253 disabled it and refused rename-resolved merges. The goal changed: #253 asked "could
this merge have smuggled anything", this rule asks "is this exactly what `git merge` produced",
and `git merge` detects renames. Second, the old equality check between the recorded base and the
PR's merge base became an ancestor check. Equality was the mechanism that forced a turn per trunk
advance; under the new rule trunk moving past the recorded base is the expected state.

Dead end: allowing a hand-resolved merge with no record at all. It would have matched Chris's
wording literally, but a conflict resolution can contain arbitrary code, and a one-line entry is
cheap where an invisible edit inside a merge commit is exactly the shape nobody re-reads.
