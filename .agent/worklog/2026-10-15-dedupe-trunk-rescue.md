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

The new check compares exact Git diffs against locally visible
`wip/trunk-*` branches. It uses old/new blob IDs, paths and modes; Git's
whitespace-insensitive `patch-id` was considered but rejected because
different edits could collide. A duplicate requires the branch to still exist
at the same SHA on the push remote and have an open GitHub PR. A duplicate retains the existing proof,
rechecks the working tree immediately before reset, skips a new branch,
push and PR, and prints the earlier PR plus a generator-loop hint.
Local-only branches, failed PR creation and failed lookups use the ordinary rescue.

Focused validation: `pnpm exec vitest run tests/trunk-rescue.test.ts
tests/session-start.test.ts` passed 55 tests on the final code. They cover recurrence,
distinct whitespace edits, a previous push failure, stale remote branches,
fork PR lookup, closed PRs, and session startup.
The one permitted local `pnpm test` run for shared session code passed
2172 tests across 80 files before the reviewer correction. `pnpm typecheck`, `pnpm lint`,
`pnpm compile`, and `pnpm morpheus pm index` passed. An unrelated
generated Zod enum order flip in `dist/pm/schema.d.ts` was restored after
compile; the session output remains committed.

Codebase-memory could not activate because active sessions could not be
stopped safely. I used targeted source, tests, specification and the Evo
incident description as the fallback.

The initial high-risk independent review found two substantive gaps. A stale
remote-tracking ref could survive remote branch deletion and suppress a new
rescue. A successful push followed by failed PR creation could also suppress
future PR creation. Both are addressed by a live remote SHA check and a
GitHub PR lookup before the working-tree content proof. The focused suites
passed 54 tests after this first correction, including a fork with a distinct
push URL and head owner. The same reviewer found that the installed GitHub CLI
rejects `owner:branch` in `pr list --head`, and that a closed PR must never
count as an active rescue. The final correction uses the plain branch with an
owner check on returned PRs and limits the query to open PRs. Its 55 focused
tests, typecheck, lint, compile, and index all passed. The reviewer conditionally
cleared those two findings with these exact paths and checks; no further review
turn was required. The local full suite already ran once; CI will run it on the
final head.
