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

## What changed between the proposal and the build

Chris settled all three open questions in one reply: `hq/team/`, move the inbox in, and have the
heartbeat scan for meeting context. Two things then surfaced that the proposal had not.

**The roster cannot be YAML.** `yaml` is not a runtime dependency and `js-yaml` is only a dev one —
and `morpheus-kit` ships to every project, so one file is not worth a dependency in all of them.
`members.md` with frontmatter is what `gray-matter` already parses, and it keeps `hq/` uniform. The
proposal had written `members.yaml` without checking, which would have been a dependency added for
aesthetics.

**Three readers misread the roster as an inbox.** Inboxes sit at the root of `hq/team/`, so anything
else at that root has to be excluded by name — and `inbox validate`, `doctor` and `pm block`'s owner
inference each had their own hand-written `!== "readme.md"`. All three reported the roster as a
broken inbox, in the same afternoon, for the same reason. One exported `TEAM_RESERVED` and a test
asserting nobody re-lists it.

That is the **fourth** time this week the same root cause has appeared: a value written twice and
drifting. The branch-id pattern, the fetch arguments, `today()`'s timezone, and now this. The pattern
is specific enough to be worth naming — it happens when a rule is *obvious enough to retype*, which
is exactly when nobody thinks to share it.

## The one the sample note caught

Writing sample content immediately hit the YAML-Date trap the repo already documents: unquoted
`occurred: 2026-08-03T09:30:00-07:00` parses as a Date, and the note failed with "expected string,
received Date". `isoDate` exists for precisely this one layer up, so `isoDateTime` mirrors it — with
the offset preserved rather than normalised, because a note's id reads as the wall clock of the room.

Worth noting the sample earned its place by finding that before any real meeting did.

## The review finding that would have broken five repos

The reviewer caught that merging this as written would have **reddened CI in every project repo**.
The reusable workflows pin `@main`, `pm-check.yml`'s `inbox-dir` default had moved to `hq/team`, and
`inbox validate` exits 1 on a missing directory. So the moment this merged, five repos still on
`hq/inbox/` would fail a step for a directory that is absent *for the documented reason* — Morpheus
migrates first by design.

I had reasoned about the migration order and not about the window it creates. "Morpheus first, then
the others" is a sequence, and a sequence has a middle where both states are live; the tooling has to
accept both or the sequence is a break. `LEGACY_INBOX_DIR` and a fallback in `inbox validate`, to be
deleted once the registry has moved.

## And the one in the gate itself

`redacted: z.boolean().default(true)` — so **omitting** the field passed. The only note refused was
one that explicitly declared it had skipped the redaction pass; the person who forgets the line, who
is the entire population the field exists for, sailed straight through. Two documents said the
opposite of the code, including the README sentence claiming `team validate` refuses a note without
it.

`.default(false)` is the polarity the rest of the PR argues for — `isRecordsOnly`'s `length > 0`
guard is the same principle one file over: **silence must not read as assent.** I wrote that comment
and then defaulted the other way in the same change.

Third finding worth keeping: my stale-path guard checked *one file*, and three more references
survived it — including an onboarding instruction whose own detector disagreed with it, so following
the printed step could never complete the task. The guard was written against the instance I had just
fixed rather than the class. That is the fourth time this week; it is apparently the default mistake
when writing a test immediately after a fix.
