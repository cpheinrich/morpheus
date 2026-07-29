---
date: 2026-07-29
agent: claude
roadmap: MO-030
outcome: shipped
summary: morpheus init status — a resumable, self-verifying setup checklist rather than a wizard.
---

## The question I answered differently

Chris asked whether onboarding steps should be roadmap tickets assigned to a person. I said no.
Roadmap items carry ids, claims, branches and PRs; setup steps carry none of those, and
twenty-five chores would dominate the board forever. Sharing a mechanism because two things are
both lists is how a tool acquires a shape nobody wants.

## The addition worth arguing for

He described a checklist you tick. I made half of it **detected**, and made hand-ticking a detected
item impossible.

The reason: a checklist that can be wrong about something it could have verified stops being read.
The first time someone ticks "CI wired" and it isn't, every other tick becomes a claim rather than
a fact. Detection also means the list stays true when work happens outside it — nobody has to
remember to come back and update the file after wiring a workflow.

## The null case

Detection returns `true`, `false`, or `null` for *could not check*, and the third one is the whole
design. A missing `gh` must not render as an unprotected branch — that sends someone to fix what was
never broken.

Third time this pattern has come up: GCP ids "taken" from a grep for `^ERROR`, `mergedPrs` returning
`null` versus `[]`, and now this. It is in `.agent/learned.md` as a rule rather than three anecdotes.

## Two bugs the tests caught

**The note parser read the generated description back as a user note**, because indented prose under
a checkbox was ambiguous between "what Morpheus wrote" and "what you wrote". Fixed with an explicit
`<!-- morpheus:notes -->` boundary, always emitted so there is an obvious place to write.

**Three tasks had a `how` under twenty characters** — "Sentry" is not an instruction. A test asserts
a floor, which is crude but catches exactly the laziness that makes a checklist useless.

## Found

Evo has no `pm-check` or `pr-check` workflow. The checklist reported it on the first run against a
real project, which is the argument for the whole thing.
