---
date: 2026-09-16
agent: claude
roadmap: MO-26-09-16-04.13.55
outcome: review
summary: The review-waived line says it waives legacy delivery only, and the review packet carries the repository path, derived test commands, and honest ticket wording.
---

# Say what review-waived waives; put the worktree and test commands in the packet

Two ergonomics defects reported from Lakina after the first end-to-end runs of the author-managed
review flow (#248, #241), taken together because both are about what `check pr` and
`review prepare` *print*, not about policy.

**`review-waived` read as accepted while the rule it names went on failing.** `check pr` printed
`~ [review-waived] agent review waived — "…"` beside `✗ [agent-review] …` and exited 1. The waiver
is honoured by the legacy delivery job only; `checkLocalReview` never consults it. An agent told
its human the waiver was "the mechanism CI recognises" on the strength of that line. The message
now says `legacy agent-review delivery waived — "…". This does not waive the independent review:
agent-reviewed and a review-record: line are still required.` The level stays `waived`, because
the delivery job does honour it and a waiver the reader never sees is a waiver swallowed.

**The packet said neither where the repository was nor how to run its tests.** A fresh reviewer
either asks the author, defeating the isolation, or rebuilds an environment and spends its budget
on setup; Lakina's nearly did, with a `uv sync` that outlasted the review. `review prepare` now
prints `Repository: <root>` and commands derived from the manifests that define them —
`package.json` scripts (`typecheck`, `test`, `lint`, under pnpm or npm), `pyproject.toml` (`uv run
pytest` with a `uv.lock`, else `pytest`), `Package.swift` (`swift test`) — and says "none detected —
ask the author" rather than guessing. `Ticket: none — no declared title` and `Acceptance: not
declared` are replaced by sentences that describe an unclaimed or acceptance-less change as a
supported state, because printing `none` invited authors to create an item just to fill the line.

**Not done here, deliberately.** The other halves of both issues are policy: a human override for
an incomplete local review (#248) and conditional clearance (#241). Both change the settled
2026-09-10 contract and are Chris's decisions; neither issue is closed by this change.

Considered and rejected: reading a `review.testCommand` field from `morpheus.json`. It would be
one more thing to keep true by hand where the manifests already say it; add it only if a project
turns up whose test entry point no manifest names.

## Validation

- `tests/check.test.ts`: the waived finding's message is pinned to name legacy delivery and to say
  the independent review is still required.
- `tests/review.test.ts`: seven packet tests — pnpm command derivation and order, npm fallback,
  Python and Swift manifests, nothing-detected, packet line order, unclaimed/undeclared wording
  with a regression that no line ends in `: none`, and the declared-but-missing acceptance case.
- `pnpm typecheck`, full suite, `pnpm compile`, `pnpm morpheus pm index`.
