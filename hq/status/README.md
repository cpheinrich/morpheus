# Status inboxes

One file per person, not per session. The point is a single place to look — if status were
per-session you would read N files to find what needs you.

| File | Whose |
|---|---|
| [`chris.md`](chris.md) | Chris |

A person's file collects items from **every** agent working on their behalf. Each item is
tagged with which agent raised it, so `claude` and `codex` running in parallel land in one
inbox rather than two.

Sessions are recorded in `.agent/journal/` — one entry per task, which is where "what did this
particular run do" belongs.

## Adding a person

Create `<their-github-username>.md` and add a row above. Their agents write there; yours keep
writing to yours. Two people never edit the same file, so git never has to merge a status.
