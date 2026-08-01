---
date: 2026-07-29
agent: claude
roadmap: MO-26-07-28-008
outcome: shipped
summary: morpheus init scaffolds the repository; provisioning stays with the checklist, so init is blocked on nothing.
---

## The scoping decision

MO-008 as written said "scaffolds from templates, provisions GCP and Firebase, wires DNS and
Vercel, creates the repo". I shipped only the first clause.

The rest lives in someone else's console and needs credentials this command should not hold. More
usefully: MO-030's checklist already tracks every one of them, with a `how` line and persistent
state. Re-implementing that as imperative provisioning would duplicate it and be blocked on tokens.

**Drawing the seam at the repository boundary is what made this shippable today.** Every
infrastructure item is waiting on a credential; `init` waits on nothing.

## Why it was right to build this second

Every template exists because Evo or Darwin actually needed it. The inbox frontmatter shape, the
`.agent/` split, the placeholder READMEs in directories git would otherwise drop — none of that
would have been in a scaffold guessed at in advance, and the guess would have looked complete.

## Two bugs from running it rather than reading it

**`hq/brand/README.md` blocked the brand wizard.** The scaffold created a placeholder; the wizard
never overwrites; so the real README could never be written. Now a `.gitkeep`, which holds the
directory without claiming the name. General shape: when two commands can write the same path, the
one that runs first must not take the filename.

**The scaffolded inbox failed `inbox validate`.** No frontmatter. A project whose first CI run fails
on a file the tool itself wrote is worse than no scaffold, so there is now a test asserting the
output satisfies the validators — inbox, three product artifacts, and doctor.

## Also

`init` swallowed a registry failure with `.catch(() => 1)`. The usual cause is a prefix collision,
which is exactly what registration exists to catch, so hiding it defeated the point. Reported now.
