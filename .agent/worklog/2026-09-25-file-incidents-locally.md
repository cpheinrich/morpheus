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

The reviewer verified the config against the merged engine and live private caller, then found one
substantive documentation inconsistency: the runbook, architecture, and decision record still
required the external incident repository the engine now rejects. Under the reviewer's explicit
condition, those three live documents were corrected and the required grep and focused workflow
suite passed.

```morpheus-review
{
  "version": 1,
  "base": "8d39e37e1c569368df21c0b38cced32419761bc4",
  "reviewed": "1a33afbd2c8f7c472041ec505bfced8acad4e332",
  "covered": "1a33afbd2c8f7c472041ec505bfced8acad4e332",
  "authorSession": "01a0ceaa-308b-7b11-b868-6cd419ffd711",
  "reviewerSession": "01a0da8b-67e5-76e0-9d24-e7890ba35c87",
  "risk": "normal",
  "elapsedMinutes": 7,
  "outcome": "complete",
  "summary": "The config matches the merged engine and deployed caller. The conditionally cleared documentation mismatch was corrected in the exact allowed paths, and focused verification passed.",
  "findings": [
    {
      "id": "DOC-1",
      "severity": "substantive",
      "description": "Live documentation still required the external incident routing rejected by the current engine.",
      "paths": ["docs/runbooks/osv-maintenance.md", "architecture.md", ".agent/decisions.md"],
      "disposition": "fixed",
      "response": "Removed obsolete token, configuration, and private-incident-repository instructions; documented affected-repository issues and public-safe content."
    }
  ]
}
```
