---
roadmap: MO-26-11-17-21.03.38
tags: [engineering, devops]
---

# Allow Python CI callers to fetch Git history

Expose the pinned checkout action's fetch depth as a numeric input. Use its existing depth of
one by default. A history-aware test suite can opt into depth zero. Reuses the checkout action
and the existing workflow test harness without adding dependencies.

Verification uses the focused Python CI contract tests and actionlint.
