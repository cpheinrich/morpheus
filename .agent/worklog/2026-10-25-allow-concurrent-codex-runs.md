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

## Independent review

Independent review (three turns) of the concurrent-Codex-runs change found two blocking defects in turn 1 (needs_input replies could target the wrong worktree; concurrent thread.started writes lost codexSessions entries) plus unbounded run-id growth, then a pruning race in turn 2; all were fixed with regression tests that exercise the adversarial orderings, and turn 3 cleared the change with no new findings.

Reviewer: a fresh Codex session (gpt-5.6-sol, high effort) launched by the coordinating Claude session with the `morpheus review prepare` packet and no author context, resumed for turns 2 and 3. Timings are launcher wall clocks around `codex exec`. Head 15ab0154 is a plain trunk merge after the covered commit.

```morpheus-review
{
  "version": 2,
  "base": "e4ea3aa6fe14b3a9740efa1bde8ccd94c56b7d27",
  "reviewed": "6b68d7ceef3e48d711edaa9b650b2e57eac04cfa",
  "covered": "e9f63c27472bae4dd9fdced01724480535779199",
  "authorSession": "7dfbcb4c-6fd4-5e43-bba6-aea6a0d1b6e5",
  "reviewerSession": "01a172fa-b01a-7f00-917e-8b0918925151",
  "risk": "normal",
  "elapsedMinutes": 7.066666666666666,
  "timing": {
    "source": "runner",
    "durationMs": 424000,
    "evidence": "codex exec (gpt-5.6-sol, high) thread 01a172fa-b01a-7f00-917e-8b0918925151; launcher wall clock start 2026-10-25T12:13:14Z, end 2026-10-25T12:20:18Z"
  },
  "outcome": "complete",
  "summary": "Independent review (three turns) of the concurrent-Codex-runs change found two blocking defects in turn 1 (needs_input replies could target the wrong worktree; concurrent thread.started writes lost codexSessions entries) plus unbounded run-id growth, then a pruning race in turn 2; all were fixed with regression tests that exercise the adversarial orderings, and turn 3 cleared the change with no new findings.",
  "findings": [
    {
      "id": "F1-reply-wrong-worktree",
      "severity": "substantive",
      "disposition": "fixed",
      "paths": [
        "plugins/codex-claude/src/service.mjs",
        "plugins/codex-claude/claude-plugin/skills/delegate-to-codex/SKILL.md"
      ],
      "description": "A needs_input reply without runId resolved from the Claude session's cwd and reply metadata was accepted even when the selected run was not awaiting input, so a reply meant for worktree B could resume or launch worktree A; the skill text omitted runId on replies.",
      "response": "Replies now target only runs in needs_input, default when exactly one is waiting, and refuse naming the ids when several or none are; the skill passes runId (5e3885f3)."
    },
    {
      "id": "F2-codexsessions-lost-write",
      "severity": "substantive",
      "disposition": "fixed",
      "paths": [
        "plugins/codex-claude/src/service.mjs",
        "plugins/codex-claude/tests/reverse.test.mjs"
      ],
      "description": "Concurrent thread.started events did unlocked read-modify-write of the task JSON, so two runs discovering Codex sessions together could overwrite each other's codexSessions entry (reproduced by the reviewer).",
      "response": "A per-task mutation queue serialises task-file writes; a Promise.all regression test exercises the race (5e3885f3)."
    },
    {
      "id": "F3-runids-unbounded",
      "severity": "minor",
      "disposition": "fixed",
      "paths": [
        "plugins/codex-claude/src/service.mjs",
        "plugins/codex-claude/tests/reverse.test.mjs"
      ],
      "description": "Terminal run ids were truncated only in the returned view while task.runIds grew forever and every inspect scanned every historical run.",
      "response": "Persisted history is pruned to active runs plus five recent terminal runs (5e3885f3); the pruning itself was then found racy (F4) and moved inside the queue (e9f63c27)."
    },
    {
      "id": "F4-prune-race",
      "severity": "substantive",
      "disposition": "fixed",
      "paths": [
        "plugins/codex-claude/src/service.mjs",
        "plugins/codex-claude/tests/reverse.test.mjs"
      ],
      "description": "Pruning computed runs and retained ids outside the mutation queue and then overwrote runIds, so an inspect snapshot followed by a concurrent start could erase the new active run from persisted history (reproduced in turn 2).",
      "response": "Classification and pruning run inside one queued transaction, write only when needed and keep active plus bounded recent or missing ids; a regression test pauses inspection after its snapshot, enqueues the start, then releases it and asserts the active id survives (e9f63c27)."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "01a172fa-b01a-7f00-917e-8b0918925151",
      "commit": "5e3885f34db6a35cf28be7b6550beff534357d11",
      "scopeReason": "Author fixes for F1, F2 and F3.",
      "outcome": "blocked",
      "elapsedMinutes": 2.8666666666666667,
      "timing": {
        "source": "runner",
        "durationMs": 172000,
        "evidence": "codex exec (gpt-5.6-sol, high) thread 01a172fa-b01a-7f00-917e-8b0918925151; launcher wall clock start 2026-10-25T12:27:01Z, end 2026-10-25T12:29:53Z"
      },
      "summary": "F1 and F2 resolved, F3 partially: pruning raced a concurrent start and could drop the active run from persisted history (F4), blocking."
    },
    {
      "reviewerSession": "01a172fa-b01a-7f00-917e-8b0918925151",
      "commit": "e9f63c27472bae4dd9fdced01724480535779199",
      "scopeReason": "Author fix for F4.",
      "outcome": "cleared",
      "elapsedMinutes": 3.1666666666666665,
      "timing": {
        "source": "runner",
        "durationMs": 190000,
        "evidence": "codex exec (gpt-5.6-sol, high) thread 01a172fa-b01a-7f00-917e-8b0918925151; launcher wall clock start 2026-10-25T12:35:45Z, end 2026-10-25T12:38:55Z"
      },
      "summary": "F4 resolved inside the queued transaction with a genuinely interleaved regression test; earlier fixes still pass; no new findings; clear."
    }
  ]
}
```
