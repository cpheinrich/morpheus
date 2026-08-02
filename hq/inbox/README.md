# Inboxes

One file per person, named by GitHub handle. What an agent finished, and what it needs before
it can continue — in practice, a todo list.

| File | Owner |
|---|---|
| [`cpheinrich.md`](cpheinrich.md) | Chris Heinrich |

## Format

```markdown
---
owner: cpheinrich
date: 2026-07-29
agents: [claude, codex]
previous: .agent/inbox-archive/2026-07-29-0400-cpheinrich.md
---

# Inbox — 2026-07-29

Prose summary of what got done since the last check-in, and what is proceeding unblocked.

## ❗ 1. Something needing a decision · `claude` · [MO-006](../product/roadmap/MO-26-07-28-006-kit-analytics-posthog-setup.md)

~ *(their previous reply)*

The answer, and what is needed.

~

## ✅ 2. Something settled · `codex`

~ *(their previous reply)*

What was done. No reply slot — the item is closed.
```

- `❗` open — **must** end in an empty `~`
- `✅` done — **must not** offer one
- `~` is always a reply slot; reply after the empty one
- Agent tag required; `RM-###` link optional, since not every item is a task

`morpheus inbox validate` enforces all of it, and CI runs it.

## Why "owner"

Not *author* — the agent did the writing. Not *manager* — collaborators are peers, and on
Lakina nobody manages anybody. Owner works at any scale.

## One inbox per person, not per session

A person's file collects items from every agent working for them, tagged by agent, so Claude
and Codex running in parallel land in one place. Two agents share a working copy so writes
serialise; two *people* never touch the same file, so git never merges an inbox.

Work is recorded in `.agent/worklog/` — one entry per task.

## Archives

Each replied-to cycle is archived to `.agent/inbox-archive/YYYY-MM-DD-HHMM-<handle>.md`. Date leads so
the directory sorts as one project-wide timeline; the handle is last only to keep two people on
the same day distinct.

## Adding a person

Create `<their-github-handle>.md` with the frontmatter above and add a row to the table.
