---
date: 2026-11-17
roadmap: MO-26-11-17-01.05.07
tags: [engineering, devops]
summary: Make Oxlint the Morpheus JavaScript and TypeScript lint default.
---

# Default Morpheus lint to Oxlint

The [CI pilot](../../docs/ci-speed.md) measured ESLint and Oxlint on the same
source. Used the migrator's explicit rules for the root lint scope and replaced
the ESLint version test with executable examples that assert diagnostics.
Fresh Next.js apps get an app-local config and lint script. Existing apps
keep control of their lint files through scaffolding. Shared CI continues to
invoke the caller's script.

The first install selected 1.94.0 and proposed minimum-release-age exemptions
for the native packages. Pinned 1.93.0 and regenerated the lock from the original
lockfile under the current policy. No new policy exemptions were needed.
The first review also linted optional consumer-auth output. Kept the scaffold's
valid status roles and scoped the control-character regex exception to
`lib/auth/safe-next.ts`, where it intentionally rejects unsafe URLs.

## Verification

- `pnpm lint`
- `pnpm exec vitest run tests/lint-contract.test.ts tests/web-scaffold.test.ts tests/consumer-auth.test.ts tests/web-provision.test.ts tests/profile/classify.test.ts tests/workflows.test.ts` passed 345 tests covering lint, generated apps, optional consumer auth, and the workflow callers.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`, and `morpheus complexity check` passed.
- The full suite runs through the required Node job on GitHub.

## Independent review

Independent review verified the root rules, file scope, and package install. It found that the new defaults rejected some optional consumer-auth scaffold output. The follow-up verified the scoped config correction, preserved template output, and mutation-tested both exceptions.

```morpheus-review
{
  "version": 2,
  "base": "96b577330357e391037f406287a59ff8fb8b977f",
  "reviewed": "f4c6730c9cc0b8d8329db80634d07fadd09837a0",
  "covered": "e4c3f72d635ecc1cbf57b0426aa2a7abdc96747b",
  "authorSession": "01a1e7e5-bf56-79b1-8f01-c87c35f8270b",
  "reviewerSession": "f5b05dba-53d3-410c-a3a3-983df454c57c",
  "risk": "normal",
  "elapsedMinutes": 2.9944,
  "timing": {
    "source": "runner",
    "durationMs": 179664,
    "evidence": "Claude Code result event for Factory run b60121ca-b031-4137-9468-187d292d51d1 reported duration_ms=179664."
  },
  "outcome": "complete",
  "summary": "Independent review verified the root rules, file scope, and package install. It found that the new defaults rejected some optional consumer-auth scaffold output. The follow-up verified the scoped config correction, preserved template output, and mutation-tested both exceptions.",
  "contextRead": [
    "AGENTS.md",
    "architecture.md",
    "docs/ci-speed.md",
    "docs/runbooks/website.md",
    ".agent/decisions.md",
    ".agent/worklog/2026-11-17-default-to-oxlint.md",
    ".agent/worklog/2026-08-19-add-consumer-auth.md",
    "hq/product/roadmap/MO-26-11-17-01.05.07-default-to-oxlint.md",
    "hq/product/roadmap/MO-26-08-19-00.39.34-add-consumer-auth.md"
  ],
  "findings": [
    {
      "id": "F1-consumer-auth",
      "severity": "substantive",
      "description": "The generated lint configuration rejected three valid status roles in the consumer-auth templates and the control-character regex in safe-next.",
      "paths": [
        "src/web/templates.ts",
        "tests/consumer-auth.test.ts"
      ],
      "disposition": "fixed",
      "response": "Accepted valid status roles and exempted the intentional regex in lib/auth/safe-next.ts. The test lints the actual generated app and rejects the same pattern in a separate file."
    },
    {
      "id": "F2-redundant-rules",
      "severity": "minor",
      "description": "Sixteen entries repeated the disabled default for TypeScript files.",
      "paths": [
        ".oxlintrc.json"
      ],
      "disposition": "fixed",
      "response": "Removed the redundant entries. The root still checks 287 source files with the 24 migrated rules."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "3d45de18-ee98-4e7b-b287-e8fb0bced389",
      "commit": "e4c3f72d635ecc1cbf57b0426aa2a7abdc96747b",
      "outcome": "cleared",
      "elapsedMinutes": 1.4147,
      "timing": {
        "source": "runner",
        "durationMs": 84882,
        "evidence": "Claude Code result event for Factory run e0603d90-ba8d-4d6f-94e5-232b478bd353 reported duration_ms=84882."
      },
      "handoff": {
        "reason": "Factory does not expose resumption of a completed fresh reviewer.",
        "findings": [
          "F1-consumer-auth",
          "F2-redundant-rules"
        ]
      },
      "summary": "Verified clean lint of 53 generated auth app files. Removing each exception reproduced its original diagnostics. The follow-up passed 74 focused tests and confirmed the generated distribution."
    }
  ]
}
```
