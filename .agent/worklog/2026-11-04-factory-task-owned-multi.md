---
date: 2026-11-04
roadmap: MO-26-11-04-20.01.14
tags: [engineering, devops, factory]
---

# Factory task-owned multi-repo workspaces

## The ask

Chris approved one persistent worker conversation per task that may write in several repositories.
Each repository gets a checkout owned by that task. Independent tasks get different checkouts even
in the same repositories, and original checkouts stay reference only. Before this change,
`start`/`codexStart` refused any target outside the root's starting repository. The primary
conversation was also bound to a single checkout.

## What was built

- `src/workspace.mjs` (new, about 190 lines, no dependency) resolves explicit targets into a
  per-task map `repository → { path, source, owned }`.
  - A repository the task already maps keeps its checkout.
  - A different linked worktree of a mapped repository is refused.
  - An unowned linked worktree, such as a `pm claim` checkout, is adopted and owned. This
    includes the root's own.
  - Any original checkout, the root's own included, becomes a detached worktree at its committed
    HEAD under `$FACTORY_HOME/worktrees/<task>/<slot>/`.
  - A non-Git directory is refused, the root's own included.
- The ownership registry, `$FACTORY_HOME/workspaces.json`, has one in-process writer. It refuses a
  path that equals, nests in or contains another task's checkout. Paths are canonicalized with
  `realpath`, so symlink aliases are caught. A claim is checked at resolution and recorded only
  after launch, so a failed launch claims nothing. Only a confirmed-missing checkout (ENOENT or
  ENOTDIR) is pruned; a permission or I/O error keeps the owner.
- `factory_delegate` gains `repos` (at most 16). `cwd` remains the working directory. The
  conversation keeps its first working directory because Claude resumes a session only from that
  directory. The session key therefore stays `primary:<first cwd>`, and records written before
  this change need no session migration when `primaryCwd` is a linked worktree. One bound to an
  original or non-Git directory is refused with "start a new root session".
- The one-writer check, orphan recovery and the root edit guard now compare every checkout of a
  run (`dirs`), not only its `cwd`. Global or per-repository `off` on any target refuses the run.
- Workers receive the other checkouts, plus a linked worktree's common Git directory:
  - a Claude worker through `--add-dir`;
  - a Codex worker through `sandbox_workspace_write.writable_roots`, under `workspace-write` only.
- The handoff names the checkouts when there is more than one, or when one is isolated.
  `factory_inspect` reports `workspace`.
- `fresh:true` builds its own map, stored on the run record. When a target is a checkout the
  primary map already holds, the fresh conversation gets an isolated copy of it.
- README, both skills and architecture §18.0 are updated. §18.0 still described prompt-hook
  automatic dispatch, so it now describes the current model-directed routing.

## Decisions and dead ends

- **A task-scoped session key (`primary`) was planned and dropped.** Claude's `--resume` is scoped
  to the session's working directory, so the anchor can never change, and `primary:<anchor>` is
  already task-scoped. Keeping it avoided a session migration entirely.
- **No shared-original exception (author integration fix after the root's draft read).** The
  first draft adopted the root's own original checkout without owning it. Two roots in one
  original then shared it, protected only by the one-writer check, and an idle task had no
  protection at all. The root rejected that against the acceptance criteria. Every original now
  resolves to a task-owned isolated worktree. Pre-workspace conversations bound to an original
  are refused: their Claude session cannot change directory, and continuing would keep writing
  the shared original. Non-Git roots are refused too, since no isolated copy exists and adopting
  one could reach Git checkouts nested inside it.
- **Pruning trusted any `stat` error as absence** in the first draft. That error could transfer an
  unreadable task checkout to another task. Only ENOENT/ENOTDIR release a checkout now; a
  `chmod 000` test pins the boundary.
- **Claims were recorded before launch** in the first draft, so a failed preflight left a task
  owning a checkout it never used. That surfaced as an existing binding test failing once root
  checkouts became owned. Claims are now checked first and recorded after launch.
- **Created worktrees are detached rather than on a Factory branch,** so Morpheus's
  "never hand-name a branch" rule is untouched. The worker, or `pm claim`, chooses the branch.
- **Ownership is claimed at resolution, before the launch.** A failed launch leaves the task owning
  what it explicitly asked for, and a primary-slot worktree is reused at its deterministic path.
  The binding and map are still committed only after a successful launch.
- A first test hung because a `sed` edit turned the test helper `finish` into self-recursion;
  this was found with print bisection.

## Result

The fake-provider tests run the real guardian with a fake Claude CLI. That CLI writes a marker
into its working directory and every `--add-dir`. The tests show:

- One session wrote into two repositories.
- A follow-up resumed the same session.
- Adding a third repository resumed it again.
- The original checkouts stayed unchanged, including an uncommitted edit that was not copied.
- Independent tasks got different worktrees, including two roots starting in the same original.
  Neither wrote or adopted that original. Task A's checkout could not be taken while A was idle.
- Cross-task claims were refused, through a subdirectory, a symlink alias or a containing
  checkout.
- Removing a checkout released its ownership.
- A pre-workspace record in a linked checkout kept its saved session. One bound to an original
  was refused with its remedy and claimed nothing.
- A root outside Git was refused.
- An unreadable (EACCES) checkout kept its owner.
- A failed launch claimed nothing.
- Per-repository `off` covered every target.
- A read-only sandbox received no writable roots.

Mutating each guard failed the new tests, with one exception: the fresh `avoid` rule survived at
first. A further assertion now kills it.

`scripts/workspace-live.mjs` is the live harness for the root. It runs the source bridge in an
isolated `FACTORY_HOME`. A fake-provider dry run of it reproduced the same five steps. That dry run
is not live proof: live proof needs the real root id and provider.

## Open questions

- The live smoke with the real provider and real root identity is owned by the root and is not
  part of this commit.
- Created worktrees are never removed automatically. Is a cleanup command wanted once real use
  shows they accumulate?

## Appendix: test commands

- `cd plugins/factory && pnpm check && pnpm test`: 194 passed, 0 failed, including the 11 tests in
  `tests/workspace.test.mjs`. The existing fixtures now root in a linked worktree
  (`tests/git-fixtures.mjs`), because an original root is no longer adopted.
- `node --test tests/workspace.test.mjs`: 11 passed.
- `node --test tests/reverse.test.mjs tests/gateway-workers.test.mjs tests/manager.test.mjs tests/mcp.test.mjs tests/dispatch.test.mjs`:
  43 passed.
- `pnpm typecheck`; `pnpm exec vitest run tests/factory-distribution.test.ts tests/ci-scope.test.ts`:
  40 passed; `pnpm compile`; `pnpm morpheus pm index`.
- Mutations, author fix round: each of these failed at least one test — pruning that trusts any
  `stat` error, adopting primary originals again, a no-op `assertOwnedMap`, and recording claims
  at the check.
- Mutations, first round: the registry conflict check, the isolation branch, `--add-dir`, the per-repository
  `off` check, missing-path pruning, fresh `avoid` and the mapped-repository fallback each failed
  at least one test.
