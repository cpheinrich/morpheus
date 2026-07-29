# `.agent/`

What agents know, and what they and the humans have already worked out.

**Read `decisions.md` and `learned.md` at the start of a session.** The other two directories
are raw record — go there when you need the context behind a distilled line, or to check
whether something was already asked.

## Structure

Two raw logs, each feeding exactly one distillation:

| Raw | Feeds | Answers |
|---|---|---|
| `inbox-archive/` — past cycles of `hq/inbox/`, with replies | `decisions.md` | *What did we decide, and why?* |
| `worklog/` — what was attempted and learned per task | `learned.md` | *What do we know about how this behaves?* |

```
.agent/
├── decisions.md          settled choices and their reasoning  ← read first
├── learned.md            technical facts and gotchas          ← read first
├── inbox-archive/        2026-07-29-0407-cpheinrich.md
└── worklog/              2026-07-29-evo-retrofit.md
```

### The pairing

`hq/inbox/<handle>.md` is live; **`.agent/inbox-archive/` is where a cycle goes once it has
been replied to and acted on.** Same documents, past tense — the name carries the stem so the
relationship is visible without reading this file.

Archive filenames lead with the date (`YYYY-MM-DD-HHMM-<handle>.md`) so the directory sorts as
one project-wide timeline rather than per-person threads. The handle is last, only to keep two
people on the same day distinct.

`worklog/` has no live counterpart to move from. A roadmap item stays in
`hq/product/roadmap/` with `status: shipped` — the worklog is a *separate* record of what was
learned doing it, including research and dead ends that produced no item at all. That is the
whole reason it exists: git history already covers work that shipped.

## Why distil at all

The raw directories grow without bound; the distilled files are meant to stay short. Nobody
should read forty archived cycles to learn that we decided against publishing to npm.

When a reply settles something durable, promote one line to `decisions.md`. When a worklog
entry surfaces a fact that will bite again, promote one line to `learned.md`. Then the raw
record is only needed for archaeology.

**Pruning:** when either directory gets long, fold anything still load-bearing into its
distillation and delete the old files.
