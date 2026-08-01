---
date: 2026-07-29
agent: claude
roadmap: MO-26-07-28-007
outcome: shipped
summary: Retrofitted Evo to the Morpheus structure by hand; found one real template bug.
---

## What happened

Moved Evo to `apps/` + `packages/` + `hq/` on a branch off `origin/main`, opened
darwin-health/evo#6. Structural only — verified install, token build, typecheck, lint, and
`next build` all still pass with all 8 calculator routes prerendering.

## The finding that justified doing it by hand

`web-ci` ran `pnpm typecheck` and `pnpm test` unconditionally. Evo's `apps/web` had neither
script, so a perfectly healthy project failed CI on the template's assumption rather than on
anything wrong with it. Fixed with `pnpm run --if-present`.

This is exactly the class of bug that writing `morpheus init` first would have baked in: the
template encoded what *Morpheus* looks like, not what a young project looks like. Worth
remembering that the templates are written by a repo with full tooling, and applied to repos
without it.

## Smaller findings

- `web/` had no imports crossing out of it and did not consume `shared/` at all, so the move
  needed no import rewrites. `init` can assume that for a fresh project; `add` cannot.
- Three `.npmrc` files existed only to escape the global Polycam Artifactory registry, which
  no longer exists. Retrofits should look for workarounds whose cause has been removed.
- A structural move conflicts with every in-flight branch. Evo had an unmerged Codex branch,
  so the retrofit needs a quiet moment — a sequencing constraint, not a technical one.

## Judgment call

Branched from `origin/main` rather than the active Codex branch. A structural refactor should
sit on the mainline, and mixing it with in-flight feature work would produce a diff nobody
could review. The cost is that the Codex branch now needs a rebase.

## Second round: CI integration

Both reusable workflows failed on first contact with Evo, for different reasons.

`web-ci` ran `pnpm test` unconditionally against a project with no test script. Fixed with
`--if-present`. Notably my fix landed one minute *after* Evo's CI ran, so the first failure
was against a stale copy — a live demonstration of the `@main` pinning tradeoff.

`pm-check` ran `pnpm morpheus`, which only resolves in a repo depending on morpheus-kit. Evo
does not, and cannot until the package is published. Rewrote it to check out cpheinrich/morpheus
and build the CLI. That only works because the repo is public — the first time that decision
paid for itself concretely.

Also learned: `gh run rerun` reuses the workflow resolution from the original run, so a fix to
a reusable workflow cannot be verified by rerunning. Close/reopen the PR, or push, to get a
fresh resolution. Lost a cycle to this.
