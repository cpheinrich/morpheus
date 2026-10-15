---
date: 2026-10-15
agent: codex
roadmap: MO-26-10-15-00.45.12
outcome: review
summary: Stop repeated identical trunk rescue PRs while keeping the reset proof and preserving distinct edits.
---

# Repeated trunk rescue edits

Morpheus #399 describes seven Evo rescue draft PRs in 36 hours after Xcode
re-saved the same project or scheme diff on an open trunk checkout. Evo has
fixed its Xcode file format, but the rescue needed to recognize recurrence
for any project. The existing rescue was lossless; its gap was repeated
publishing and human escalation.

The new check compares exact Git diffs against locally visible pushed
`wip/trunk-*` branches. It uses old/new blob IDs, paths and modes; Git's
whitespace-insensitive `patch-id` was considered but rejected because
different edits could collide. A duplicate retains the existing proof,
rechecks the working tree immediately before reset, skips a new branch,
push and PR, and prints the earlier branch plus a generator-loop hint.
Local-only branches and failed comparisons use the ordinary rescue.

Focused validation: `pnpm exec vitest run tests/trunk-rescue.test.ts
tests/session-start.test.ts` passed 51 tests. They cover recurrence,
distinct whitespace edits, a previous push failure, and session startup.
The one permitted local `pnpm test` run for shared session code passed
2172 tests across 80 files. `pnpm typecheck`, `pnpm lint`,
`pnpm compile`, and `pnpm morpheus pm index` passed. An unrelated
generated Zod enum order flip in `dist/pm/schema.d.ts` was restored after
compile; the session output remains committed.

Codebase-memory could not activate because active sessions could not be
stopped safely. I used targeted source, tests, specification and the Evo
incident description as the fallback.
