---
date: 2026-09-22
agent: claude
roadmap: MO-26-09-22-07.07.17
outcome: in-progress
summary: Floors, runner-issued reviewer ids, tracked deferrals, a 10-minute small ceiling and conditional clearance.
---

Chris asked for the five evidence-side tightenings from the 2026-09-22 survey of Lakina and Evo
review records. This is the Morpheus half; the project `AGENTS.md` rollouts follow separately.

Design notes. The reviewer-id rule is a shape check plus a uniqueness check: a UUID or 16-plus hex
id, optionally behind a provider prefix, and `git grep` at head must find it in no other worklog.
The shape alone would still have admitted `7f3a9c2e`-style eight-character ids, hence sixteen.
Uniqueness is per branch, which is what `check pr` can see; a reviewer reused across repositories
is not caught. Morpheus's own earlier records (`reviewer-mo-26-09-18-b`, `/root/review_x`) would
fail the new shape, but merged records are never re-validated, and no open PR carries one.

Conditional clearance composes with the existing path walker rather than adding a turn state:
condition paths join the allowed set for the ranges no reviewer cleared, and the final turn's
commit may precede `covered` only when a conditionally cleared finding exists. Considered a
`cleared-if` turn outcome instead; rejected because the condition belongs to the finding, and a
turn outcome cannot say which finding or which paths.

Deferral tracking is widened from Chris's "non-incidental" wording to every deferred or open
finding, because substantive findings already cannot be deferred and the survey's rotting
deferrals were all incidental. Flagged to Chris in the conversation before implementing.

Dead end: a floor on follow-up minutes. A follow-up confirming a one-line fix in twenty seconds is
plausible for a model reading a diff it already knows, so only the initial review has a floor.
