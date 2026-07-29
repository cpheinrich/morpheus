---
date: 2026-07-29
agent: claude
roadmap: MO-020
outcome: shipped
summary: The brand wizard now hands off to an interactive session rather than implying it is finished.
---

## The reframe

Chris pointed out the wizard cannot get anyone to a visual design, and should not act like it
can. It produces starter context; the look comes from an interactive session with an agent that
can generate and iterate on mockups.

That is obvious in retrospect and was not encoded anywhere. The wizard ended with "fill
tokens.json from the decided visual direction" — which assumes a decided direction exists, and
says nothing about how to arrive at one.

## Built

`explore-prompt.md`, generated from the answers, designed to be pasted into a fresh session. The
useful property is that the constraints travel with it — an agent reading that prompt has the
"must never feel like" boundaries in front of it, which is what stops eight mockups from being
eight arbitrary aesthetics.

Asks for the agent's own recommendation *and what is lost by rejecting the rest*, because a
ranking without a cost is not a judgement.

## Worth remembering

**A deterministic tool that knows its own boundary is more useful than one that pretends to cover
the whole job.** The wizard's value is that constraints get written down before exploration
starts — not that it produces a brand.
