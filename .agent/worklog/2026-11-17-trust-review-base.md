---
date: 2026-11-17
roadmap: MO-26-11-17-21.42.37
tags: [engineering, devops]
---

# Evaluate independent review under trusted base policy

The target branch supplies the independent-review requirement and the Manager's protected paths.
The PR head supplies the committed evidence and proposed policy, which still has to parse. Local
validation applies the same review requirement, and review packets name the trusted target.
Morpheus uses the shared workflow on main and its own reviewed base executable. Consumer runs
use the released Morpheus checker. The PR input and checker are sibling checkouts. The original
PR check context and candidate Node test lane are preserved. The old workflow ref input remains
accepted for existing callers, but does not select authority.

The disposable audit reproduced an exit-status change from 1 to 0 on a proposed opt-out. With
this build both candidates exit 1 and name the missing review label. A base-approved opt-out
still waives; a reviewed policy change can still clear. The reusable job rechecks the live target
before reading its policy and reports checker and base revisions.

MCP graph calls closed after two attempts. The pinned graph analyzer checked successfully at the
primary checkout; work used exact source and focused test reads to recover the affected call paths.
The installed actionlint pin does not recognize the newer job workflow SHA context, so the consumer
checkout uses the explicit protected main ref. Initial workflow tests exposed a pin guard that
also matched non-reusable top-level callers; the guard now checks its intended reusable scope.

## Validation

- 611 focused tests across local review, Manager review, CLI, conventions, workflows, and Manager.
- Focused review-packet tests verify the exact target commit is printed.
- `pnpm typecheck`, `pnpm compile`, `pnpm exec oxlint src`, `pnpm morpheus pm index`,
  `actionlint -shellcheck= .github/workflows/{ci,pr-check,review-metadata}.yml`, and diff whitespace passed.
- Complexity passes in enforce mode. Final scope 36 functions in 8 measured files.
- Reran the baseline CLI probe against the compiled checker for both waiver cases.

## Trusted ref verification

Git can prefer a same-named tag to an abbreviated remote-tracking ref. The hosted checker resolves
the exact remote-tracking ref and passes its commit SHA. The CLI qualifies the default `origin/`
shorthand before resolving it. Reproduced the conflicting tag in both the workflow fixture and the
local review tests. GitHub's reusable workflow lookup also prefers a same-named tag. Checked that
`refs/tags/main` was absent, created [ruleset 27524573](https://github.com/cpheinrich/morpheus/rules/27524573)
for its creation and update, then read back the active tag rule with the exact include and no bypass
actors. The tag remained absent. Only this reserved name is targeted.

While checking that boundary, also made an unavailable PR head fail the required job after fetch.
A base-only checkout with no candidate object must not be treated as a records-only diff.

The first follow-up showed that Git's revision lookup could still fall through when a fully
qualified ref was absent. Both the workflow and local CLI now use exact `git show-ref --verify`
for remote-tracking refs, with regressions against a tag named like the missing full ref.
