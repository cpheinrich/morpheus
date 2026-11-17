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
