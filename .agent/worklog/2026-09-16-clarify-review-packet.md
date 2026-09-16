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

## Independent review

Independent normal-risk review of f19e2e9aa455bc889927da50551fa64b7266ed73 completed in 3 minutes with two minor findings: the packet's runner detection was binary (pnpm, else npm run), which would hand a Yarn PnP or bun project a first command that fails, and the Python arm without a uv.lock was untested. The author fixed both in 57d00c3 — the manager is derived from the packageManager prefix, then the lockfile, with npm run as the last fallback, and the plain-pytest case is pinned — and integrated trunk at a85c59b (PR #209) in 5dd373f98ab0fea41ba5487f52f40f9488c3d102. The same reviewer's follow-up cleared the fixes and the integration in 1 minute. Two incidental, pre-existing notes were left out of scope: the packet reads "no declared title" when a staked item is absent on the checkout, and the repository path is the invocation directory. Not verified: the packet has not yet been consumed by a reviewer on a non-pnpm project.

```morpheus-review
{
  "version": 1,
  "base": "3aaa3f59bff04820cefd44a56c771cb2cd1439d6",
  "reviewed": "f19e2e9aa455bc889927da50551fa64b7266ed73",
  "covered": "5dd373f98ab0fea41ba5487f52f40f9488c3d102",
  "authorSession": "7721007e-1b81-586e-8ac8-39c717a85b5f",
  "reviewerSession": "packet-review-0916-a",
  "risk": "normal",
  "elapsedMinutes": 3,
  "outcome": "complete",
  "summary": "Independent normal-risk review of f19e2e9aa455bc889927da50551fa64b7266ed73 completed in 3 minutes with two minor findings: the packet's runner detection was binary (pnpm, else npm run), which would hand a Yarn PnP or bun project a first command that fails, and the Python arm without a uv.lock was untested. The author fixed both in 57d00c3 — the manager is derived from the packageManager prefix, then the lockfile, with npm run as the last fallback, and the plain-pytest case is pinned — and integrated trunk at a85c59b (PR #209) in 5dd373f98ab0fea41ba5487f52f40f9488c3d102. The same reviewer's follow-up cleared the fixes and the integration in 1 minute. Two incidental, pre-existing notes were left out of scope: the packet reads \"no declared title\" when a staked item is absent on the checkout, and the repository path is the invocation directory. Not verified: the packet has not yet been consumed by a reviewer on a non-pnpm project.",
  "findings": [
    { "id": "PKT-001", "severity": "minor", "description": "Runner detection was pnpm-or-npm only; a yarn or bun project received npm run commands that fail under Yarn PnP.", "paths": ["src/review/packet.ts", "tests/review.test.ts"], "disposition": "fixed", "response": "packageRunner() derives the manager from the packageManager prefix, then pnpm/yarn/bun lockfiles, then npm run; tests cover declared yarn, declared bun and an undeclared yarn.lock (57d00c3)." },
    { "id": "PKT-002", "severity": "minor", "description": "Only the uv.lock arm of the Python detection was tested; a mutant always returning uv run pytest survived.", "paths": ["tests/review.test.ts"], "disposition": "fixed", "response": "A pyproject.toml-without-uv.lock case asserts plain pytest (57d00c3)." },
    { "id": "PKT-003", "severity": "incidental", "description": "When a branch stakes an id whose item file is absent on the checkout, the packet prints 'no declared title' beside the new acceptance wording, which reads as though the item was inspected.", "paths": ["src/review/packet.ts", "src/review/context.ts"], "disposition": "deferred", "response": "Pre-existing shape; a later change can say 'item not found on this checkout'." },
    { "id": "PKT-004", "severity": "incidental", "description": "The repository path is process.cwd(), as every review subcommand already assumes.", "paths": ["src/cli/dispatch.ts"], "disposition": "deferred", "response": "Consistent with existing behaviour; not changed." }
  ],
  "followUp": {
    "reviewerSession": "packet-review-0916-a",
    "commit": "5dd373f98ab0fea41ba5487f52f40f9488c3d102",
    "base": "a85c59b59865e8c04f0df1925b353e7bc0c4ec9c",
    "scopeReason": "Trunk advanced to a85c59b (PR #209) after the initial review; strict branch protection requires integration, so the one same-session follow-up covered the two minor fixes and the integration merge together.",
    "outcome": "cleared",
    "elapsedMinutes": 1,
    "summary": "Follow-up cleared 5dd373f: both minor findings fixed with the lockfile arm genuinely exercised, focused suites (177) and typecheck pass, committed dist matches src, and the merge of a85c59b carries only this PR's own files."
  }
}
```
