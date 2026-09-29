---
date: 2026-09-28
agent: codex
roadmap: MO-26-09-28-17.03.28
outcome: shipped
summary: Honor explicit human authorization after automatic review finalization.
---

# Authorized review continuation

Issue #300 reproduced while completing Evo #308. Preserve review history and all scope/timing/identity/clearance checks; only explicitly authorized subsequent turns are admitted.

Validation: pnpm typecheck; pnpm test (1,508 tests / 56 files); pnpm compile; pnpm morpheus pm index. Independent reviewer ran 84 local-review tests. After minor prompt correction, compiled again and inspected emitted review packet wording. Graph install/check could not obtain an exact-checkout index because active CBM sessions prevented safe activation; source inspection used instead.

Independent review cleared the change with one minor mirrored-guidance correction. The reviewer verified authorization, original predecessor and historical finalization scope; 84 focused tests passed. The canonical review prompt was corrected and its compiled output verified.

```morpheus-review
{
  "version": 2,
  "base": "3eb7d272be7b9389d9da53ad467783dc01b3efc5",
  "reviewed": "7f926dbbeffd7761010870ea2d6283b399dd1701",
  "covered": "9e7fb0ad4b44e266b98e48299d59ed190f40bdc9",
  "authorSession": "01a0e94b-e795-7d53-918c-639aae553693",
  "reviewerSession": "/root/authorized_review_checker",
  "risk": "normal",
  "elapsedMinutes": 1.2333333333333334,
  "timing": {
    "source": "clock",
    "durationMs": 74000,
    "evidence": "Reviewer clock readings 2026-09-29 00:06:47 UTC through 00:08:01 UTC; runner task /root/authorized_review_checker."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the change with one minor mirrored-guidance correction. The reviewer verified authorization, original predecessor and historical finalization scope; 84 focused tests passed. The canonical review prompt was corrected and its compiled output verified.",
  "findings": [
    {
      "id": "R01",
      "severity": "minor",
      "description": "Canonical reviewer prompt still required finalization to be the last turn.",
      "paths": [
        "src/review/local-prompt.ts",
        "dist/review/local-prompt.js",
        "dist/review/local-prompt.js.map"
      ],
      "disposition": "fixed",
      "response": "Updated prompt to last automatic turn with explicit authorization for each subsequent same-reviewer turn and preservation of historical scope/predecessor. pnpm compile passed; emitted packet inspected at /tmp/morpheus-300-updated-packet.txt."
    }
  ]
}
```
