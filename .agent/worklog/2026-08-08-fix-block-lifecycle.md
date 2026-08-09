---
date: 2026-08-08
agent: codex
roadmap: MO-26-08-08-21.50.05
outcome: shipped
summary: "Made pm block repairable, indexed, branch-safe, and honest about publishing blocked records."
---

# Repair the blocked-work lifecycle

Issues #80, #83 and #91 were one state machine seen from three positions. The strict roadmap parser
correctly excludes an invalid blocked item with no `needs:`, but `pm block` then interpreted absence
from the valid result set as absence from disk. The repair path now re-reads only matching invalid
files and accepts one only if adding the caller's need makes the full roadmap schema valid. Other
invalid files stay errors; strict parsing was not weakened to make a recovery command convenient.

The block's three source records and its generated view now travel together. The inbox renderer
receives the basename the parser actually found rather than reconstructing `<id>.md`, and the index
is regenerated only when the board validates — otherwise the block still records the escalation and
reports why it could not safely render a partial board.

The most important ordering is the trunk check before `blockItem`: refusal after the write would be
the original protected-branch failure with a better message. The configured trunk branch is resolved
through the same session policy as context freshness. Offline is deliberately exempt because that
path already suppresses commit and push; removing it would close the escape hatch for the sessions
that most need to stop rather than guess.

Issue #83 could have been "fixed" by allowing a blocked claimed branch to merge. That would discard
the branch holding partial work, contradicting the reason blocked claims persist. The verifier now
states the existing correct route — publish the records on a branch staking no item — and explicitly
warns not to relabel the item as review-ready.
