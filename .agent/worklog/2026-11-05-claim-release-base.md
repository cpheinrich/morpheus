---
roadmap: MO-26-11-05-04.28.10
date: 2026-11-05
tags: [engineering, devops, ios]
---

# pm claim --base: tasks based on a protected release branch

## Ask

Chris authorized Evo's branch-first group CD (cut R = `release/ios-<A12>` from `main` at staging
start, fix only through PRs into R, merge R back after delivery). The Codex root found that
Morpheus PM tooling could not support a fix author: `pm claim` prepared only `main`, and
`assertCurrentSource`, `context refresh` and the gate required the checkout to contain current
`main`, so once unrelated work landed the fix author was refused and told to integrate `main` —
the one thing a frozen release must not receive. This task is the minimal authoring-support
prerequisite; Morpheus PR #620 (release preflight / ios-ci) and Evo EV-26-11-05-03.33.54 are the
companions. Budget: Factory Claude gateway quota, 38% used at start; no paid spend.

## What was built

- `morpheus pm claim <ID> --base <branch>`. Default (no option) unchanged.
- `src/session/task-base.ts`: `verifyTaskBase` (plain name, `check-ref-format`, `gh repo view` +
  `gh api repos/<o>/<r>/branches/<b> --jq .protected` must be `true`), `declaredBase` (the
  claimed item's `base:` on a task branch; the preparation marker on a prepared detached
  checkout), `taskTrunk` (base on the trunk remote, else the project trunk).
- `fetchTrunk` defaults to `taskTrunk`, so `assertCurrentSource`, startup lag
  (`prepareRepository`), refresh and check all measure the base. `prepareTask` takes the verified
  base, records it in the marker, refuses to reuse a checkout prepared for another base, and
  refuses an item already on trunk but absent from the base.
- `pm/claim`: writes `base:` with the in-progress status; skips ride-along reconciliation on a
  base; refuses an item that declares a different base. Only the task branch is pushed.
- `review prepare`/`validate` default `--base` to `origin/<base>` (fetched first); explicit
  `--base` wins with a warning. `pm resume` prints the base. `pm cleanup` proves the PR merged
  into the task's base. Schema gains optional `base` (`TASK_BASE` pattern).
- Docs: pm-workflow runbook section, independent-review note, help text, architecture.md.

## Result

Hermetic fixture (`tests/task-base.test.ts`, local bare remote, injected/PATH fake `gh`): with
`main` at A, R = A + fix B, `main` advanced to unrelated M, a `--base R` claim contains B and not
M through claim, refresh, the gate after the term, startup brief, resume and a fresh clone of the
task branch. R advancing asks for R only. A v1 review record validates against `origin/R` and the
same record is refused against `origin/main` (main checks unchanged). Unprotected, unknown,
malformed, `gh`-failure, garbled-answer and deleted-remote bases refuse with no worktree, binding
or push. Mutations of the base lookup, the protection answer and the invalid-item-base check each
fail tests (6, 1 and 1 failures).

## Dead ends and limits

- First draft considered per-branch Git config for the base: local to one machine, so a resume
  elsewhere would silently measure `main`. Item frontmatter travels with the branch.
- Naming the trunk inside a checkout prepared for R prepares a separate trunk checkout (existing
  behaviour for a non-matching checkout); R's checkout is untouched. The reuse-in-place mismatch
  refusal fires only when both bases are at the same commit.
- Not verified live: that GitHub's branch `protected` field is `true` for a branch protected only
  by a ruleset (documented for the branches list filter). The Evo ruleset rollout should confirm
  with `gh api repos/<o>/<r>/branches/release%2Fios-<A12> --jq .protected` before first use.
- Consumer `pm-ci`/`web-ci` triggers for `release/ios-*` PRs are Evo's change, not this one.
- A deleted base reads as the gate's "configured trunk does not exist" message; it refuses, but
  names `context.trunk`. Acceptable for a branch deleted only after closure.

## Appendix — commands run

- `pnpm exec vitest run tests/task-base.test.ts` → 12 passed.
- `pnpm exec vitest run tests/task-base.test.ts tests/session-start.test.ts tests/session.test.ts
  tests/session-gate.test.ts tests/session-git.test.ts tests/claim.test.ts
  tests/worktree-cleanup.test.ts tests/local-review.test.ts tests/review.test.ts` and
  `tests/cli-dispatch.test.ts tests/cli-args.test.ts tests/pm.test.ts tests/session-evidence.test.ts
  tests/session-bootstrap.test.ts tests/cli-check.test.ts` → all passed after fixes (gate tests
  run in non-Git directories: `declaredBase` returns null outside a work tree; dispatch mock
  gained `reviewBase`).
- `pnpm exec tsc --noEmit`, `pnpm compile`, `pnpm morpheus pm index` → clean.
