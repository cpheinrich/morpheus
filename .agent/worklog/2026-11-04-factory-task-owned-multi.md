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
  - The root's own checkout is adopted, as before.
  - An unowned linked worktree, such as a `pm claim` checkout, is adopted and owned.
  - An original checkout becomes a detached worktree at its committed HEAD under
    `$FACTORY_HOME/worktrees/<task>/<slot>/`.
  - A non-Git directory other than the root's own is refused.
- The ownership registry, `$FACTORY_HOME/workspaces.json`, has one in-process writer. It refuses a
  path that equals, nests in or contains another task's checkout. Paths are canonicalized with
  `realpath`, so symlink aliases are caught. A missing checkout is pruned, so removing it is the
  only release.
- `factory_delegate` gains `repos` (at most 16). `cwd` remains the working directory. The
  conversation keeps its first working directory because Claude resumes a session only from that
  directory. The session key therefore stays `primary:<first cwd>`, and records written before
  this change need no session migration. Their map is seeded from `primaryCwd` on the next
  delegation.
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
- **The root's original checkout is adopted but not owned.** Registering a main checkout would lock
  it to the first task forever, since nothing releases an original. Two roots in the same original
  checkout still share it as before. The one-writer check still serializes them. An earlier draft
  also nesting-checked unowned originals; it was dropped because Claude Code's
  `.claude/worktrees/` places linked worktrees inside the main checkout, which would lock out the
  root whose original contains them.
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
- Independent tasks got different worktrees.
- Cross-task claims were refused, through a subdirectory, a symlink alias or a containing
  checkout.
- Removing a checkout released its ownership.
- A pre-workspace record kept its saved session.
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

- `cd plugins/factory && pnpm check && pnpm test`: 189 passed, 0 failed, including the 6 new
  tests in `tests/workspace.test.mjs`.
- `node --test tests/workspace.test.mjs`: 6 passed.
- `node --test tests/reverse.test.mjs tests/gateway-workers.test.mjs tests/manager.test.mjs tests/mcp.test.mjs tests/dispatch.test.mjs`:
  43 passed.
- `pnpm typecheck`; `pnpm exec vitest run tests/factory-distribution.test.ts tests/ci-scope.test.ts`:
  40 passed; `pnpm compile`; `pnpm morpheus pm index`.
- Mutations: the registry conflict check, the isolation branch, `--add-dir`, the per-repository
  `off` check, missing-path pruning, fresh `avoid` and the mapped-repository fallback each failed
  at least one test.
