# MO-26-09-25-10.04.40 — Extract security remediation

## Outcome

- Replaced Morpheus's internal OSV/remediation workflows with a committed opt-in policy discovered
  by the centrally operated `cpheinrich/morpheus-security` workflow. Morpheus stores no App
  private key or repository schedule.
- Removed the duplicated resolver implementation and its workflow-specific tests.
- Declared the four live protected checks as merge gates and routed public-repository malware
  records to the private `cpheinrich/morpheus-security-incidents` repository.
- Kept Morpheus's bot marker, dependency-only scope, and review-waiver enforcement in
  `src/security/policy.ts` and `src/check/pr.ts`.

## Verification

- `pnpm typecheck`
- `pnpm test` — 51 files, 1,386 tests passed after scanner-only test removal
- `pnpm compile`
- JSON parse and `git diff --check`

## Independent review

The pre-integration review cleared `f1e46d98164c3f5a52f7367e06ea0d4be11ded1e` (session
`01a0d9a2-94ab-7ca1-b7dd-3e707b9d2325`). Final trunk-integrated review found that the local bot
allowlist omitted `pnpm-workspace.yaml`, which would have blocked a valid transitive pnpm repair,
and that scanner-only helpers remained after their caller moved upstream. Both were fixed. The
same reviewer cleared `db880725c233000972728efb9711991ab19bcf6e` after 237 focused tests with no
new findings; the full 1,386-test suite also passed.

Final review found and resolved a missing pnpm-workspace.yaml bot-waiver path and obsolete local scanner code. Same-reviewer follow-up cleared db880725c233000972728efb9711991ab19bcf6e with 237 focused tests and no new findings.

```morpheus-review
{
  "version": 1,
  "base": "59eedf1af445db6f587aa0822aedff52e88dae2a",
  "reviewed": "c591b14d6d951b3ebe3240a69447da33c530cf74",
  "covered": "db880725c233000972728efb9711991ab19bcf6e",
  "authorSession": "01a0ceaa-308b-7b11-b868-6cd419ffd711",
  "reviewerSession": "01a0da61-779e-7bd1-9ba9-e785295cc108",
  "risk": "high",
  "elapsedMinutes": 6,
  "outcome": "complete",
  "summary": "Final review found and resolved a missing pnpm-workspace.yaml bot-waiver path and obsolete local scanner code. Same-reviewer follow-up cleared db880725c233000972728efb9711991ab19bcf6e with 237 focused tests and no new findings.",
  "findings": [
    {
      "id": "SEC-006",
      "severity": "substantive",
      "description": "The dependency-only allowlist omitted pnpm-workspace.yaml, so valid transitive pnpm remediation would fail the required conventions check.",
      "paths": ["src/security/policy.ts", "src/check/pr.ts", "tests/security-policy.test.ts", "tests/check.test.ts", "dist/security/policy.js", "dist/security/policy.d.ts", "dist/security/policy.js.map"],
      "disposition": "fixed",
      "response": "Added pnpm-workspace.yaml to the narrow allowlist, added an exact marked-bot PR regression, regenerated dist, and passed focused and full suites."
    },
    {
      "id": "SEC-007",
      "severity": "minor",
      "description": "Scanner-only parsing, version, path, and finding helpers remained after the standalone extraction removed their production caller.",
      "paths": ["src/security/policy.ts", "tests/security-policy.test.ts", "dist/security/policy.js", "dist/security/policy.d.ts", "dist/security/policy.js.map"],
      "disposition": "fixed",
      "response": "Removed dead scanner source, tests, and generated declarations while retaining only the PR-waiver policy."
    }
  ],
  "followUp": {
    "reviewerSession": "01a0da61-779e-7bd1-9ba9-e785295cc108",
    "base": "59eedf1af445db6f587aa0822aedff52e88dae2a",
    "commit": "db880725c233000972728efb9711991ab19bcf6e",
    "scopeReason": "Verify SEC-006 and SEC-007 fixes and their generated output without expanding the extraction scope.",
    "outcome": "cleared",
    "elapsedMinutes": 2,
    "summary": "Both findings resolved; 237 focused tests passed and no new findings were introduced."
  }
}
```
