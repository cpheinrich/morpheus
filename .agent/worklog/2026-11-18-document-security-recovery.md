---
agent: codex
date: 2026-11-18
roadmap: MO-26-11-18-16.12.21
outcome: review
tags: [engineering, devops]
---

# Document Security PR recovery policy

The Security engine now recovers its attested drafts, retries unresolved GitHub merge states, and
isolates blocked candidates. The operator runbook and architecture describe the committed hold and
the six-hour reconciliation cadence. The reviewed implementation is
[Security engine #12](https://github.com/cpheinrich/morpheus-security/pull/12).

## Independent review

The reviewer found that a GitHub-only advisory without a fix may be absent from a receipt that prepared another candidate. The runbook now separates attempted candidate blockers recorded in the receipt from advisories without a fix that remain open. The follow-up cleared the corrected paragraph.

```morpheus-review
{
  "version": 2,
  "base": "4c1a3da957534402e980f8815ba120005a33cf0f",
  "reviewed": "f0fa0c5f8f87a72f07f2c5d6d7710bf884e5147a",
  "covered": "d15ad5f91c2e9b81de3bf127e0a118ed71d6e49b",
  "authorSession": "01a1f10b-0450-7ca1-aab8-e436a6eb8e6d",
  "reviewerSession": "/root/security_runbook_review",
  "risk": "small",
  "elapsedMinutes": 2.7666666666666666,
  "timing": {
    "source": "clock",
    "durationMs": 166000,
    "evidence": "UTC clock at initial review launch and final result read, 00:16:17 to 00:19:03."
  },
  "outcome": "complete",
  "summary": "The reviewer found that a GitHub-only advisory without a fix may be absent from a receipt that prepared another candidate. The runbook now separates attempted candidate blockers recorded in the receipt from advisories without a fix that remain open. The follow-up cleared the corrected paragraph.",
  "contextRead": [
    "AGENTS.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/osv-maintenance.md",
    "architecture.md",
    "hq/product/roadmap/MO-26-11-18-16.12.21-document-security-recovery.md",
    "hq/product/roadmap/MO-26-10-06-18.12.09-unblock-security-bot-merge.md",
    ".agent/worklog/2026-10-06-unblock-security-bot-merge.md",
    ".agent/worklog/2026-11-18-document-security-recovery.md"
  ],
  "findings": [
    {
      "id": "F01",
      "severity": "substantive",
      "description": "A GitHub-only advisory without a published fix can be absent from a private receipt when another candidate was prepared.",
      "paths": [
        "docs/runbooks/osv-maintenance.md"
      ],
      "disposition": "fixed",
      "response": "The runbook distinguishes recorded attempted blockers from open advisories without a fix.",
      "condition": {
        "paths": [
          "docs/runbooks/osv-maintenance.md"
        ],
        "evidence": "Compare the corrected paragraph against both Security prepare plan branches and run git diff --check."
      },
      "conditionMet": "Only the approved paragraph changed in d15ad5f91. Both prepare plan branches were inspected and git diff --check passed."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/security_runbook_review",
      "commit": "d15ad5f91c2e9b81de3bf127e0a118ed71d6e49b",
      "outcome": "cleared",
      "elapsedMinutes": 0.5833333333333334,
      "timing": {
        "source": "clock",
        "durationMs": 35000,
        "evidence": "UTC clock at follow-up launch and final result read, 00:19:03 to 00:19:38."
      },
      "summary": "F01 fixed. Both private plan branches were checked and git diff --check passed. No new findings."
    }
  ]
}
```
