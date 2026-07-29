---
date: 2026-07-29
agent: claude
roadmap: MO-024
outcome: shipped
summary: Design sessions now keep a durable settled/rejected/open record, written per round.
---

## Why this was the valuable third of issue #12

The prompt said "ask what landed" and never said to write the answer down. Everything learned in a
round lived in scrollback, which does not survive compaction, a night's sleep, or a different
agent picking it up.

The information that gets lost is mostly **negative or compositional**: which direction was
rejected and why, and which single element of a rejected direction should survive. Those are
exactly the things nobody reconstructs from the surviving mockups.

## Two details that make it work

**Per round, not at the end.** A record written at the end is written by whoever still remembers,
which is the failure it was meant to prevent.

**Stable names from round one.** "Take the type from B and the imagery from D" is the most useful
sentence in a design session and it stops meaning anything once the mockups are gone.

## The check worth keeping

`brand status` requires all three sections. The reasoning is not tidiness: **a session that
rejected nothing did not diverge.** A missing `## Rejected` is evidence about the process, not a
formatting nit, which is why it is worth failing on.
