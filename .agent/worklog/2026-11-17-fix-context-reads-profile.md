---
date: 2026-11-17
roadmap: MO-26-11-17-01.45.10
tags: [engineering, agent-workflow]
summary: "Overview sections are directly readable, reads name their continuation, read errors carry a reason, keyed checkouts attribute by repository key, and Claude's MCP results are credited."
---

# Fix context reads, profile attribution and Claude hook credit

## The ask

Implement the low-risk follow-ups to the [context audit](https://github.com/cpheinrich/morpheus/pull/716):
make overview links usable for an exact read and long reads recoverable, attribute task
worktrees and Factory checkouts to the right repository, record why a read failed and keep
the partial flag in the profile, and reproduce the missing Claude visibility before fixing it.

## What was built

- **Reads.** `get_context_overview` keeps each section's `href` and, where the specification
  is a local indexed record, adds `read` with the exact `path`, `from` and `to`, plus
  `sectionEnd` for a section longer than one read. A read cut
  short by its budget returns `next`, starting at the first line left out. A range over 100
  lines is still refused, now with the range to use. A `path#anchor` is refused with the
  plain path to read.
- **Attribution.** A Morpheus task worktree and a Factory checkout both carry the leading hex
  of SHA-256 over the repository's common Git directory. `deriveRepo` matches that key against
  the registered projects, so the current undotted layout, the dotted ones and Factory
  checkouts resolve to the repository whatever the directory is called.
- **Diagnostics.** A refused read is traced as `coverage`, `range`, `unavailable` or `other`.
  `context profile` reports those counts and the number of partial results per operation.
- **Claude visibility.** The read hook decodes the JSON string Claude Code passes for a
  structured MCP result, then verifies the excerpt against the source as before.

## Result

The Claude defect is real and affected the startup check, not only the metric. In this
worker's own Claude Code 2.1.322 session, four successful cited MCP calls left no `seen`
marker and no `visible` trace, and the startup check still refused the session. A hook added
temporarily to this worktree captured the live payload: `tool_response` is one string, the
serialized structured content. The released CLI gave that payload no credit in a disposable
clone; the compiled candidate credited it, and gave nothing once the cited record was edited.

On this device's transcripts since November 8, 155 of 678 sessions changed attribution. Every
one moved from a task, checkout or subdirectory name to its repository's name, none became unknown,
and no directory-shaped repository names remain.

## Behaviour changes

- `read_project_record` reports `truncated: false` when the record simply ends inside the
  requested range. It used to report `true`, which invited a pointless continuation.
- A keyed checkout that shares a registered project's name under a different key is now
  `(unknown)` in the profile instead of being merged into that project.
- The range and anchor refusals have new wording.
- Claude sessions now write `visible` trace rows and satisfy the startup check from MCP results.

## Dead ends and surprises

- The audit's guess that the Codex-only structured branch was the cause was close but not
  the mechanism. Claude does not pass an object with `structuredContent`; it passes a string.
- Tampering one citation of a search result does not withhold credit, because the other
  citations still verify. The fail-closed cases use a single-citation exact read.
- Resolving `path#anchor` inside the read tool was considered and dropped: `from` has a
  schema default, so the tool cannot tell a requested line from an omitted one.
- `morpheus codebase-memory install` could not index this checkout: the upstream installer
  stopped on `~/.codex/config.toml`, as in earlier work. Exact source reads were used.

## Open questions

- A host credits Claude results only after its installed CLI updates, because the hook runs
  the device's Morpheus. Until then a Claude session can be refused by the startup check
  after a successful MCP lookup; `morpheus context search` from the checkout is the way through.
- Only Claude Code 2.1.322 was observed. An older or newer client may shape the payload
  differently; the literal string and text-block shapes remain accepted.
- Input the tool schema rejects, such as line 0, fails before the handler and is not traced.
- A repository moved since a session ran has a different key. If the registry lists it under
  the same name, those older sessions read as `(unknown)`.

## Appendix: evidence by kind

| Kind | What it shows |
|---|---|
| Native in-session | This worker's session: armed and prompted markers, hook liveness from its Reads, server traces for its MCP calls, no `seen` marker, no `visible` row, startup check refusing. |
| Live hook capture | Two real PostToolUse payloads (one read, one search) from Claude Code 2.1.322. Keys: `cwd`, `duration_ms`, `effort`, `hook_event_name`, `mcp_server`, `permission_mode`, `prompt_id`, `session_id`, `tool_input`, `tool_name`, `tool_response`, `tool_use_id`, `transcript_path`. No `turn_id`. `tool_response` is a string that parses to the structured content. |
| Candidate replay | Disposable clone, captured payloads with only `cwd` repointed. Released CLI: liveness, no marker, check refuses. Candidate with the cited record edited: no marker. Candidate unmodified: marker, one `visible` row, check passes; the search payload adds a second row. |
| Actual-shape fixture | `tests/context-mcp.test.ts` rebuilds the captured envelope around real MCP results from the fixture server. |
| Synthetic | The oversize boundary (20,000 and 20,001 bytes), other-server tool name and failure-event cases are constructed, not captured. |

The capture hook was removed and `.claude/settings.json` restored before any commit. No user
or global setting was edited and no second model session was started.

## Appendix: checks

Thirteen hand-made mutants were each caught by the new tests: the decode removed, the size
cap moved to the decoded text, source verification skipped, `next` off by one, end of record
counted as truncation, the 100-line guard moved either way, the section cap, fence handling,
same-level section end, the trace allowlist, the partial count, and the summary's reason check.

The full suite ran once, before the last `sectionEnd` change to `overview.ts`: 160 files,
4,528 tests, all passing. After that change the focused files below passed, 319 tests in 10
files; `tests/context-mcp.test.ts` covers the only caller of the changed module. The scope is
every test that imports a changed module, plus the profile tests.

```sh
pnpm typecheck
pnpm exec vitest run tests/context-mcp.test.ts tests/context-task-start.test.ts \
  tests/session-evidence.test.ts tests/context-rollout-policy.test.ts \
  tests/context-search-hook.test.ts tests/cli-dispatch.test.ts tests/profile
pnpm test
pnpm compile
pnpm morpheus pm index
pnpm morpheus pm validate
morpheus complexity check
git diff --check
```
