---
date: 2026-09-22
agent: claude
roadmap: MO-26-09-22-07.07.17
outcome: review
summary: Floors, runner-issued reviewer ids, tracked deferrals, a 10-minute small ceiling and conditional clearance.
---

Chris asked for the five evidence-side tightenings from the 2026-09-22 survey of Lakina and Evo
review records. This is the Morpheus half; the project `AGENTS.md` rollouts follow separately.

Design notes. The reviewer-id rule is a shape check plus a uniqueness check: a UUID or 16-plus hex
id, optionally behind a provider prefix, and `git grep` at head must find it in no other worklog.
The shape alone would still have admitted `7f3a9c2e`-style eight-character ids, hence sixteen.
Uniqueness is per branch, which is what `check pr` can see; a reviewer reused across repositories
is not caught. Morpheus's own earlier records (`reviewer-mo-26-09-18-b`, `/root/review_x`) would
fail the new shape, but merged records are never re-validated, and no open PR carries one.

Conditional clearance composes with the existing path walker rather than adding a turn state:
condition paths join the allowed set for the ranges no reviewer cleared, and the final turn's
commit may precede `covered` only when a conditionally cleared finding exists. Considered a
`cleared-if` turn outcome instead; rejected because the condition belongs to the finding, and a
turn outcome cannot say which finding or which paths.

Deferral tracking is widened from Chris's "non-incidental" wording to every deferred or open
finding, because substantive findings already cannot be deferred and the survey's rotting
deferrals were all incidental. Flagged to Chris in the conversation before implementing.

Dead end: a floor on follow-up minutes. A follow-up confirming a one-line fix in twenty seconds is
plausible for a model reading a diff it already knows, so only the initial review has a floor.

## Independent review

A high-risk independent review of b605d74 found one substantive and one minor finding; the substantive one was cleared conditionally, the author fixed both in 7a6093c, and because the fix regenerated dist files the condition had not named, the same reviewer spent a follow-up turn that cleared the fix in two minutes.

R01, substantive: the reviewer-id uniqueness grep matched the literal string, so a provider prefix
or an uppercased UUID slipped past it; the reviewer demonstrated both. Fixed by comparing the bare
lowercase id case-insensitively, with both variants under test. The reviewer offered a condition
(paths `src/review/local.ts` and `tests/local-review.test.ts`, evidence the vitest file), which
the fix met, but the regenerated `dist/review/local.js*` fell outside it, so the author asked for
a follow-up rather than stretch the condition. The runbook now says a condition on a source file
must name generated counterparts. R02, minor: runbook prose claimed minor-fix paths were allowed
after the final turn; aligned to the stricter code. The reviewer independently recompiled and
confirmed the committed dist is byte-identical to the source.

```morpheus-review
{
  "version": 1,
  "base": "e205e118681df1508e2b5bc1bc557ec027c7f144",
  "reviewed": "b605d74653582d7bb3a40133a5dbb1224875be9b",
  "covered": "7a6093ce60d032162709ec1e8d368d15f396765b",
  "authorSession": "claude-26bfbe60-f2a5-5ad4-96a2-96014aa4119e",
  "reviewerSession": "a9fc4262183f532eb",
  "risk": "high",
  "elapsedMinutes": 5,
  "outcome": "complete",
  "summary": "A high-risk independent review of b605d74 found one substantive and one minor finding; the substantive one was cleared conditionally, the author fixed both in 7a6093c, and because the fix regenerated dist files the condition had not named, the same reviewer spent a follow-up turn that cleared the fix in two minutes.",
  "findings": [
    {
      "id": "R01",
      "severity": "substantive",
      "description": "checkFreshReviewer grepped the literal reviewerSession, so a provider-prefixed or uppercased variant of an id already used in another worklog passed as fresh.",
      "paths": ["src/review/local.ts", "tests/local-review.test.ts"],
      "disposition": "fixed",
      "response": "Normalise to the bare lowercase id and grep case-insensitively; tests assert the prefixed and uppercased variants are refused.",
      "condition": { "paths": ["src/review/local.ts", "tests/local-review.test.ts"], "evidence": "pnpm typecheck && pnpm vitest run tests/local-review.test.ts, with a test asserting both the prefixed and uppercased variants are refused" },
      "conditionMet": "Ran pnpm typecheck (clean) and pnpm vitest run tests/local-review.test.ts (48 passed) at 7a6093c; the regenerated dist files fell outside the condition, so the follow-up turn below covers the commit."
    },
    {
      "id": "R02",
      "severity": "minor",
      "description": "The runbook said commits after the final follow-up may touch minor-fix paths; the code allows only condition paths and the worklog there.",
      "paths": ["docs/runbooks/independent-review.md"],
      "disposition": "fixed",
      "response": "Prose aligned to the code, plus a sentence that a condition on a source file must name generated counterparts."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "a9fc4262183f532eb",
      "commit": "7a6093ce60d032162709ec1e8d368d15f396765b",
      "outcome": "cleared",
      "elapsedMinutes": 2,
      "summary": "Cleared R01 and R02 at 7a6093c; recompiled and confirmed the committed dist matches the source; no new findings."
    }
  ]
}
```
