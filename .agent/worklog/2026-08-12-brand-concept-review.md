---
date: 2026-08-12
roadmap: MO-26-08-12-17.00.05
---

# Default brand concept review workflow

Kairos made the missing handoff visible: a thoughtful visual review can settle
imagery, materiality, layout, typography, and density, then lose all but a
palette and a display font when the result is transcribed into a generic brand
record. The new Morpheus path therefore begins with a free-form `vibes.txt`
brief plus raw visual reference material, produces a durable five-direction
`research/brand.html` review, and only writes canonical package records after
a person selects a direction or explicit hybrid.

The review has a lightweight portable contract rather than a prescribed web
framework: metadata declares the concept count and required views; stable
concept and view attributes make the declaration inspectable. This lets the
agent create an expressive static page while Morpheus still detects a page
that claims five directions but contains only a thin board.

The final package adds `moodboards.md`, `imagery.json`, and
`application.md`. The last is intentionally a validator boundary: every
approved imagery id has to be mapped to a public-web or product surface, so a
home page cannot silently flatten a selected brand into neutral tokens and
generic copy. Raw moodboard files stay local by default; the selected board's
source/provenance and approved delivery asset keys become the durable record.

## Verification

- `pnpm exec vitest run tests/brand-workflow.test.ts tests/onboarding.test.ts tests/init.test.ts`:
  90 tests passed.
- `pnpm test`: 801 tests passed across 27 files.
- `pnpm typecheck` and `pnpm compile`: passed; committed `dist/` artifacts
  regenerated.
- Exercised `morpheus brand init` in a temporary directory and confirmed it
  creates the brief, moodboard, research, asset, and agent-handoff files
  without writing `answers.md`.
- Exercised `morpheus brand finalize --selection` before a review existed and
  confirmed it fails closed with the exact missing review path.
- `git diff --check`: clean.
- New public-project scaffolds now include a compact `brand-review` agent skill,
  so the visual-first workflow remains discoverable after the initial handoff.

The first PR CI pass caught stale compiled copies of the removed legacy brand
modules. Local `tsc` does not clean `dist/`, while the reusable CI workflow
does, so the old `dist/brand/{answers,answers-md,generate,questions}.*`
artifacts were deleted and the clean-build check was repeated.

`pnpm lint` could not run because this package does not declare or install an
`eslint` executable; the repository's CI does not currently provide a lint
script dependency for this package. That is a pre-existing tooling gap, not
silently treated as a passing check.

## Follow-up: scaffold the input instead of asking people to remember it

The workflow already had the correct local input boundary:
`hq/brand/moodboard/` is created with a tracked README while every other item
inside it is Git-ignored. The refinement is to invoke that workflow from
ordinary `morpheus init` for company and personal projects, removing the empty
brand placeholder and the separate command a founder could forget. The manual
`morpheus brand init` command remains useful as an idempotent repair or
retrofit path, and the initializer preserves an existing `vibes.txt` rather
than replacing a real brief.

The safe-upgrade path also appends only missing moodboard ignore rules to an
older Morpheus `.gitignore`; it does not replace a repository's existing
ignore policy or duplicate rules that are already present.
