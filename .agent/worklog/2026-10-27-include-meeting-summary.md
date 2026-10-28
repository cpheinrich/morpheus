---
roadmap: MO-26-10-27-17.12.03
domains: [engineering, operations]
agents: [codex]
executors:
  - provider: openai
    requestedModel: gpt-6.1-sol
    effort: xhigh
    observedModel: unknown
---

# Include note summaries in authorized meeting texts

## What changed

Added an opt-in `includeSummary` field to an authorized meeting-intake notification profile. The
completion gate now requires a bounded, one-line journal summary for those profiles and includes it
in the formatted notice. Profiles that omit the option retain their existing output byte for byte,
so Evo's established notice remains compatible while Lakina can opt in separately.

The meeting-intake guide now documents both the profile field and the journal requirement. This is
a small domain-specific extension to the existing formatter, not a generic notification module, so
no dependency was added.

## Verification

- `pnpm exec vitest run tests/meeting-intake.test.ts` — 12 tests passed. The focused cases assert
  exact legacy Evo output, exact summary-enabled output, and refusal of missing, multiline and
  oversized summaries.
- `pnpm typecheck` — passed.
- `pnpm compile` — passed and refreshed committed `dist/` output.
- `pnpm morpheus pm index` — passed; generated indexes were already current.
- `git diff --check` — passed.

No local full-suite run: the change is confined to meeting-intake code and its focused suite; CI
owns the full suite.
