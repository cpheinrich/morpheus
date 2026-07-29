---
date: 2026-07-29
agent: claude
roadmap: MO-038
outcome: shipped
summary: Brand prose templates broke on real answers; the fix reached main through another session's PR.
---

## The bug was in the test fixture

Four prose templates in `src/brand/generate.ts` rendered badly the first time a project ran
`brand build` with full answers. Each was correct against the two-word examples in `questions.ts`
and wrong against the answers those questions actually ask for:

- `voice.md` case-folded `primaryAudience`, turning `GLP-1` into `glp-1`, and spliced it
  mid-sentence so the answer's own terminal period met the template's comma as `.,`
- `README.md` joined eleven `never` clauses with `", "`; each contains its own commas, so the
  guardrails dissolved into one unparseable 90-word sentence
- `visual-system.md` and `README.md` pointed at a `tokens.json` that `plan()` deliberately does
  not write when `visualSource` is set — the document contradicted its own package's resolution
- `strategy.md` used `feels.slice(0, 2)` in its test sentence while listing all three above it

The suite passed on all four, because the fixture was shaped like the examples too. **A fixture
copied from the docstring examples tests the examples, not the feature.** The real fix was adding
a `REAL_ANSWERS` fixture — multi-clause audience, `never` entries containing commas, three
adjectives. Five of six new tests fail against the old generator; verified by stashing.

The rule that came out of it, now a comment in `generate.ts`: interpolate an answer as its own
block or bullet, never mid-sentence and never case-folded. Answers are prose the owner wrote,
not tokens to splice.

## The dead end was procedural, and cost more than the bug

A second session was working in the same `~/morpheus` checkout on `mo-039`. It switched the
shared working copy to its branch mid-flight, so this fix committed onto *their* branch as
`b5e6efe`. Resolving it by cherry-picking to the right branch (`b244220`) rather than rewriting
their history left the same change on both — and #32 merged first, carrying the source fix to
`main` without the roadmap item that describes it.

The result: `main` had the code and no record of it, and this branch had the record and a fix
that was already applied. Rebasing onto `main` reduced the fix commit to a no-op, which is what
confirmed the code had fully landed. This PR carries only the record.

**`AGENTS.md` already says one git worktree per parallel session.** It says it because of this.
A cherry-pick is the polite resolution and it still leaves the board wrong — the cost is not the
merge conflict, it is that an item can ship with nothing on the roadmap pointing at it. Nobody
would have noticed except that a hand-off doc flagged the collision.
