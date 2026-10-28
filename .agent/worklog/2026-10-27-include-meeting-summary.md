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

## Independent review

Independent normal-risk review found one substantive backward-compatibility issue and cleared it
on an exact condition. Summary validation had applied even to profiles that did not opt in, so an
extraneous malformed summary could block an Evo-style notice. The bounded correction moves that
validation inside the opt-in branch and adds an exact-output regression for an opted-out profile.
All condition evidence passed.

```morpheus-review
{
  "version": 2,
  "base": "c6a81a5345ef4709a3480f3a0d016a3a94c4e9a2",
  "reviewed": "515306de45c9703f905f37b771f0ef5cb75ab449",
  "covered": "2314d515105e31c78876c5bc101596218e8133a9",
  "authorSession": "01a17f15-284b-7731-888a-14a5ef62d00f",
  "reviewerSession": "/root/meeting_summary_notice_review",
  "risk": "normal",
  "elapsedMinutes": 1.5710166666666667,
  "timing": {
    "source": "clock",
    "durationMs": 94261,
    "evidence": "Author clock immediately before reviewer invocation: 1793146491874 ms since epoch; immediately after the reviewer result: 1793146586135 ms since epoch. Includes invocation and wait time."
  },
  "outcome": "complete",
  "summary": "Independent normal-risk review found one substantive opt-in compatibility issue; the exact conditional correction now ignores malformed summary data for profiles that did not request summaries, and all focused evidence passed.",
  "findings": [
    {
      "id": "MI-1",
      "severity": "substantive",
      "description": "The new summary field was validated for opted-out profiles, so a legacy journal with an extraneous multiline or oversized summary could block an otherwise valid Evo-style notice.",
      "paths": [
        "src/meeting-intake/core.ts",
        "tests/meeting-intake.test.ts"
      ],
      "disposition": "fixed",
      "response": "Moved summary parsing and bounds checks into the includeSummary branch and added an exact legacy-output regression with malformed summary data.",
      "condition": {
        "paths": [
          "src/meeting-intake/core.ts",
          "tests/meeting-intake.test.ts",
          "dist/meeting-intake/core.js",
          "dist/meeting-intake/core.js.map"
        ],
        "evidence": "Confine the fix to the four named paths; prove opted-out malformed summary data preserves exact legacy output; run the focused test, typecheck, compile and git diff --check."
      },
      "conditionMet": "Commit 2314d515 changes only the four allowed paths. The focused meeting-intake suite passed 12/12 including exact legacy output with a multiline summary; typecheck, compile and git diff --check passed."
    }
  ]
}
```
