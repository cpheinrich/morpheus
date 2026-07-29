---
date: 2026-07-29
agent: claude
roadmap: MO-026
outcome: shipped
summary: brand status no longer demands the second source of truth the generator refuses to create.
---

## How it was found

Not by a test. By generating a package with Evo's real answers — `visualSource` set — and reading
the output before handing it to Chris. Every test passed the whole time; they all used answers
without a visual source.

This is the third time in this project that seeding real content found something the suite did
not, after the YAML date coercion and the colon-in-title parse failure. **Worth treating as a
habit rather than three coincidences: run the thing on real input before calling it done.**

## The bug

`generateBrand` refuses to scaffold `tokens.json` when `visualSource` is set, because a second
token file beside a live system is the worst outcome the command can produce. MO-022 then added
`tokens.json` to the required set unconditionally. So the generator declined to create the file and
the checker reported it missing — and following the checker means creating exactly the second
canonical source §15.1a exists to prevent.

Two halves of the same feature, written a few hours apart, disagreeing about the same file.

## The fix, and the one I rejected

Added a `delegated` state: required, satisfied elsewhere on purpose, rendered with where.

The easier fix was to drop `tokens.json` from the required set whenever `visualSource` is set. That
reports the same package as complete while saying nothing about where the tokens live — silence
where the reader needs an address.
