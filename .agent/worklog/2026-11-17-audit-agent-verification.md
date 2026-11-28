---
date: 2026-11-17
roadmap: MO-26-11-17-01.56.52
tags: [engineering, devops, research]
---

# Audit agent verification, review, and automation

Compared the three Claude Code posts with Morpheus's policy, its worklogs, and selected
records from managed consumers. [The audit](../../qa/audits/2026-11-17-agent-verification-review-automation.md)
ranks a trusted-base review decision first, followed by an Evo journey and Darwin receipt
checks, a review evaluation, automation outcome reporting, Lakina replays, and recovery drills.
The public audit uses public evidence and synthetic examples. Private project source references
and the local fixture reproduction stay in the author's local evidence appendix.

A disposable CLI fixture returned exit 1 for missing independent review and exit 0 with a
project-policy waiver after a candidate policy change. No hosted validation or merge was
attempted. A read-only count of recorded reviews gives a pool for a real evaluation. It cannot
measure recall or escape rates. Historical schedule migrations were checked against current
tracked project settings before interpreting them.

## Validation

- `pnpm typecheck` and `pnpm compile` passed. No generated runtime output changed.
- `pnpm exec vitest run tests/check.test.ts tests/local-review.test.ts tests/scheduler.test.ts tests/meeting-intake.test.ts`
  passed 353 focused tests covering the controls cited in the report.
- The local CLI policy fixture reproduced both expected verdicts. The corpus script reproduced
  identical output on a second invocation.
- Offline selected project checks passed: Evo pipeline map 8, Darwin Operations Desk 52,
  Lakina execution replay 13 and scheduler registry 5. Evo's preliminary partial archive omitted
  some test inputs. The rerun with those tracked inputs passed all eight.
- Validated public report links and anchors, the roadmap/index, and the diff.
- No production actions, provider-side fault injections, or subscription benchmark runs were
  needed. The ranked pilots are proposed follow-up work.

## Independent review

The fresh independent reviewer cleared the audit with one minor finding. It reproduced both CLI verdicts, matched the corpus output byte for byte, and checked the source and publication boundaries. The author clarified that the Evo journey and Darwin delivery checks are two paired pilots. Hosted acceptance is outside this audit.

```morpheus-review
{
  "version": 2,
  "base": "b7ebe5c7db2d1c411868ba359745139b559fe32f",
  "reviewed": "3c9d2af2d0b61343ec2ad2b99dbb1a62cf812942",
  "covered": "c0b6fbee344cd3f04672df795e7d54465cf52a55",
  "authorSession": "01a1e8ee-5131-7a11-bf34-a05e67fd8d67",
  "reviewerSession": "/root/audit_reviewer",
  "risk": "small",
  "elapsedMinutes": 3.0701666666666667,
  "timing": {
    "source": "clock",
    "durationMs": 184210,
    "evidence": "Author clock readings immediately before reviewer launch and upon observing the final verdict. Unix milliseconds 1794910168110 to 1794910352320."
  },
  "outcome": "complete",
  "summary": "The fresh independent reviewer cleared the audit with one minor finding. It reproduced both CLI verdicts, matched the corpus output byte for byte, and checked the source and publication boundaries. The author clarified that the Evo journey and Darwin delivery checks are two paired pilots. Hosted acceptance is outside this audit.",
  "contextRead": [
    "AGENTS.md",
    ".agent/context-core.md",
    ".agent/decisions.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/scheduler.md",
    "docs/runbooks/test-quality.md",
    "docs/runbooks/infra-dashboard-design.md",
    "hq/product/roadmap/MO-26-11-17-01.56.52-audit-agent-verification.md",
    ".agent/worklog/2026-11-17-audit-agent-verification.md",
    ".agent/worklog/2026-10-28-profiling-round-2.md",
    ".agent/worklog/2026-10-06-preserve-required-pr-checks.md",
    ".agent/worklog/2026-10-15-keep-recovery-incident-open.md",
    ".agent/worklog/2026-11-10-orient-reviewers-context.md"
  ],
  "findings": [
    {
      "id": "AUD-1",
      "severity": "minor",
      "description": "Reviewer R1: The opening and second recommendation promised tracing the Evo journey through Darwin, although the planned checks can pass independently.",
      "paths": [
        "qa/audits/2026-11-17-agent-verification-review-automation.md"
      ],
      "disposition": "fixed",
      "response": "Clarified the opening and recommendation heading to describe the two paired pilots and kept the separate success criteria."
    }
  ]
}
```
