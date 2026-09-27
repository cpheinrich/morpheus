# One automatic finalization-only review turn

Roadmap: MO-26-09-27-12.08.37

## Why

Evo [#291](https://github.com/darwin-health/evo/pull/291) got stuck in a gap worth closing. Its
reviewer conditionally cleared a fix and named the source paths the author could touch. The author's
fix commit carried exactly those paths **plus the runbook paragraph explaining the fix**. From there
nothing was honest and legal at the same time: only a reviewer may widen a condition, the commit was
already pushed so splitting it needed a force-push, and after `covered` only the worklog may change.
A correct, reviewed change sat blocked on a paragraph, and the only route left was asking Chris for
a fifth turn — a human decision spent on documentation prose.

The cap itself was doing its job. Every substantive turn on #291 was earned: a real automatic-approval
fix after the first three turns, then a real trunk-integration adaptation. Raising the cap to four
would have bought a fourth *substantive* round for every PR, which is the loop the cap exists to stop.

## What this adds

One automatic finalization-only turn per pull request, beyond the cap and after any authorized extra
turn. Same reviewer, five minutes, `finalization: { paths, evidence, attestation }` plus a
`scopeReason`. It is bounded so that an automatic turn cannot become a review nobody decided to hold:

- one per PR; a second needs `humanAuthorization` as an ordinary substantive turn
- last word, `cleared` only; `blocked`/`incomplete` leave the PR blocked as before
- cannot resolve a substantive finding — an ordinary turn must have done that
- the attested `paths` are checked against the commits the turn covers, so attesting a doc file does
  not clear implementation riding along in the same commit
- `AGENTS.md`, `CLAUDE.md`, `morpheus.json` and `.github/`, `.ci/`, `.morpheus/` are refused outright:
  policy a project is operated by stays substantive however it is described

Deliberately not a blanket documentation exemption. Other Markdown is admitted only on the
reviewer's attestation that it restates reviewed behaviour, because a runbook can just as easily
state a new rule, and no regex can tell those apart. The reviewer is the one who can.

Prevention is still cheaper than the exception, so the condition guidance now says to name the
related documentation and generated counterparts in `condition.paths` from the start. This turn is
the backstop, not the plan.

## Preventing the round trips that cost more than the policy

Four CI round trips on #291 were spent on record authoring, not on the change: invented
`conditional`/`condition`/`conditionMet` keys at follow-up level (they exist, on findings), and a
summary paragraph that paraphrased rather than repeated `summary`. All of it was locally detectable.
`morpheus review prepare` now prints the exact command that runs the same schema and checker CI runs,
against the real generated template, with an explicit "invent no fields" line.

## Test plan

`pnpm typecheck`, `pnpm run lint` and `pnpm test` — 1446 tests across 54 files, all passing.
`tests/local-review.test.ts` gained eleven cases: the happy path beyond the cap without a human
decision, a duplicate finalization turn, the five-minute ceiling either side of the boundary, a
changed reviewer, `blocked` and `incomplete` outcomes, a turn appended after finalization, a missing
`scopeReason`, substantive findings a finalization turn must not resolve, each normative path
refused, a source path merely attested versus one properly conditioned, an attestation checked
against a commit that also carried code, and the unchanged three-turn and human-authorization
contracts. A final case reproduces Evo #291's actual shape — four turns with the last authorized, a
conditional clearance, and one commit carrying both the conditioned fix and its runbook paragraph —
and asserts it clears while a widened attestation over new source still does not.

## Open questions

None.
