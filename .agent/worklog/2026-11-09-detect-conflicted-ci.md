---
date: 2026-11-09
roadmap: MO-26-11-09-15.13.20
tags: [engineering, devops]
---

# Refuse green CI for a conflicted pull request

Issue #616 reported green after an external check passed on a conflicted PR whose required workflows had never started. The existing Actions census cannot see a workflow GitHub never created. The same GraphQL snapshot now includes the PR mergeability value, and both the initial poll and the post-census confirmation refuse a conflict with an actionable message.

The five focused wait-ci suites passed all 236 tests. The regression covers the external-only case in both modes and a conflict first reported on the confirmation poll. The compiled CLI returned exit 3 against conflicted Morpheus PR #665. Complexity passed the enforced limit; the existing polling loop retains an advisory for cognitive complexity.

Independent review cleared the conflict check with no findings. The reviewer independently ran the three conflict regressions and confirmed that conflict detection preserves ordinary verdicts and catches a conflict that appears on the confirmation poll.

```morpheus-review
{
  "version": 2,
  "base": "9b43d1ee4ed779b28df013c4f7f20f27cca531f8",
  "reviewed": "01945f360f5f44b35c0a587656476dabb515a7ef",
  "covered": "01945f360f5f44b35c0a587656476dabb515a7ef",
  "authorSession": "01a1c292-3f10-7f40-9f9d-6a426fca2c75",
  "reviewerSession": "/root/review_conflicted_ci",
  "risk": "small",
  "elapsedMinutes": 0.8166666666666667,
  "timing": {
    "source": "clock",
    "durationMs": 49000,
    "evidence": "Controller UTC clock readings around the single collaboration reviewer invocation: 2026-11-09 23:16:38 to 23:17:27 UTC, with the terminal review received before the end reading."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the conflict check with no findings. The reviewer independently ran the three conflict regressions and confirmed that conflict detection preserves ordinary verdicts and catches a conflict that appears on the confirmation poll.",
  "findings": []
}
```
