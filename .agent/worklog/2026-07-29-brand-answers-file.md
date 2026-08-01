---
date: 2026-07-29
agent: claude
roadmap: MO-26-07-29-028
outcome: shipped
summary: answers.md is the single editable source; the wizard became one way to fill it rather than the only way.
---

## The reason it matters

Chris asked for a file you can edit instead of a purely sequential wizard. The structural reason is
worth writing down: **the answers refer to each other.** What it must never be is written against
how it should feel; the mission gets sharper once the audience is concrete. A prompt that demands
each answer before showing the next fights the way the thinking actually goes.

## The decision that mattered

Dropping `answers.json` rather than keeping it as a machine-readable sibling.

Keeping both was tempting — the JSON was already there, already read by two commands, and it would
have been a smaller diff. But two files means answering which one wins when they disagree, and
every answer to that question is worse than not having it. This package spends most of its effort
avoiding second sources of truth; adding one for convenience would have been the same mistake in a
new place.

## Small things worth keeping

**Write the file before asking anything.** Ctrl-C at question two now leaves a complete editable
file rather than nothing.

**Anchor on `<!-- morpheus:q key -->`, not heading text.** Someone will reword a heading to make it
clearer, and that should not break parsing. Invisible when rendered.

**Report every blank at once, and each only once.** The first version said both "not answered yet"
and Zod's "expected string, received undefined" for the same field — ten lines for five problems,
which reads as thoroughness and is noise.
