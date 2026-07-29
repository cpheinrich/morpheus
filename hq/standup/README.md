# Standups

One file per person. What an agent finished, and what it needs before it can continue.

| File | Whose |
|---|---|
| [`chris.md`](chris.md) | Chris |

## Why "standup"

It mirrors the ritual: **done, next, blocked**. "Status" named only the reporting half and said
nothing about the asking half — which is the half that actually blocks work. The name teaches
the format, so summary comes before blockers.

## Format

```markdown
---
person: chris
date: 2026-07-29
agents: [claude, codex]
previous: .agent/standup/chris-2026-07-29-0400.md
---

# Standup — 2026-07-29

Prose summary of what got done since the last check-in, and what is proceeding unblocked.

## ❗ 1. Something that needs a decision · `claude` · [RM-006](../product/roadmap/RM-006.md)

~ *(their previous reply)*

The answer, and what is needed.

~

## ✅ 2. Something already settled · `codex`

~ *(their previous reply)*

What was done. No reply slot — the item is closed.
```

- `❗` open — **must** end in an empty `~`
- `✅` done — **must not** offer one
- `~` is always a reply slot; reply after the empty one
- The agent tag is required; the `RM-###` link is optional, since not every item is a task

Run `morpheus standup validate` — CI runs it too, so the format cannot drift.

## One inbox per person, not per session

A person's file collects items from every agent working for them, tagged by agent, so Claude and
Codex running in parallel land in one place. Two agents share a working copy so writes
serialise; two *people* never touch the same file, so git never merges a standup.

Sessions are recorded in `.agent/journal/` — one entry per task.

## Adding a person

Create `<their-github-username>.md` with the frontmatter above and add a row to the table.
