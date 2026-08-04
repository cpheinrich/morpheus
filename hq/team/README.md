# Team

Who collaborates on this project, and what passed between them.

`hq/` is otherwise organised by business **function** — product, brand, marketing, finance, ops.
This folder is a **medium**: one meeting covers three functions, so it belongs to none of them.
Inboxes were always the first member of this category, which is why they sat at the top of `hq/`
rather than under a function.

| Path | What |
|---|---|
| [`members.md`](members.md) | The roster — handles, names, and how to work with each person |
| `<handle>.md` | That person's live inbox — the human↔agent exchange |
| [`meeting-notes/`](meeting-notes/) | Distilled meeting summaries, never transcripts |

## Everything here is raw input to a distillation

`.agent/README.md` pairs each raw log with exactly one distillation — `inbox-archive/` feeds
`decisions.md`, `worklog/` feeds `learned.md`. Meeting notes feed both, and their action items feed
the roadmap.

**Nothing in this folder is meant to be read in bulk by an agent.** A note whose decisions were never
promoted is an archive; an agent that reads every archive knows less, not more. The promotion is the
product.

## Inboxes

One file per person, named by GitHub handle. What an agent finished, and what it needs before it can
continue — in practice, a todo list.

| File | Owner |
|---|---|
| [`cpheinrich.md`](cpheinrich.md) | Chris Heinrich |

`morpheus inbox validate` enforces the shape: every item is exactly one of `❗` open or `✅` settled,
open items carry an empty `~` reply slot, numbering is dense, and prose comes before the first item.

## Validation

```sh
morpheus inbox validate    # inbox shape
morpheus team validate     # roster, meeting notes, and attendees that resolve
```
