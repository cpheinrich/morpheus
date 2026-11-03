# Enforce exact HQ build inventory

## Why

Kairos migration review reproduced two ways the reusable build contract could bless request-time
HQ work: any emitted `srcRoute` hid a populated route even when fallback was non-false, and the
checker compared no complete static inventory, so an undeclared exact ISR route passed. Current
pages remained correct; the permanent regression guard did not.

Codebase-memory discovery was attempted earlier in the parent migration and its transport remained
closed. The reproduced helper behavior, exact generated source, tests, and compiled output were
read directly as the documented fallback.

## Changes

- Treat an emitted source pattern as closed only when the dynamic manifest records
  `fallback === false`.
- Inventory every exact prerendered HQ URL and compare it with the declared static inventory.
- Check ISR across the actual exact inventory.
- Add the populated non-false fallback and undeclared ISR counterexamples to the generated
  executable contract test.

## Verification

- First focused run exposed one existing collision fixture that now correctly counted as an
  unexpected static URL; the fixture is restored to the ordinary manifest before exercising the
  declared live route's trace.
- `pnpm exec vitest run tests/web-scaffold.test.ts` — 33 tests passed after that correction.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm compile` — passed and refreshed committed `dist/`.
- `pnpm morpheus pm index` — indexes were current.
- Merged `origin/main` after repository-wide Markdown guard PR #597 landed; `pnpm compile` resolved
  only the generated source-map conflict, and the 33 focused tests, typecheck, and lint passed
  again on the integrated source.
