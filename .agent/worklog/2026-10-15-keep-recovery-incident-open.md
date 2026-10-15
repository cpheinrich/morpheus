---
date: 2026-10-15
agent: codex
roadmap: MO-26-10-15-01.07.52
outcome: review
summary: Keep a controller-owned recovery incident open until exact release verification.
---

# Recovery incident closure ownership

Morpheus #398 came from Evo incident #493. Evo's repair roadmap items linked
the incident through `issues: [493]`, so Morpheus required `Closes #493` in the
worker PR. GitHub closed it at merge, five seconds before the controller's
reserved release dispatched; admission then found no open incident and stopped
before TestFlight upload. The Evo repair worklogs
`2026-10-14-repair-dataset-photo-selection.md` and
`2026-10-14-repair-picker-selection-state.md` describe the repair and focused
qualification. The incident issue itself records the merge-to-dispatch failure.

The check now accepts `issuesToKeepOpen: [493]` only as a subset of the
roadmap's linked issues. For each held issue it requires a visible `Refs #493`
and rejects visible GitHub closing keywords. Other linked issues still require
`Closes`. The PR template, project instructions, runbook, and architecture
explain the controller handoff. This is domain-specific policy, so no generic
library was needed.

The first independent review found two substantive bypasses. GitHub accepts
`Closes: #493` and its peers with a colon, but the previous detector missed
them. GitHub also closes issues from merged commit messages; a clean PR body
can carry a closing keyword in the title or branch history that becomes the
squash message. The correction recognizes colon syntax and checks the raw PR
body, title, and head-only commit messages for a held issue. It fails closed
when commit history cannot be read. These rules follow GitHub's published
[linking syntax](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
and [squash-message behavior](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests).

The regression exercises a mixed item with an ordinary issue and the live
incident: missing `Refs` is refused; `Closes`, `Fixes`, and `Resolves` are each
refused; `Closes #70` with `Refs #493` passes. Schema tests reject a held issue
that is not linked. Focused `check`, `pm`, and `init` suites passed 234 tests
before the final closing-keyword expansion; the single full local suite then
passed 2178 tests across 80 files. `pnpm typecheck`, `pnpm lint`,
`pnpm compile`, and `pnpm morpheus pm index` passed. CI will check the final
head. No live Evo release was dispatched for this Morpheus policy change.
After the reviewer correction, focused `check`, CLI check, `pm`, and `init`
tests passed 238 tests. Typecheck and lint passed. The local full suite already
ran once; CI will run the corrected head.

The codebase-memory installer could not activate in this session because
active sessions could not be stopped safely. Targeted source, tests, the Evo
worklogs, and the incident description were used as the fallback.

The initial high-risk independent review found two substantive closure bypasses: GitHub's colon keyword syntax and closing keywords in commit messages. Both were fixed, and the same reviewer cleared the correction at `2c8a43812c3abcf50282d897558958dcac8c6ed9` with no remaining findings. Final-head CI remains the release check.

```morpheus-review
{
  "version": 2,
  "base": "a55b8d550e9d8088e73ac67f2d594fd8adcbc8e8",
  "reviewed": "265f90d9a7c8e9e6d59d2abd604f158df2d7eaf5",
  "covered": "2c8a43812c3abcf50282d897558958dcac8c6ed9",
  "authorSession": "01a13e64-2d9b-7730-abce-2287983ca7aa",
  "reviewerSession": "/root/recovery_incident_review",
  "risk": "high",
  "elapsedMinutes": 2.3,
  "timing": {
    "source": "clock",
    "durationMs": 138000,
    "evidence": "clock__curr_time: initial review dispatched 2026-10-15 08:12:48 UTC; completion observed 08:15:06 UTC"
  },
  "outcome": "complete",
  "summary": "The initial high-risk independent review found two substantive closure bypasses: GitHub's colon keyword syntax and closing keywords in commit messages. Both were fixed, and the same reviewer cleared the correction at `2c8a43812c3abcf50282d897558958dcac8c6ed9` with no remaining findings. Final-head CI remains the release check.",
  "findings": [
    {
      "id": "IR-1",
      "severity": "substantive",
      "description": "GitHub accepts closing keywords followed by a colon, but the held-issue gate missed Closes: #493, Fixes: #493, and Resolves: #493.",
      "paths": ["src/check/pr.ts"],
      "disposition": "fixed",
      "response": "Recognize optional colon syntax in closingKeywordInText. Regression tests reject each colon form for a held issue. The same reviewer cleared the correction."
    },
    {
      "id": "IR-2",
      "severity": "substantive",
      "description": "A closing keyword in a PR commit message could close a held issue even when the PR body used Refs.",
      "paths": ["src/check/pr.ts", "src/cli/check.ts"],
      "disposition": "fixed",
      "response": "Inspect raw PR body, live title, and branch-only commit messages for held issues, and fail when history cannot be read. Tests cover title, commit message, unreadable history, and base/branch separation; the same reviewer cleared the correction."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/recovery_incident_review",
      "commit": "2c8a43812c3abcf50282d897558958dcac8c6ed9",
      "outcome": "cleared",
      "elapsedMinutes": 1.1,
      "timing": {
        "source": "clock",
        "durationMs": 66000,
        "evidence": "clock__curr_time: same-reviewer follow-up dispatched 2026-10-15 08:18:10 UTC; completion observed 08:19:16 UTC"
      },
      "summary": "IR-1 and IR-2 resolved; the reviewer verified colon syntax, raw body/title/commit checks, fail-closed history, workflow wiring, and the focused regressions with no remaining findings."
    }
  ]
}
```
