---
date: 2026-11-08
roadmap: MO-26-11-08-00.21.37
tags: [engineering]
summary: "Cue and verify task retrieval in bounded startup."
---

The required core and task evidence serve different purposes. The prompt
hook cues search before implementation. The freshness gate checks that a
tool result actually contained a current, cited task excerpt before a
governed action. The exact-path command uses the same evidence format.
Full startup and clients with no working hook pair use their existing gate.
Local state stores session hashes and markers, without prompt or result text.

The focused suite exercises the cue, session isolation, empty or truncated
output, core exclusion, exact-path reads and the existing receipt backstop.
The first installer run flagged outdated event expectations. Updated those
expectations to cover the new hook for both providers.

The compiled CLI smoke test ran against an isolated tracked project with
both Tantivy and ripgrep. In each arm, the prompt hook emitted the cue,
`pm new` refused despite a fresh core receipt, and the same command
succeeded after the post-tool hook received the search result. The
focused suite passed 186 tests, including the native Tantivy cases.

Independent review reproduced two edge cases. The first lookup now
follows a session into a linked worktree, where the visible excerpt is
checked against that checkout. If the manifest or sparse checkout leaves
no usable task record, the prompt points to coverage and the existing
core gate remains usable. Both regression tests pass. The focused
follow-up covered 156 tests. The two-engine compiled CLI probe still passes.
