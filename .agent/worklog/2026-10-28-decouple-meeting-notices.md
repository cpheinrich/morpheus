---
roadmap: MO-26-10-28-13.40.15
domains: [engineering, operations]
agents: [codex]
---

# Decouple meeting notices and sanitize public fixtures

## Outcome

The meeting-intake completion gate now accepts an explicit `not-promoted` action state after the
factual note and any required projection are verified. The formatted notice states that separate
task promotion remains pending instead of withholding the project-authorized group notification.
The established `recorded` messages remain byte-for-byte compatible, including the zero-action
case. Historical, unauthorized, stale, partial, repeated and uncertain deliveries still fail
closed.

The public meeting-intake fixtures now use synthetic organizations, repositories, domains,
identities, addresses and notification targets. Architecture, provider skills and scaffolded skill
output document the boundary: real project topology, collaborators, watcher policy and delivery
state belong in private project profiles or ignored local state. This removes those details from
current public source but does not rewrite already-published Git history.

No dependency was added. This is a small extension to the existing domain-specific Zod boundary
and formatter.

## Validation

- `pnpm exec vitest run tests/meeting-intake.test.ts tests/project-skills.test.ts
  tests/init.test.ts` — 99 tests passed. The notice tests assert the exact `recorded` messages,
  both summary and non-summary `not-promoted` messages, invalid-state rejection, and the existing
  publication guards.
- `pnpm typecheck` — passed after replacing a boolean-alias narrowing attempt that TypeScript did
  not carry across the discriminated union with a direct status check.
- `pnpm compile` — passed and refreshed committed `dist/` output.
- `pnpm morpheus pm index` — passed; generated indexes were unchanged.
- `pnpm test` — the single allowed shared-core run passed all 3,482 tests across 122 files.
- `git diff --check` — passed.
- A bounded literal scan of the meeting-intake source, skills and tests found none of the removed
  real project, collaborator, domain or group identifiers.

## Tooling note

The codebase-memory graph reported no recorded coverage gaps for the meeting-intake core, guide,
scaffold template and focused tests. Because the graph generation predates this worktree's edits,
the current source and complete diff were also read directly and verified through compilation and
tests.
