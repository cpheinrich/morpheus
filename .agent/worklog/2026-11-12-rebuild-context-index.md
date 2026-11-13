---
date: 2026-11-12
roadmap: MO-26-11-12-22.53.21
tags: [engineering, agent-workflow]
summary: "Serve unchanged project records while the MCP rebuilds the context index."
---

The MCP keeps a ready source snapshot per worktree and kind filter. An edit detected at
search time starts a build using the existing atomic publication path. Searches in the
meantime return visibly partial results. They map chunk IDs against the original snapshot
and keep only citations whose source still matches the worktree. An exact record read
opens a changed file immediately. Further edits observed during a build replace the
queued snapshot. A build failure leaves the previous index usable and the next search
can retry. This reuses the in-process build tracking and the existing Tantivy worker.

A compiled stdio MCP session on a disposable Morpheus clone edited, added and deleted
tracked records and queried during two held builds. It also edited a second record while
a rebuild was in progress. Partial replies returned in 112–123 ms with the worker held.
Once released, the session found the new text and omitted removed text. The first search,
which had no ready index, took 1.82 s. The focused suites passed 40 tests. Typecheck, lint,
compile, roadmap generation and the enforced complexity check passed. The complexity
check reports an advisory in the trace serializer. The codebase-memory installer could
not activate with other sessions using it, so this task inspected source directly.
