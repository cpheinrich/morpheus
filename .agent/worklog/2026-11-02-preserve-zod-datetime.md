---
agent: codex
date: 2026-11-02
roadmap: MO-26-11-02-10.58.33
outcome: review
tags: [engineering, security]
---

# Preserve Zod datetime compatibility

## Mandate

- Outcome: replace blocked Dependabot PR #464 with a governed Zod 4.6.6 remediation that preserves
  Morpheus's documented qualified-datetime compatibility.
- Acceptance: the root production graph resolves Zod 4.6.6; PM, CD, review, and meeting-intake
  schemas accept qualified minute precision and retain their existing offset/local boundaries;
  focused tests, typecheck, lint, compile, PM index, exact-head CI, and fresh independent review
  complete on a separate draft PR.
- Authority: change this governed branch and PR metadata for #464 and the weekly audit PR; do not
  merge, enable auto-merge, close PRs, dispatch workflows, deploy, create credentials, or access
  live production data.
- Budget: existing local subscription and included CI only; no new spend.

## Design

Zod 4.5 deliberately began requiring seconds on qualified RFC 3339 datetimes. Its official release
notes prescribe a union of the default schema and `precision: -1` when both forms are required.
`isoDatetimeWithOptionalSeconds` owns that small compatibility boundary; domain schemas retain
their existing `offset` and `local` options. This is narrower than preprocessing or a custom regex,
and keeps Zod's calendar/time validation.

Graph tooling was unavailable in this continuation, so the known reviewer paths were verified
directly. Repository-wide source search found four schema owners: PM/team metadata, CD timestamps,
local-review authorization timestamps, and meeting-intake completion records. Tests exercise each
owner at the minute-precision boundary and retain negative offset/local assertions.

## Validation

- `pnpm install --frozen-lockfile` resolves root Zod 4.6.6.
- `pnpm exec vitest run tests/pm.test.ts tests/team.test.ts tests/cd/schema.test.ts
  tests/local-review.test.ts tests/meeting-intake.test.ts` passes 283 tests across all affected
  schema owners.
- `pnpm typecheck`, `pnpm lint`, `pnpm compile`, `pnpm morpheus pm index`,
  `pnpm morpheus pm validate`, and `git diff --check` pass.
- `pnpm audit --prod --audit-level high` exits zero: the Zod high advisory is absent; the one
  remaining moderate root advisory is the separate minimatch remediation in draft #570.
- The one permitted full `pnpm test` run passed 4,059 tests and failed 53. Six are the known
  missing-actionlint cases (`spawnSync actionlint ENOENT`). The other 47 occurred under severe
  resource contention across unrelated process-heavy suites: predominantly 30-second test/hook
  timeouts plus one worker-start timeout and secondary missing/status errors. Seven local-review
  cases timed out only in that parallel run; the complete affected five-suite command above passes
  283/283 in isolation. The unchanged full suite was not repeated; exact-head CI owns full-suite
  verification.
