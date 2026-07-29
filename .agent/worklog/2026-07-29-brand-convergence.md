---
date: 2026-07-29
agent: claude
roadmap: MO-025
outcome: shipped
summary: Convergence now requires an expressive and a dense surface, and the session signs off with the checks it did not run.
---

## What I took and what I left

Codex's third point was right: "real screens, real copy, real states" is underspecified, and a
strong hero proves very little.

The proposed acceptance set was ten bullets — every interactive state, dark mode, contrast,
reduced motion, imagery provenance, brand-architecture differentiation. I did not ship it whole.
MO-022 had just argued that a checklist long enough to be thorough is one nobody completes, and
shipping a ten-item gate would contradict that within a day. Worse, it would *look* enforced while
being skipped, which is a downgrade from honest underspecification.

So: gate on the two surfaces that actually catch the failure, and name the rest as things to look
at with an explicit instruction to report what was **not** checked.

## The line that does the work

> If it holds on both, it is a direction. If it only holds on the first, it is a poster.

The dense functional surface is where a palette with no quiet neutral, or a display face that
cannot set 13px, becomes visible. A hero hides both.

## Completion as a checked section

`## Completion` goes in `decisions.md` and is required by `brand status`. It is absent for the
whole session and present only when the session actually ended — which is the right shape, because
`brand status` answers "is the package finished", and a completion report naming its own gaps is
exactly the evidence for that.

The requirement to list **checks not run** is the part worth defending. Everything else in the
report is something an agent wants to write.
