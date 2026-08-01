---
id: MO-26-08-01-054
title: "Every project points back at Morpheus, in AGENTS.md and README.md"
status: shipped
priority: P1
goal: MO-G-2026-Q3-01
owner: agent
prs: [52]
created: 2026-08-01
updated: 2026-08-01
---

> Migrated from `MO-054` to `MO-26-08-01-054` (MO-057). References to `MO-054` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

Directed by Chris on 2026-08-01.

A Morpheus project's conventions are legible only if you have read Morpheus. Today most of them
do not say so. `cpheinrich.com`'s `AGENTS.md` tells an agent to run `morpheus pm claim CPH-001`
without ever saying what Morpheus is or where to find it — the one reference is a command name.

The audience is agents arriving with **zero context**: code review agents, which spin up with no
memory by design, and agents working for collaborators. To them the structure looks arbitrary,
and arbitrary-looking structure gets confidently "corrected" — a generated file hand-edited, an
id renamed out from under a branch, a worklog deleted as clutter, `pm claim` bypassed into a
branch collision.

## The root cause, not just the instances

**`morpheus init` never scaffolds a `README.md`.** That is why `cpheinrich.com` has none, and why
`darwin` (1 line) and `evo` (2 lines) have nothing a human or an agent can read. Fixing the five
existing repos by hand fixes today; templating it fixes the class, so both happen.

## What changes here

- `init` scaffolds `README.md`, carrying a **Built and managed with Morpheus** section
- the `AGENTS.md` template gains a **This project is managed by Morpheus — read that first**
  section, immediately after the title, with links to `architecture.md` and Morpheus's
  `AGENTS.md`
- both blocks tell an agent that finds a gap in Morpheus to **open an issue or PR on Morpheus**
  rather than working around it locally

`init` never overwrites, so a repo that already has a `README.md` keeps it. The five existing
projects are updated by their own PRs.

## Why the upstream instruction matters

A local workaround fixes one project, hides the defect from every other one, and leaves the next
agent to rediscover it. Morpheus improves only if the projects built on it report back — which
turns every agent working on any Morpheus project into a contributor to Morpheus.

## Test plan

`init` is already covered by `tests/init.test.ts`. Add cases asserting a `README.md` is written,
that both templates carry the Morpheus link, and that an existing `README.md` is not clobbered —
that last one because "never overwrites" is the property the whole command rests on.
