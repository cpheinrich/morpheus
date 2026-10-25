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
