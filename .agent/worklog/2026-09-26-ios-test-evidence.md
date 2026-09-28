# Selected iOS tests and complete result evidence

Roadmap: MO-26-09-26-13.59.22

Adds opt-in selection and caller-owned result verification to the shared workflow. Full nightly
coverage remains unchanged. Structured results, exact checked-out SHA, selection and logs survive
success as well as failure. Retry success no longer erases the evidence needed for diagnosis.

Validation: 141 workflow tests passed, including executable Bash checks for literal selection
arguments, default full selection, manifest preservation, validator failure and failed export.
Actual Xcode execution will also be exercised by the Evo rollout; this reusable repository has
no native application fixture. No provider or device state changed in these tests.

Independent high-risk review conditionally cleared the change after finding late diagnostics were omitted from successful evidence and repeated workflow calls could collide on artifact names. Moved upload after both collectors and derived its name from the unique output directory. The 142 focused workflow tests, typecheck and diff check pass. No native application was executed in Morpheus; Evo rollout validates that integration.

```morpheus-review
{
  "version": 1,
  "base": "4ce7c3c49ec897c056ec98517ee82f9129327824",
  "reviewed": "feb42fc12eb7821f959fff4a8fb814c197a307c4",
  "covered": "77838fbadb21aad80954d072580a3b65208362fc",
  "authorSession": "01a0ded2-7ceb-7743-9092-7056a08f0eab",
  "reviewerSession": "/root/ios_evidence_review",
  "risk": "high",
  "elapsedMinutes": 4,
  "outcome": "complete",
  "summary": "Independent high-risk review conditionally cleared the change after finding late diagnostics were omitted from successful evidence and repeated workflow calls could collide on artifact names. Moved upload after both collectors and derived its name from the unique output directory. The 142 focused workflow tests, typecheck and diff check pass. No native application was executed in Morpheus; Evo rollout validates that integration.",
  "findings": [
    {
      "id": "IOS-EV-001",
      "severity": "substantive",
      "description": "Successful evidence upload precedes attachment and Firebase log collection.",
      "paths": [
        ".github/workflows/ios-ci.yml"
      ],
      "disposition": "fixed",
      "response": "Moved upload after both collectors, preserving always(); ordering regression passes.",
      "condition": {
        "paths": [
          ".github/workflows/ios-ci.yml",
          "tests/ios-evidence-workflow.test.ts",
          "tests/workflows.test.ts"
        ],
        "evidence": "Assert upload follows both log collectors; execute preparation twice with identical run/attempt and assert distinct artifact names; run focused workflow tests, typecheck and diff check."
      },
      "conditionMet": "142 focused workflow tests pass; preparation test verifies distinct names; upload ordering assertions, typecheck and git diff --check pass."
    },
    {
      "id": "IOS-EV-002",
      "severity": "substantive",
      "description": "Same-run reusable workflow invocations collide on the new evidence artifact name.",
      "paths": [
        ".github/workflows/ios-ci.yml"
      ],
      "disposition": "fixed",
      "response": "Use prepared unique output directory suffix; executable repeated-invocation regression passes.",
      "condition": {
        "paths": [
          ".github/workflows/ios-ci.yml",
          "tests/ios-evidence-workflow.test.ts",
          "tests/workflows.test.ts"
        ],
        "evidence": "Assert upload follows both log collectors; execute preparation twice with identical run/attempt and assert distinct artifact names; run focused workflow tests, typecheck and diff check."
      },
      "conditionMet": "142 focused workflow tests pass; preparation test verifies distinct names; upload ordering assertions, typecheck and git diff --check pass."
    }
  ]
}
```
