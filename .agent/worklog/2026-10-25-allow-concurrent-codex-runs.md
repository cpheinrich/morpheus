---
roadmap: MO-26-10-25-05.06.40
agent: codex
tags: [engineering, ai]
---

# Concurrent Codex delegation runs

Changed the Claude-coordinated bridge from one task-wide active `runId` to recorded run history
with active and recent-terminal views. Starts now admit different worktrees concurrently, refuse
a second writer in one working directory with the owning run id, and retain the global
`maxConcurrent` ceiling. Run-specific operations preserve their `runId` path; the convenience
default works for one active run and reports every id when several make it ambiguous.

Native Codex sessions and autonomous supervision counts remain keyed by working directory. An
explicit prior `runId` can target a `needs_input` continuation, while the existing cwd selection
keeps the single-run case unchanged. Session-end cleanup now stops every foreground Codex run
owned by that Claude session. Fresh configuration defaults to a 20% automatic-routing threshold;
Zod still preserves explicit thresholds already saved on disk.

Tests cover two active runs in distinct Git worktrees, a named same-worktree refusal, the global
cap, inspection of multiple active and recent terminal runs, run-specific lease renewal, exact
`needs_input` resumption and the 20% default. Documentation and both delegation skills describe
the concurrency boundary and explicit-id behavior.

The first package test attempt ran before the isolated worktree had package-local dependencies,
so Node could not resolve `ws` or the MCP SDK. `pnpm -C` followed the repository workspace and did
not materialize them; `pnpm --dir plugins/codex-claude install --ignore-workspace --frozen-lockfile`
installed the locked package dependencies. The next full run reached 114/115 passing, with the
only failure being macOS `/var` versus canonical `/private/var` in the new assertion. The test now
compares `realpath`, and its focused rerun passes 14/14. No installed copy under `~/plugins` was
modified.

Final verification:

- `pnpm -C plugins/codex-claude test` — 115/115 pass.
- `pnpm -C plugins/codex-claude check` — pass.
- `pnpm typecheck` — pass.
- `pnpm compile` — pass; no generated `dist/` change.
- `pnpm morpheus pm index` — pass; all indexes unchanged.

The repository-level Vitest suite was not run: this change does not touch the shared core paths
for which AGENTS.md permits the one full local run. The plugin's complete package suite is its
direct test surface.

## Review round 1 fixes

Commit: `Apply review fixes (MO-26-10-25-05.06.40)`.

- Reply routing now selects the session's sole `needs_input` run before applying a cwd default,
  rejects replies when none is awaiting input, and lists the run ids when several are awaiting.
  Both delegation skill copies now require the originating `runId` on a reply.
- All service task-record mutations now pass through a per-task in-process queue. Concurrent
  `thread.started` events for different worktrees therefore merge both native Codex session ids.
- Claude-session inspection now persists only active run ids plus the five newest terminal run
  ids, removes missing records, and repairs the legacy single `runId` pointer when it was pruned.

Review-fix verification:

- `node --test tests/reverse.test.mjs` — 16/16 pass.
- `pnpm -C plugins/codex-claude test` — 117/117 pass.
- `pnpm -C plugins/codex-claude check` — pass.

The independent reviewer's 42 sandbox failures came from denied process/socket operations; the
same complete package suite passes outside that sandbox here. The installed copy under
`~/plugins/codex-claude` remains unchanged.

## Review round 2 fixes

Commit: `Apply review round 2 fixes (MO-26-10-25-05.06.40)`.

The remaining review finding showed that inspection classified run history outside the task
mutation queue, so its later pruning write could overwrite a newly persisted active run id.
Inspection now re-reads and classifies history inside one queued transaction. The transaction
writes only when identity or retained history actually changes, keeps every active run, the five
newest terminal runs and up to five recent unresolved ids, and cannot race a start's queued
history update. This supersedes round 1's overly broad statement that all missing records are
removed: bounded recent missing ids are intentionally retained until their record resolves.

The regression test pauses inspection after its history snapshot, queues the same mutation used
to persist a newly launched active run, then releases inspection and proves the final task record
still contains the active id.

Review-fix verification:

- `node --test tests/reverse.test.mjs` — 17/17 pass.
- `pnpm -C plugins/codex-claude test` — 118/118 pass.
- `pnpm -C plugins/codex-claude check` — pass.
