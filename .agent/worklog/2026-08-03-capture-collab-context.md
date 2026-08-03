---
date: 2026-08-03
agent: claude
roadmap: MO-26-08-03-14.18.25
outcome: research
summary: A proposal, not a build. The folder question Chris asked was the smallest decision in it; the load-bearing ones are raw-versus-distilled and the privacy gate on chat capture.
---

## What was actually asked, versus what was asked about

Chris asked where a `meeting-notes/` folder should live — `hq/team/`, a renamed `inbox/`, or `ops/`
— and described a group-chat archive with assets in GCS.

The folder is the least consequential part. Two things decide the design and neither was in the
question:

**`hq/` is organised by business function, and this material is a medium.** Product, brand,
marketing, finance, ops are *what the work is about*. A meeting is not a function — one meeting
covers three of them. The tell that a second category already exists: `hq/inbox/` sits at the top of
`hq/` rather than under a function, and always has, because it is a record of communication rather
than a body of work. So the proposal is not inventing a category; it is giving the existing
one-member category a second member.

**Raw versus distilled is the real risk.** §7.5's split — `inbox-archive/` feeding `decisions.md`,
`worklog/` feeding `learned.md` — is the best idea in the records design, and transcripts and chat
logs are unambiguously *raw*: high volume, low signal, mostly irrelevant within a week. Landing them
as a third thing an agent must read makes context **worse**, because the agent reads more and knows
less.

That reframes the whole request. The valuable half is not the capture; it is the edges out of it —
a meeting's decisions promoting to `decisions.md`, its action items becoming roadmap items. Without
those it is an archive, and MO-048's rule applies directly: do not declare a field until something
traverses it.

## The thing I would have got wrong

My first instinct was to reuse the roadmap id scheme wholesale — `timestampId` at file-creation
time. Wrong for meetings: a meeting has a **real event time**, and creation-time ids would sort
notes by when someone got round to writing them rather than by when things were said. Same format,
different source. Worth stating explicitly in the proposal because an unstated difference between
two things that look identical is how they quietly diverge.

## What I deliberately did not propose

Moving `hq/inbox/` into `hq/team/`, which is the right end state. It is a migration across six
repos plus `inbox validate`, `init`, `check pr`'s records paths, `src/paths.ts`, the tests and every
archive reference — for adjacency, before there is anything to be adjacent to. *Extract on the
second use* applies to directory structure as much as to code.

## Not a decision yet

Filed as a proposal at `status: review` with no code, because the folder layout is cheap to change
now and expensive after six repos have one. `outcome: research` rather than `shipped`: this produced
a document and no behaviour.
