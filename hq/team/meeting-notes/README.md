# Meeting notes

**A summary, never a transcript.** Whoever takes the notes — usually a live Claude or Codex session
in the meeting, sometimes Granola — writes them into the format below.

That is the decision the whole folder rests on. A transcript is high volume and low signal, and
storing transcripts would make an agent's context *worse*: it would read more and know less. What is
worth keeping is what was decided, what someone has to do, and enough of the reasoning that a
decision can be argued with later.

## The format

One file per meeting: `PREFIX-YY-MM-DD-HH.MM.SS-short-handle.md`.

**The timestamp is when the meeting started, not when the note was written.** Roadmap ids come from
the creation clock because nothing better exists; a meeting has a real event time, and using
creation time would sort notes by when somebody got round to writing them. Use the wall clock of the
people in the room — a 09:30 meeting in Berlin is `09.30.00` — and put the offset in `occurred`, so
the absolute instant is still recoverable.

```markdown
---
id: MO-26-08-03-09.30.00
title: "Cloudflare account consolidation"
occurred: "2026-08-03T09:30:00-07:00"
attendees: [cpheinrich]
recorded_by: claude
source: session
duration_minutes: 45
roadmap: []
redacted: true
created: 2026-08-03
---

## Context

Why this meeting happened and what a reader needs to know to follow the rest. Two or three
sentences. Assume the reader was not there and does not know the backstory.

## Agenda

Optional. Include it when there was one; do not invent one afterwards.

## Discussion

What was actually talked through, and — more importantly — **why**. Reasoning that could have gone
the other way is the part worth keeping; a conclusion with no reasoning cannot be revisited, only
obeyed.

Not a play-by-play. Nobody needs "Chris said X, then Alex said Y".

## Decisions

Settled choices, one per bullet, each with its reason. These are candidates for
`.agent/decisions.md` — write them so they could be promoted verbatim.

## Action items

Who does what. Name a person by GitHub handle. An item nobody owns is not an action item; it is a
wish, and it belongs under Discussion.

## Roadmap items

Work that should be filed on the board, with enough detail for `morpheus pm new roadmap` to be run
against it. Once filed, put the ids in the `roadmap:` frontmatter field.
```

## Before you commit: the redaction pass

`redacted: true` is a claim you are making, and `morpheus team validate` refuses a note without it.
It means you have done both passes below.

### 1. Strip anything that is not about this project

Meetings open with catch-up. Someone's holiday, a health thing, how the kids are, an aside about a
different company. **All of it goes.** Not summarised, not abbreviated — removed.

The test: *would this sentence help someone understand the project?* If the honest answer is "no,
but it is nice colour", cut it. Colour is what makes a record too long to read, and too long to read
is the same as not written.

Also cut: anything about a **different** project. A meeting that covered two projects gets two notes,
each holding only its own half, or one note in the project that owns the meeting and nothing in the
other.

### 2. Keep it PG, and keep it non-incriminating

Write as though the people in the meeting will read it, because they will, and as though someone
outside it might, because they might.

- **No profanity**, no matter who said it.
- **No frustrations about named people**, inside or outside the company. "The vendor has been slow"
  is fine and useful; a character assessment of the person at the vendor is not.
- **Nothing that would embarrass a participant** if read back to them, or read by the person being
  discussed.
- **Nothing legally exposed** — speculation about a competitor's conduct, anything about someone's
  employment status, anything a lawyer would rather you had phrased carefully. If it matters, say the
  *substance* neutrally and leave the heat out.
- **No credentials, keys or personal contact details.** Those have three homes already (§13) and a
  meeting note is none of them.

The bar is not "technically defensible". It is **would you be relaxed if this were read aloud** — to
the team, to the person it is about, or in a year by somebody who was not there.

### 3. Public repositories

**For a public repo, assume a meeting about that project can be summarised in public.** That is not a
new exposure: issue threads, pull request reviews and commit messages on a public repo are already
public discussion of the same work, and a redacted summary says less than a PR review usually does.

What changes in a public repo is only that passes 1 and 2 stop being tidiness and become the actual
gate. Apply them harder, not differently.

**If a meeting genuinely cannot be summarised safely in public, do not write a sanitised version that
implies more was agreed than the note shows.** Write nothing, and put a line in the inbox saying a
note was withheld and why. A misleading record is worse than a missing one.

## What happens to a note afterwards

A note is **raw input**, in the sense of `.agent/README.md`: it feeds distillations rather than being
read directly.

| From a note | Goes to |
|---|---|
| Decisions | `.agent/decisions.md` |
| Action items | roadmap items, via `morpheus pm new roadmap` |
| Things learned about how something behaves | `.agent/learned.md` |

A note whose outputs never get promoted is an archive. That is not useless, but it is much less
useful than it looks, and it is the failure this folder is most likely to have in six months.
