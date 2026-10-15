---
date: 2026-10-15
agent: codex
roadmap: MO-26-10-15-00.19.05
outcome: review
summary: Permit a newly filed ticket for a deferred review finding within the conditional-clearance window.
---

# Deferred findings can be ticketed after review

Evo PR #503 exposed a contradiction: the reviewer discovered an incidental
finding and asked for a roadmap ticket, but filing it after `reviewed` made
`review validate` reject the author-only commit. Evo spent a follow-up
review turn and fixed the unrelated issue instead.

The validator now recognizes only a regular, newly added roadmap file whose
id appears on a deferred or open finding. It permits that file between
`reviewed` and `covered`, including after a conditional follow-up. It
still rejects existing-ticket edits, unrelated tickets, the static roadmap
README, source changes outside conditions, and all ticket changes after
`covered`. The runbook and architecture now state this narrow rule.

Focused validation: `pnpm exec vitest run tests/local-review.test.ts
tests/review.test.ts` passed 211 tests, including the positive clearance
case and negative coverage boundaries. The one permitted full local suite
for shared review code passed 2163 tests across 80 files. `pnpm typecheck`,
`pnpm compile`, and `pnpm morpheus pm index` passed. The roadmap README
is deliberately static, so allowing it as a generated index would expose
unreviewed prose; that proposal was rejected after checking both Morpheus
and Evo.

Codebase-memory could not activate because active sessions could not be
stopped safely; exact source, tests, specification and runbook were read
as the fallback.

The initial high-risk independent review found two substantive bypasses. An
ID-prefixed directory with a nested Markdown file passed as a ticket even
though the roadmap parser ignored it. A trunk merge could introduce the
ticket after `reviewed`, and a later author edit to that existing ticket
was then classified as newly filed. Both were reproduced by the reviewer
with disposable Git histories; no GitHub or source writes were made.
The correction requires a direct regular Markdown item with valid roadmap
frontmatter and matching id, and proves its first appearance on the branch
was an author commit. The two exact regression cases now fail under the
original implementation and pass with the correction. The focused review
suites pass 213 tests, and typecheck passes. The single full local suite
was already run before this correction; CI will run it on the final commit.
