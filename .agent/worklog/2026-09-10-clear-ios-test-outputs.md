---
agent: codex
date: 2026-09-10
roadmap: MO-26-09-10-21.39.21
outcome: review
---

# Clear persistent iOS run outputs

Issues #217 and #232 describe the same resultBundlePath failure after cancellation on a
self-hosted runner. The workflow now removes only Results, Logs and Screenshots before
recreating them. SourcePackages, DerivedData and unrelated runner files remain intact.
Once preparation runs, old screenshots/logs cannot appear as evidence for the next attempt.

## Validation

- The new test executes the actual preparation shell on a fresh temporary runner, then twice
  with partial Build.xcresult/Tests.xcresult, old logs and old screenshots. It verifies empty
  output directories, surviving caches, unaffected sibling files and every exported path.
- Before the fix the test failed with both stale bundles still in Results; after the fix it passes.
- pnpm typecheck, all 1,145 tests, pnpm compile and pnpm morpheus pm index passed.
- Final integration: frozen install, lint, typecheck and131 workflow/lint-contract tests passed.
- No local full iOS suite: this changes output preparation, so the executable filesystem
  reproduction targets the failure directly without recompiling an unrelated consumer app.
- Graph tools became unavailable after the required exact-worktree bootstrap reported local
  configuration ownership conflicts. Direct workflow/test source inspection supplied evidence.

## Independent review

Independent review found no blocking issues. The single same-reviewer follow-up cleared final integration with PRs216,177,234,176; all20 focused iOS workflow tests passed under Vitest4.1.11. Two pre-existing incidental findings remain deferred: artifacts can outlive failure before preparation, and the inherited Java-action pin lacks a later macOS path-length fix. No disagreement remains. Graph access was unavailable; review used exact-head source and executable checks.

```morpheus-review
{
  "version": 1,
  "base": "3d310a4f809f659b99e05ef2ad8a74adc04e96f1",
  "reviewed": "9f6624490ffada67f181689cac2c5466520e07e9",
  "covered": "9c5035e4ba030a921b23c49e7cd14383150ca006",
  "authorSession": "01a08ebd-2cd3-7923-a70e-94bf73e90da3",
  "reviewerSession": "/root/review_ios_outputs",
  "risk": "high",
  "elapsedMinutes": 1.8,
  "outcome": "complete",
  "summary": "Independent review found no blocking issues. The single same-reviewer follow-up cleared final integration with PRs216,177,234,176; all20 focused iOS workflow tests passed under Vitest4.1.11. Two pre-existing incidental findings remain deferred: artifacts can outlive failure before preparation, and the inherited Java-action pin lacks a later macOS path-length fix. No disagreement remains. Graph access was unavailable; review used exact-head source and executable checks.",
  "findings": [
    {
      "id": "IOSOUT-I1",
      "severity": "incidental",
      "description": "A job failing before output preparation may upload artifacts left by a previous run. This predates the cleanup change.",
      "paths": [
        ".github/workflows/ios-ci.yml"
      ],
      "disposition": "deferred",
      "response": "Retained as a separate artifact-lifecycle follow-up in the automation ledger; expanding early-failure upload semantics is outside the resultBundlePath fix."
    },
    {
      "id": "IOSOUT-I2",
      "severity": "incidental",
      "description": "Inherited setup-java v6.0.0 pin lacks the subsequent macOS GPG path-length fix, affecting long self-hosted runner paths with emulators enabled.",
      "paths": [
        ".github/workflows/ios-ci.yml"
      ],
      "disposition": "deferred",
      "response": "Reported to the audit task that introduced the pin and retained separately. Upstream actions/setup-java issue1263 and PR1266 provide reproduction and fix; no causal connection to output cleanup."
    }
  ],
  "followUp": {
    "reviewerSession": "/root/review_ios_outputs",
    "commit": "9c5035e4ba030a921b23c49e7cd14383150ca006",
    "base": "103ea72f6f39beca30c7196753fa575b31e05f15",
    "outcome": "cleared",
    "elapsedMinutes": 8.2,
    "scopeReason": "Protected main advanced through216,177,234,176; use the one same-session follow-up for dependency, workflow action pins, CLI helper, and lint integration. The follow-up stayed open during coordinated merge pause and inspected the final settled head.",
    "summary": "Cleared final integration; original cleanup and regression remain intact. Twenty iOS workflow tests and workflow-test lint pass. Two incidental upstream findings are deferred."
  }
}
```
