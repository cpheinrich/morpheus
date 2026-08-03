---
date: 2026-08-03
agent: claude
roadmap: MO-26-08-03-13.25.57
outcome: shipped
summary: The whole value of this item was a framing I got wrong and Chris corrected — recording a permanent default as a deviation manufactures phantom work.
---

## The dead end, which is the entire point of the entry

Chris asked where the Anthropic key should live. I read §13.1, found it already specified GitHub
Actions secrets as a *cache of GSM* kept aligned by `morpheus secrets push --ci`, and recommended
recording the current state — the key set directly in GitHub — as a **deviation** from that design.

That was wrong, and the reason is a rule already sitting in `decisions.md` two hundred lines above
where I was typing:

> a deviation nobody recorded is indistinguishable from the canonical choice

The inverse costs just as much. **A canonical choice recorded as a deviation manufactures phantom
work.** A future agent reads "deviation", infers a migration is pending, and builds
`morpheus secrets push --ci` to close a gap that *is* the design. For a secret only CI reads, the
sync's source and destination are the same place.

Chris's reply was one line — *"we will always use github secrets for keys needed during CI — why not
just make that a named default?"* — and it was obviously right the moment it was said.

## Why I got it wrong, which is the useful part

I treated the architecture as the target and reality as the shortfall. That is usually the correct
reading here: `architecture.md` says of itself that it is more current than the code, and most gaps
between the two are genuinely work not yet done.

But §13.1 was written before anything in CI needed a secret. Its two-way split — code versus human —
had never been tested against a third reader, and when one appeared it got filed under "code"
because that was the nearest existing bucket. **The spec was not ahead of the code; it was simply
written for a world with one fewer case in it.**

The tell I missed: the mechanism that would have closed the gap (`secrets push --ci`) had never been
built, and nobody had wanted it. A specified-but-unbuilt command is sometimes a backlog and
sometimes a design that did not survive contact. Distinguishing them is the judgement, and I made it
by default rather than deliberately.

## What the reviewer caught

Three, all correct, and the first was the same failure this item is about — **I wrote a cross
reference to `§7.4a`, which does not exist.** Section 7 runs 7.1 to 7.9. One paragraph after arguing
that a command named in the architecture reads as a command that exists, I invented a section
number. The external-contributor flow lives in `AGENTS.md` and has no architecture section, so there
was no right target either.

It also caught a factual error I *introduced*: rewriting the access row as "Native mount in Cloud
Run / Vercel" when **Vercel does not read GSM at all** — it has its own encrypted environment store,
so values are pushed in or fetched at boot. The line I replaced had been accurate. In a section this
PR was deliberately promoting to authoritative, that is the one line a future agent would have acted
on.

And the placement minor worth keeping: my entry had been inserted between the Sonnet decision and
its same-day reversal, so a scanner could read the first and miss that it was undone. Moved.
