---
id: MO-26-07-29-038
title: "Brand prose templates break on real answers"
status: shipped
priority: P1
owner: agent
prs: [32, 36]
created: 2026-07-29
updated: 2026-07-30
---

> Migrated from `MO-038` to `MO-26-07-29-038` (MO-057). References to `MO-038` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## The code already shipped, in #32

This item's four template fixes are on `main` — `src/brand/generate.ts`, `src/brand/package.ts`,
and `tests/brand.test.ts` are byte-identical between this branch and `main`. They rode in on
[#32](https://github.com/cpheinrich/morpheus/pull/32) because two sessions shared one checkout:
the fix was committed while the working copy sat on `mo-039-kit-design-token-pipeline-one-generator`,
and cherry-picking it back to this branch left the change on both. #32 merged first and carried it.

So this PR adds only the record. It is the case `morpheus pm ship <ID>` names — work that shipped
without a PR the board could see — except that the item file itself never reached `main` either,
which is why it needs a PR rather than a `pm ship` on a clean tree.

Nothing here is unverified: the fixes were tested before the merge (228 passing, typecheck clean)
and are what generated Evo's current `hq/brand/` package. The rebase onto `main` applied the
source half of the fix commit as a no-op, which is the confirmation.

The lesson is the one `AGENTS.md` already states: one git worktree per parallel session. This
item is the cost of not doing it.

## It uses MO-043's waiver, deliberately

`MO-043` merged while this item's PR was open, and its `hasNoSubstantiveChange` rule fires on
that PR — correctly. The branch stakes `MO-038` and does none of `MO-038`'s work, which is the
shape that wrongly shipped MO-010 and MO-015.

Both remedies the error offers were considered and neither fits:

- **A branch staking no id** passes the check, but then `MO-038.md` reaches `main` with nothing
  ever marking it shipped. That trades the board-runs-ahead failure for the board-lags one.
- **`pm ship MO-038`** is the right tool for work that shipped without a PR the board could see,
  except the item file never reached `main` either, so there is no clean tree to run it against.

So `records-only:` is used. The distinction from MO-010 is that merging marks MO-038 shipped and
MO-038 genuinely is shipped — the rule exists to stop a *false* shipped, not a true one recorded
late. `prs:` reads `[32]` rather than the recording PR's own number, because #32 is where the code
actually landed and that is the attribution worth keeping.

## Context

Evo is the first project to run `brand build` with full, considered answers, and four of the
generated prose templates render badly. Every one of them is fine against the short example
answers in `questions.ts` and wrong against the answers the questions actually ask for.

That is the pattern worth naming: the examples are two-word phrases, the prompts demand
descriptions, and the templates were written against the examples.

**1. `voice.md` lowercases and collides with the audience sentence.** `generate.ts:77` renders
`${a.primaryAudience.toLowerCase()}`, producing from Evo's answer:

> If a sentence would embarrass you said out loud to self-directed adults early in a **glp-1**
> journey — … their full-time identity**.,**
> rewrite it.

`GLP-1` → `glp-1` destroys a proper noun; the answer's terminal period meets the template's
comma as `.,`; and the frame assumes a short noun phrase while `primaryAudience` is prompted
with "A description beats a demographic". A good answer is guaranteed to break this sentence.

**2. `README.md`'s review test is unreadable.** `generate.ts:372` joins `never` with `", "`.
Entries are clauses that contain their own commas, so eleven guardrails render as one 90-word
sentence in which the boundaries between them dissolve completely.

**3. `visual-system.md` points at a file that deliberately does not exist.** When `visualSource`
is set, `plan()` correctly skips `tokens.json` — but `visualSystem()` does not branch, so the
prose still says "Primitives live in `tokens.json`" and "Promote it to `tokens.json`". The
generated document contradicts the package's own resolution, and `brand status` reports the
same file as `→ canonical at <source>`.

**4. `strategy.md` silently drops the third adjective.** `generate.ts:40` uses
`a.feels.slice(0, 2).join(" and ")`, so Evo's test reads "does not read as bright and
intelligent" while the bullets directly above list all three. `feels` accepts 2–5.

## Approach

Fix each at the template, not at the answer — `voice.md` and `visual-system.md` are `seeded`,
so a project that patches its own prose then gets reported as disagreeing with its answers.

1. Drop `toLowerCase()` and restructure so the audience is not spliced mid-sentence. Trim a
   trailing period from any interpolated answer.
2. Render `never` as a bulleted list wherever there is more than one entry.
3. Branch `visualSystem()` on `visualSource` the same way `plan()` does — point at the declared
   source, not at `tokens.json`.
4. Use every adjective in the test sentence.

Tests should assert against answers shaped like the prompts ask for — a multi-clause audience
description, `never` entries containing commas, three adjectives — since the current suite
passes on all four bugs.
