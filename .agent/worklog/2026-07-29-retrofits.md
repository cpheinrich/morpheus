---
date: 2026-07-29
agent: claude
roadmap: MO-26-07-29-034
outcome: shipped
summary: Retrofitted the three remaining projects with morpheus init; each one found a bug.
---

## The retrofits

`cpheinrich.com`, `heinrichbros.com` and `lakina`, all via `morpheus init` rather than by hand —
which is what the never-overwrite rule was for.

Each surfaced something:

- **cpheinrich.com** — nine tracked PNGs, against a scaffolded `.gitignore` carrying a blanket
  `*.png`. A rule earned by one project's incident is not a good default for every project.
- **heinrichbros.com** — its own `AGENTS.md` already existed and was correctly preserved. Its brand
  uses `myth.md` / `symbols.md` / `theme.json`, which do not map onto the Morpheus package. Left
  unrenamed: that mapping is a content decision.
- **lakina** — a Python/uv project with a real `CLAUDE.md`. Merged it into `AGENTS.md` and
  symlinked, and appended the convention checks to its existing `ci.yml` rather than adding a second
  workflow.

## The bug lakina found

After scaffolding, lakina had `AGENTS.md` and a separate real `CLAUDE.md` — the exact state the
symlink convention prevents. The onboarding detector checked that both paths exist and called it
done.

**Third time today.** `tokens.json`, then `goal`/`inbox`, now this. The pattern is always a cheap
check standing in for the thing it was meant to verify, and it keeps recurring because the cheap
check is one line and the real one is five.

The general rule, now that it has three instances: **when writing a detector, ask what a false
positive looks like.** `access()` returning true is not evidence that a convention is being
followed.

## What retrofitting proved about init

Three real repositories, none of them Node, all with existing conventions, and nothing was
overwritten or broken. The two commands *initialise* and *retrofit* being the same command held up.
