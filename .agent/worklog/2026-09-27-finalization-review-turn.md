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

## Independent review

Independent high-risk review of the finalization-only review turn, 21 of 30 minutes, complete. Two substantive bypasses and one minor gap, all cleared conditionally and all fixed: the automatic turn could follow a blocked turn and so merge a review the reviewer had blocked on a substantive finding; an unsatisfied or disputed condition widened its scope to implementation files; and the normative-path set was case-sensitive and anchored at the repository root. The reviewer verified the surviving invariants by probe rather than by reading — one turn per pull request, the five-minute ceiling, last-word ordering, cleared-only, same reviewer session, the attested-paths-versus-diff check, path traversal and non-canonical spellings — and confirmed the covered-to-head rule, conditional clearance and trunk-merge rules are untouched. 1449 tests across 54 files pass, with typecheck, lint and a clean recompile.

```morpheus-review
{
  "version": 1,
  "base": "dc9423789351f3a101cf26176c90b3e261cb3359",
  "reviewed": "e5e34149582e1f6c406aaf65b3d1571742d5befe",
  "covered": "a3b66ae76511c5b00ac3a2d9114f30aca8636027",
  "authorSession": "66f5f539-6988-4738-a283-af9fa021ca5c",
  "reviewerSession": "a13b02a9fdea6d4a7",
  "risk": "high",
  "elapsedMinutes": 21,
  "outcome": "complete",
  "summary": "Independent high-risk review of the finalization-only review turn, 21 of 30 minutes, complete. Two substantive bypasses and one minor gap, all cleared conditionally and all fixed: the automatic turn could follow a blocked turn and so merge a review the reviewer had blocked on a substantive finding; an unsatisfied or disputed condition widened its scope to implementation files; and the normative-path set was case-sensitive and anchored at the repository root. The reviewer verified the surviving invariants by probe rather than by reading \u2014 one turn per pull request, the five-minute ceiling, last-word ordering, cleared-only, same reviewer session, the attested-paths-versus-diff check, path traversal and non-canonical spellings \u2014 and confirmed the covered-to-head rule, conditional clearance and trunk-merge rules are untouched. 1449 tests across 54 files pass, with typecheck, lint and a clean recompile.",
  "findings": [
    {
      "id": "FIN-1",
      "severity": "substantive",
      "description": "The substantive-findings guard required only that some non-finalization turn existed, not that one cleared, so a blocked turn followed by the automatic five-minute finalization turn returned a clean pass on an unconditional substantive finding.",
      "paths": [
        "src/review/local.ts"
      ],
      "disposition": "fixed",
      "response": "A finalization turn now must follow a turn that returned cleared, and an unconditional substantive finding requires that preceding clearance. A blocked or incomplete predecessor leaves the pull request blocked, named in the refusal. The regression covers both outcomes and a finalization turn standing alone; it returns a clean pass before the fix.",
      "condition": {
        "paths": [
          "src/review/local.ts",
          "tests/local-review.test.ts",
          "dist/review/local.js",
          "dist/review/local.js.map",
          "dist/review/local.d.ts",
          "docs/runbooks/independent-review.md",
          "AGENTS.md",
          "src/init/templates.ts",
          "src/review/local-prompt.ts",
          "architecture.md",
          ".agent/decisions.md",
          "dist/init/templates.js",
          "dist/review/local-prompt.js",
          "dist/review/local-prompt.js.map",
          "dist/review/local-prompt.d.ts",
          ".agent/worklog/2026-09-27-finalization-review-turn.md"
        ],
        "evidence": "pnpm compile leaving git status clean, pnpm typecheck, pnpm lint and pnpm test, with a new regression test per finding that fails before the fix: blocked-then-finalization refused, a disputed condition path refused, and agents.md / docs/claude.md / a nested .github path refused as normative."
      },
      "conditionMet": "Fixed in src/review/local.ts within the stated paths. Reverting only this guard makes the new case fail, and restoring it passes: 1449 tests across 54 files, pnpm typecheck and pnpm lint clean, pnpm compile a no-op on the committed dist."
    },
    {
      "id": "FIN-2",
      "severity": "substantive",
      "description": "finalizationProblems built its conditioned set from every finding's condition.paths regardless of disposition, while the rest of the checker uses conditionallyCleared, so a condition left disputed or unmet still admitted an implementation file to the finalization scope.",
      "paths": [
        "src/review/local.ts"
      ],
      "disposition": "fixed",
      "response": "The scope now uses conditionallyCleared(record), so only a condition the author actually satisfied contributes paths, matching the rest of the checker. A disputed substantive condition and a disputed minor one are both refused; the same path is admitted once conditionMet is recorded. The regression returns a clean pass before the fix.",
      "condition": {
        "paths": [
          "src/review/local.ts",
          "tests/local-review.test.ts",
          "dist/review/local.js",
          "dist/review/local.js.map",
          "dist/review/local.d.ts",
          "docs/runbooks/independent-review.md",
          "AGENTS.md",
          "src/init/templates.ts",
          "src/review/local-prompt.ts",
          "architecture.md",
          ".agent/decisions.md",
          "dist/init/templates.js",
          "dist/review/local-prompt.js",
          "dist/review/local-prompt.js.map",
          "dist/review/local-prompt.d.ts",
          ".agent/worklog/2026-09-27-finalization-review-turn.md"
        ],
        "evidence": "pnpm compile leaving git status clean, pnpm typecheck, pnpm lint and pnpm test, with a new regression test per finding that fails before the fix: blocked-then-finalization refused, a disputed condition path refused, and agents.md / docs/claude.md / a nested .github path refused as normative."
      },
      "conditionMet": "Fixed in src/review/local.ts within the stated paths. Reverting only this line makes the new case fail, and restoring it passes: 1449 tests across 54 files, pnpm typecheck and pnpm lint clean, pnpm compile a no-op on the committed dist."
    },
    {
      "id": "FIN-3",
      "severity": "minor",
      "description": "The normative-path pattern was case-sensitive and anchored .github, .ci and .morpheus at the repository root, so agents.md, docs/Claude.md and apps/web/.github/workflows/ci.md were admitted as explanatory Markdown.",
      "paths": [
        "src/review/local.ts"
      ],
      "disposition": "fixed",
      "response": "The pattern is case-insensitive and matches morpheus.json and the policy directories at any depth. The runbook and reviewer prompt now also say that a symlinked policy file is beyond any pattern and is the reviewer's to catch, as the reviewer noted. The regression covers each admitted spelling and fails before the fix.",
      "condition": {
        "paths": [
          "src/review/local.ts",
          "tests/local-review.test.ts",
          "dist/review/local.js",
          "dist/review/local.js.map",
          "dist/review/local.d.ts",
          "docs/runbooks/independent-review.md",
          "AGENTS.md",
          "src/init/templates.ts",
          "src/review/local-prompt.ts",
          "architecture.md",
          ".agent/decisions.md",
          "dist/init/templates.js",
          "dist/review/local-prompt.js",
          "dist/review/local-prompt.js.map",
          "dist/review/local-prompt.d.ts",
          ".agent/worklog/2026-09-27-finalization-review-turn.md"
        ],
        "evidence": "pnpm compile leaving git status clean, pnpm typecheck, pnpm lint and pnpm test, with a new regression test per finding that fails before the fix: blocked-then-finalization refused, a disputed condition path refused, and agents.md / docs/claude.md / a nested .github path refused as normative."
      },
      "conditionMet": "Fixed in src/review/local.ts within the stated paths, with the wording added to docs/runbooks/independent-review.md and src/review/local-prompt.ts. Reverting only the pattern makes the new case fail, and restoring it passes: 1449 tests across 54 files."
    }
  ]
}
```

The reviewer's two substantive findings were both real bypasses of the thing this change is meant to
be safe about, and both were mine to have caught: the existence check instead of a clearance check,
and two different notions of "conditioned path" in one file. It cleared all three conditionally, so
they are fixed inside its stated paths with the evidence it named, and no further turn was needed.

## Open questions

None.
