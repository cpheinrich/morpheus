---
date: 2026-07-29
agent: claude
roadmap: MO-022
outcome: shipped
summary: The brand package's required and optional sets are declared once and read by the prompt, the check, and the README.
---

## The gap

Chris asked whether the explore prompt makes the output format clear. It did not — it named four
paths and defined completeness for none of them.

## The property worth keeping

The list is declared in **one** place. The temptation was to write the required set into the
prompt string and separately into a checker, which would have been faster and would have drifted
within two changes. The drift would also have been silent: a prompt asking for something nothing
verifies is indistinguishable, from the outside, from a prompt asking for the right thing.

## Two judgements

**Existence is not completeness.** The wizard writes an empty `tokens.json`. A file-exists check
would go green on it, and an empty scaffold sitting beside a real design is worse than no file —
it looks finished in a listing. So the check reads the contents, and for `visual-system.md` it
looks for the generator's own placeholder sentences, which lets it name the unwritten section
instead of complaining about length.

**An unmet trigger is not a failure.** Optional entries never affect the exit code. `motion.md` is
not missing before anything animates; it is correctly absent. Marking it outstanding would train
people to ignore the output, which costs more than the missing file.

## Also

Told the session prompt to *stop* at the required set. Left alone, an agent asked for a brand will
happily invent a motion system and an illustration direction before a single screen exists — rules
written ahead of the thing they govern, which nobody follows.
