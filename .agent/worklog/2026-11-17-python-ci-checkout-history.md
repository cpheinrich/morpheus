---
roadmap: MO-26-11-17-21.03.38
tags: [engineering, devops]
---

# Allow Python CI callers to fetch Git history

Expose the pinned checkout action's fetch depth as a numeric input. Use its existing depth of
one by default. A history-aware test suite can opt into depth zero. Reuses the checkout action
and the existing workflow test harness without adding dependencies.

Verification uses the focused Python CI contract tests and actionlint.

Independent review cleared the additive checkout input with no findings. The reviewer confirmed existing callers still fetch one commit and independently reran the nine focused workflow tests and actionlint.

```morpheus-review
{
  "version": 2,
  "base": "0a1f75ceb9bf1ad00819805a230b1c34b9df07ee",
  "reviewed": "c082ab6618fac2a1639098cb7a25a5ac9db28f6a",
  "covered": "c082ab6618fac2a1639098cb7a25a5ac9db28f6a",
  "authorSession": "01a1e7e5-bf56-79b1-8f01-c87c35f8270b",
  "reviewerSession": "1be16ea2-af1f-4f93-b082-6a81bbc3408d",
  "risk": "small",
  "elapsedMinutes": 0.6115666666666667,
  "timing": {
    "source": "clock",
    "durationMs": 36694,
    "evidence": "Factory run 91d60043-f939-46d7-9c2b-954531d08fd6. Claude session turn timestamps 2026-11-18T05:10:10.019Z through 2026-11-18T05:10:46.713Z."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the additive checkout input with no findings. The reviewer confirmed existing callers still fetch one commit and independently reran the nine focused workflow tests and actionlint.",
  "contextRead": [
    "hq/product/roadmap/MO-26-11-17-21.03.38-allow-python-ci-git-history.md",
    "hq/product/roadmap/MO-26-10-07-18.14.42-python-ci-runner-input.md",
    "hq/product/roadmap/MO-26-08-19-16.50.28-python-ci-reusable-workflow.md",
    "architecture.md",
    ".agent/worklog/2026-11-17-python-ci-checkout-history.md",
    "CLAUDE.md"
  ],
  "findings": []
}
```
