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

## Controller verification

The compiled hook initially credited an excerpt inside a serialized error. The controller
made the decoder require a successful result and added regression cases for a serialized
error and an empty outcome carrying a valid excerpt. A disposable replay confirmed that the
released hook ignores the observed JSON shape and the candidate credits a successful result
after source validation. Altered citations and errors earned neither startup credit nor a
visibility trace. All 319 focused tests passed after this correction, as did typecheck,
compilation, complexity enforcement, PM index and validation, and the diff check.

## Independent review

Independent review cleared the Claude hook, read ranges, checkout attribution and trace summaries. All 197 tests in the reviewer's focused suite passed, and the reviewer verified the compiled output.

```morpheus-review
{
  "version": 2,
  "base": "b7ebe5c7db2d1c411868ba359745139b559fe32f",
  "reviewed": "e83a1c0c1490889a3d7d4257635b8797f61bf0db",
  "covered": "e83a1c0c1490889a3d7d4257635b8797f61bf0db",
  "authorSession": "01a1df5e-48f0-7c92-aeb5-b5eae423a91c",
  "reviewerSession": "a24787b6-2aed-4069-8ee9-958befa5efeb",
  "risk": "normal",
  "elapsedMinutes": 2.4656333333333333,
  "timing": {
    "source": "runner",
    "durationMs": 147938,
    "evidence": "Claude Factory review run c615e205-3d65-4cfb-b583-c67fb04ef972 recorded duration_ms in its successful terminal result."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the Claude hook, read ranges, checkout attribution and trace summaries. All 197 tests in the reviewer's focused suite passed, and the reviewer verified the compiled output.",
  "contextRead": [
    "hq/product/roadmap/MO-26-11-17-01.45.10-fix-context-diagnostics.md",
    ".agent/worklog/2026-11-17-fix-context-reads-profile.md",
    ".agent/worklog/2026-11-08-expose-context-mcp.md",
    "docs/runbooks/context-search.md",
    "architecture.md"
  ],
  "findings": [
    {
      "id": "R01",
      "severity": "minor",
      "description": "The heading scanner treats backtick and tilde fences as interchangeable. A fence marker of the other type inside a code block can affect section boundaries in a future spec.",
      "paths": [
        "src/context-search/overview.ts"
      ],
      "disposition": "disputed",
      "response": "The scanner serves seven fixed anchors in the indexed Morpheus specification, and the reviewer verified all of them in the current file. A general Markdown parser change is outside this fix."
    },
    {
      "id": "R02",
      "severity": "minor",
      "description": "For a registered root using a symlink or separate Git directory, hashing the registered path plus /.git may not reproduce the worktree key.",
      "paths": [
        "src/profile/derive.ts"
      ],
      "disposition": "disputed",
      "response": "Standard registered checkout roots match the actual key and the old and current layouts have regression coverage. The few nonstandard layouts can stay unattributed until there is authoritative Git directory identity, preventing sessions from being assigned to a same-named repository."
    }
  ]
}
```
