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

### Live proof

The root ran this independently on c2021a56. It used the source bridge, an isolated
`$FACTORY_HOME` with gateway key references only, and memory sharing disabled. It did not touch
the installed service or other sessions' workers. Every worker was the Claude gateway worker. It
ran on the MacBook Pro, and the gateway runs on the existing Mac mini. Nothing was stubbed: no
root snapshot, no provider and no permission or root metadata.

1. **One conversation across three repositories.** The command was
   `FACTORY_HOME=$FACTORY_HOME node plugins/factory/scripts/workspace-live.mjs --root-kind codex --root-id <real Codex root id>`.
   It ran with the actual Codex root `01a1a9c1-b30a-7363-8fbb-e1261218886c`. Three runs completed,
   all in one native worker session, `d789676c-7fd7-4d2c-9e3d-2b454666f715`:
   - `c185d33c-8398-4943-96aa-bc7b77c5dd7b` edited alpha and beta;
   - `2e3ab3ea-e73e-4f49-9801-5f32e2758b8f` was a plain resume;
   - `6aff8634-e6a8-4a71-910b-45dd947d581c` added gamma.

   The root checked the exact NOTES values: alpha and beta read `live-1/live-2/live-3`, and gamma
   reads `live-3`. All three are task-owned isolated worktrees. The originals were preserved:
   alpha's uncommitted README edit is still only in the original, and beta and gamma are clean.
2. **An independent second root.** This was a real Claude CLI coordinator, session
   `86745b60-e212-4556-abeb-011aead60d51`. Its real SessionStart and UserPromptSubmit hooks fired,
   and it used the source `claude-mcp.mjs`. It called the actual `factory_inspect`,
   `factory_delegate` and `factory_wait` tools. Its run, `06315876-e750-4ed0-a726-e72984d56297`,
   completed in a separate native session, `3a465a6d-82fb-4b03-920c-eed954627b8d`. It got its own
   worktrees of the same alpha and beta sources. The root checked that their notes read exactly
   `other-root`, that the paths differ from the first task's, and that the first task's notes were
   untouched.
3. **A cross-task claim.** The source bridge, called as that same second Claude root, was asked to
   enroll the first task's gamma worktree. It refused: "is a checkout owned by another Factory
   task".

One dead end came from the test environment, not the product. A long thread-scoped
`FACTORY_HOME` exceeded macOS's Unix-socket path limit. The first coordinator connected to MCP, but
`factory_inspect` failed with `EINVAL`, so it stopped correctly before any delegation. A short
temporary symlink to the same private runtime fixed the environment, and the rerun succeeded.
The private evidence (stream, scripts, verified JSON) stays local to the root and is not
published.

## Independent review

The review was of b3915213. It produced two findings, and only R1 changed code.

### R1 (substantive): retry after a failed launch, under a symlinked home

**Problem.** `isolatedWorktree` compared the realpath `top` of an existing worktree with the raw
destination, which is built from `home()`. If `FACTORY_HOME` is reached through a symlink, as
`/tmp` and `/var` are on macOS, this breaks retries. A launch that fails before it starts leaves
the created worktree unclaimed, and every retry then refused it as "exists but is not a worktree".

**Fix.** The function now compares and returns `realpath(destination)`. The change is limited to
the condition's paths, `src/workspace.mjs` and `tests/workspace.test.mjs`.

**Regression test.** "a retry after a failed launch reuses its worktree under a symlinked
FACTORY_HOME". It uses an explicit symlinked home and calls `Manager.start` twice for the same
task and original:
- The first call fails before launch.
- The second call must reuse the same canonical worktree, register it to the task, and leave
  exactly one extra worktree.

**Proof.**
- RED on the pre-fix source:
  `cd plugins/factory && node --test --test-name-pattern="symlinked FACTORY_HOME" tests/workspace.test.mjs`
  gave 0 pass, 1 fail, with "…/link-home/worktrees/…/app-… exists but is not a worktree of …".
- GREEN after the fix: the same command gives 1 pass, 0 fail.
- `node --test tests/workspace.test.mjs` gives 12 pass, 0 fail.
- `pnpm check` is clean.

### R2 (minor, disputed for this PR)

**Finding.** The registry records ownership by root task, so a later primary or fresh
conversation of the same root task can adopt an idle fresh conversation's checkout.

**Why it stays.** The accepted boundary is the root task. Its fresh and auxiliary conversations
share that task's authority, and the one-writer guards still forbid concurrent writers.

**Limitation.** Idle conversations within one root task are not isolated from each other.
Isolating them would add scope beyond the independently owned tasks this item requires. This PR
does not change code or docs for R2.

## Open questions

- Created worktrees are never removed automatically. They are released when removed with
  `git worktree remove` or `pm cleanup`. This is a stated limitation, not a merge blocker.

## Appendix: test commands

- `cd plugins/factory && pnpm check && pnpm test`: 194 passed, 0 failed, including the 11 tests in
  `tests/workspace.test.mjs`. The existing fixtures now root in a linked worktree
  (`tests/git-fixtures.mjs`), because an original root is no longer adopted.
- `node --test tests/workspace.test.mjs`: 11 passed. The root reran it independently on c2021a56,
  along with `pnpm check`.
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
