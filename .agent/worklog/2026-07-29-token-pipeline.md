---
date: 2026-07-29
agent: claude
roadmap: MO-26-07-29-039
outcome: shipped
summary: One token generator replacing three hand-rolled ones; verified byte-identical against cpheinrich.com.
---

## The trigger

Not a plan — a pattern noticed while retrofitting. Three projects had each written the same twenty
lines to turn brand tokens into CSS custom properties, and I only saw it because I had all three
open at once to fix the paths I broke.

Extract-on-second-use says two. This was three.

## What the three disagreed about

Reading them side by side was the design work:

- `cpheinrich.com` throws on arrays, emits primitives verbatim, filters a `meta` key
- `heinrichbros.com` hardcodes all 22 variable names, so a new token means editing the generator,
  and maps to semantic names (`color.vermilion` → `--ember`)
- Lakina ships `tokens.css` directly with no source

The generator takes the first one's shape because it is the only one that generalises. The second's
semantic mapping is the interesting idea and is deliberately **not** in the kit — one sample is not
a vocabulary.

## Verification that mattered

Ran it against `cpheinrich.com` and diffed the output against its hand-rolled script: identical
variable names *and* identical values, 79 tokens. That is worth more than any unit test here,
because it proves the thing it replaces is actually replaceable.

## Two choices

**Write nothing when the source has problems.** A stylesheet built from a half-read token file still
renders. That is the whole reason this class of bug survives to production.

**Emit TS as well as CSS.** A deleted custom property renders as nothing; a deleted TS key does not
compile. The stylesheet cannot catch its own gaps.

## A gap found on the way

`pm new` allocates ids from local files only. Chris had claimed MO-038 from another session, and
`pm new` handed me the same id — the claim check caught it, but only after I had written the file.
Worth fixing: allocation should consult remote claims, not just the working copy.
