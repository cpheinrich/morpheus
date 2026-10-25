# Subject tags for tickets and worklogs

Morpheus owns subject metadata in its Git records, independent of any execution queue.
Roadmap items and worklog frontmatter accept an optional `tags` array:

```yaml
tags: [engineering, devops, infrastructure]
```

Use the same applicable subject tags on a new ticket and its corresponding worklogs. CI/CD and
infrastructure work includes `engineering` and `devops`; add narrower tags such as `ios`,
`security` or `infrastructure` when helpful. Other subjects can use `marketing`, `research` or
project-specific vocabulary. This is an open vocabulary, not a fixed organization chart.
Each tag is a lowercase slug beginning with a letter, containing letters/digits and single
hyphens, up to48 characters; an array holds up to16 unique tags. Invalid metadata is an error.

```sh
morpheus pm new roadmap "Recover scheduled release" --slug recover-release --tag engineering --tag devops
morpheus pm tagged engineering devops --json
```

The reader uses AND matching and returns file paths, record kind, subject tags, roadmap linkage
and title/summary. It reads explicit metadata, not a model's guess from prose. It also returns
parsing issues and a nonzero exit when tagged records are invalid, so unavailable context cannot look
like a clean empty search. Omit `--json` for a compact text list. `--dir` still selects the product
directory; worklogs remain under the current repository's `.agent/worklog`.

Old records need no migration, including prose-only or older partial-frontmatter worklogs.
The tag reader reports their unclassified count without imposing today's journal shape.
Missing tags mean unclassified, not irrelevant: use targeted
history/source searches when investigating an incident. Do not bulk label history from filenames
or role names. An explicitly reviewed historical classification can be a separate change.
`pm block` copies an item's current tags into its new worklog; authored worklogs carry their own
snapshot so changing a ticket later does not rewrite past classification.

Tags are subjects, not owners, claims, priorities, permissions or delivery evidence. They may
later project into Paperclip tasks, but that adapter cannot replace Git's record or authorize
execution. This change does not modify Paperclip or install a supervisor.

The DevOps role is available through `morpheus cto guide devops-engineer`. New projects receive
discoverable pointers for Codex and Claude. Existing projects can rerun `morpheus init` to add
missing pointers without overwriting local files, after updating their installed Morpheus CLI.
Already-authored instruction files stay intact; adopt the tagging paragraph deliberately in them.
