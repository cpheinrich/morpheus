# Incomplete review continuation — 2026-10-30

Claim: MO-26-10-30-14.55.14. Christopher clarified that asking for human authorization merely
to let the original reviewer finish an incomplete review was unintentional. The prior rule
caused cpheinrich's SMS broker review to pause after its first turn lacked final UI captures,
even though the original reviewer and an ordinary follow-up slot were available. Christopher
authorized that specific continuation, which cleared the PR, and requested this lasting policy
change.

The validator now allows a same-reviewer continuation after an incomplete initial or follow-up
turn while the ordinary three-turn cap has room. It still requires the reviewer to clear the
covered commit, preserves `initialOutcome: incomplete`, keeps the original reviewer identity,
rejects over-budget turns and under-floor reviews, and requires human authorization for extra
turns beyond the cap and after finalization. AGENTS, the canonical reviewer prompt, runbook,
architecture and decisions now say the same thing. No dependency was added; the change is to
Morpheus's existing Zod/Git review validator.

Checks: `vitest run tests/local-review.test.ts` passed 148 tests; `vitest run tests/review.test.ts`
passed 79 tests; `pnpm typecheck` and `pnpm compile` passed. `pnpm morpheus pm index` hit a sandbox
permission error when `tsx` attempted its IPC pipe, so the compiled CLI ran `node dist/cli/index.js
pm index` successfully with no index changes. Independent review and CI follow.

The fresh independent reviewer of `587efb1` found REV-1: a zero-duration template placeholder
for an incomplete initial turn could be rescued by a later 30-second clearance, bypassing the
existing positive-duration invariant. It also found REV-2: one runbook sentence omitted
`incomplete` from permissible nonfinal follow-up outcomes. The author now rejects zero elapsed
duration for every turn of a resumed incomplete initial review, with regression cases for the
initial turn and an intermediate incomplete turn. The runbook sentence includes `incomplete`.
Focused review tests now pass 150/150, and typecheck and compile pass again. The original
reviewer will inspect this correction in an ordinary follow-up.
