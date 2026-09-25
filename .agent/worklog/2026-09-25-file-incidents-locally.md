# MO-26-09-25-14.43.18 — File incidents locally

## Outcome

- Removed Morpheus's `incidentRepository` override so malware incident issues are filed in this
  repository by the shared Morpheus Security engine.
- Kept the required-check allowlist and narrow bot review waiver unchanged.

## Verification

- Parsed `.github/morpheus-security.json` as JSON.
- `morpheus pm index`
- `morpheus pm validate`
- `pnpm typecheck`
- `pnpm test` — 51 files, 1,386 tests passed

## Independent review

The config matches the merged engine and deployed caller. The conditionally cleared documentation mismatch was fixed within the allowed paths and verified, and the same reviewer cleared the later PR-metadata-only integration at 26b146f.

```morpheus-review
{
  "version": 1,
  "base": "8d39e37e1c569368df21c0b38cced32419761bc4",
  "reviewed": "1a33afbd2c8f7c472041ec505bfced8acad4e332",
  "covered": "26b146f1196f6e972e97f70a607c41722446a9a9",
  "authorSession": "01a0ceaa-308b-7b11-b868-6cd419ffd711",
  "reviewerSession": "01a0da8b-67e5-76e0-9d24-e7890ba35c87",
  "risk": "normal",
  "elapsedMinutes": 7,
  "outcome": "complete",
  "summary": "The config matches the merged engine and deployed caller. The conditionally cleared documentation mismatch was fixed within the allowed paths and verified, and the same reviewer cleared the later PR-metadata-only integration at 26b146f.",
  "findings": [
    {
      "id": "DOC-1",
      "severity": "substantive",
      "description": "Live documentation still required the external incident routing rejected by the current engine.",
      "paths": [
        "docs/runbooks/osv-maintenance.md",
        "architecture.md",
        ".agent/decisions.md"
      ],
      "disposition": "fixed",
      "response": "Removed obsolete token, configuration, and private-incident-repository instructions; documented affected-repository issues and public-safe content.",
      "condition": {
        "paths": [
          "docs/runbooks/osv-maintenance.md",
          "architecture.md",
          ".agent/decisions.md"
        ],
        "evidence": "The obsolete-routing grep must return no matches and pnpm exec vitest run tests/workflows.test.ts must pass."
      },
      "conditionMet": "Commit 098695e changed only the conditioned paths plus the task worklog; the obsolete-routing grep returned no matches and the focused workflow suite passed all 137 tests."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "01a0da8b-67e5-76e0-9d24-e7890ba35c87",
      "commit": "26b146f1196f6e972e97f70a607c41722446a9a9",
      "scopeReason": "Late PR metadata integration required by morpheus check pr after the conditional documentation clearance.",
      "outcome": "cleared",
      "elapsedMinutes": 3,
      "summary": "Verified the conditioned documentation fix and evidence, then confirmed the later commit changed only the roadmap status and PR number required for open PR #278."
    }
  ]
}
```
